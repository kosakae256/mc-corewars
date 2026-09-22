"""genlab のサーバー（`docs/spec/08-genlab.md`）。

    .venv/Scripts/python.exe server.py            → http://127.0.0.1:8770/

- `/`            画面（static/index.html）
- `/generate`    SSE。`?text=犬&steps=2&solid=1`。段が終わるたびに 1 イベント
- `/health`      モデルの読み込み状況と VRAM
- `/palette`     ブロック名 → RGB（画面が立方体を塗るのに使う）

**127.0.0.1 にだけ bind する**（spec 4 章）。認証は無い。
生成は 1 本ずつ直列に流す（GPU は 1 枚。同時に走らせても速くならない）。
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.concurrency import iterate_in_threadpool

from pipeline.run import Pipeline, palette_rgb

HERE = Path(__file__).resolve().parent
PORT = 8770

app = FastAPI(title="genlab")
pipeline = Pipeline()
ready = {"loaded": False, "error": None}
# 直列化。2 人が同時に押しても GPU の取り合いにしない
gpu_lock = threading.Lock()


@app.on_event("startup")
def _load_models() -> None:
    def work() -> None:
        try:
            pipeline.load()
            ready["loaded"] = True
            print("[genlab] models loaded:", {k: round(v, 1) for k, v in pipeline.load_seconds.items()})
        except Exception as e:  # noqa: BLE001 — 起動時の失敗は画面に出したい
            ready["error"] = repr(e)
            print("[genlab] load failed:", repr(e))

    # 読み込みに数十秒かかるので、サーバーの起動をブロックしない
    threading.Thread(target=work, daemon=True).start()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(HERE / "static" / "index.html")


@app.get("/palette")
def palette() -> JSONResponse:
    return JSONResponse(palette_rgb())


@app.get("/health")
def health() -> JSONResponse:
    info = {"loaded": ready["loaded"], "error": ready["error"], "load_seconds": pipeline.load_seconds, "profiles": pipeline.profiles_loaded(), "profile": pipeline.profile}
    try:
        import torch

        free, total = torch.cuda.mem_get_info()
        info["vram_used_gb"] = round((total - free) / 2**30, 2)
        info["vram_total_gb"] = round(total / 2**30, 2)
        info["gpu"] = torch.cuda.get_device_name(0)
    except Exception as e:  # noqa: BLE001
        info["gpu_error"] = repr(e)
    return JSONResponse(info)


def _sse(event: dict) -> str:
    return "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"


@app.get("/generate")
async def generate(
    text: str = Query(..., min_length=1, max_length=4000),
    steps: int = Query(4, ge=1, le=8),
    solid: int = Query(0, ge=0, le=1),
    seed: int | None = Query(None),
    size: int = Query(40, ge=8, le=80),
    style: str = Query("auto", pattern="^(auto|creature|object|food|plant)$"),
    profile: str = Query("v1", pattern="^(v1|v2|v3)$"),
    ja: str = Query("", max_length=200),
) -> StreamingResponse:
    async def stream():
        if not ready["loaded"]:
            yield _sse({"stage": "error", "message": "モデルを読み込み中です。/health を見てください", "detail": ready["error"]})
            return
        if not gpu_lock.acquire(blocking=False):
            yield _sse({"stage": "error", "message": "別の生成が走っています。終わるまで待ってください"})
            return
        try:
            # 生成は同期・GPU 拘束なのでスレッドプールで回し、段ごとに送る
            async for ev in iterate_in_threadpool(pipeline.run(text, steps=steps, solid=bool(solid), seed=seed, size=size, style=style, profile=profile, text_ja=ja)):
                yield _sse(ev)
        except Exception as e:  # noqa: BLE001 — 何が起きたかを画面に出す
            yield _sse({"stage": "error", "message": repr(e)})
        finally:
            gpu_lock.release()

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/build")
def build(
    text: str = Query(..., min_length=1, max_length=4000),
    size: int = Query(40, ge=8, le=80),
    steps: int = Query(4, ge=1, le=8),
    style: str = Query("auto", pattern="^(auto|creature|object|food|plant)$"),
    seed: int | None = Query(None),
    detail: str = Query("", max_length=4000),
    profile: str = Query("v1", pattern="^(v1|v2|v3)$"),
    ja: str = Query("", max_length=4000),
) -> JSONResponse:
    """bridge 用。SSE ではなく、終わってから 1 つの JSON を返す（`worlds/ai-build-quiz/docs/spec/13-transport.md` 6 章）。

    `style` は定型の指定（creature / object / food / plant）。単語リストの kind から bridge が決めて渡す（WordNet の判定を上書き）。
    `profile` は生成プロファイル（v1 sd-turbo / v2 SDXL-Turbo。docs/spec/08-genlab.md 2-1b）。v2 の初回は読み込みで 20 秒かかる。
    `ja` は日本語のプロンプト（v3 用。単語の ja、出題モードはお題＋詳細）。他のプロファイルでは無視。
    `detail` は出題モードの「詳細」（日本語のまま）。**text と別々に翻訳して "text, detail" に繋ぐ**（まとめて機械翻訳に通すと壊れる。2026-09-22）。
    """
    if not ready["loaded"]:
        return JSONResponse({"error": "loading", "detail": ready["error"]}, status_code=503)
    if not gpu_lock.acquire(blocking=False):
        return JSONResponse({"error": "busy"}, status_code=429)
    try:
        if detail.strip():
            text = f"{pipeline.translator.translate(text)}, {pipeline.translator.translate(detail)}"[:4000]
        result: dict = {}
        stages: dict = {}
        for ev in pipeline.run(text, steps=steps, solid=False, seed=seed, style=style, size=size, profile=profile, text_ja=ja):
            stages[ev["stage"]] = round(float(ev["seconds"]), 3)
            if ev["stage"] == "translate":
                result["english"] = ev["english"]
                result["prompt"] = ev["prompt"]  # 定型を当てた最終プロンプト（出題モードの発表で見せる）
            if ev["stage"] == "voxel":
                result.update({k: ev[k] for k in ("size", "palette", "voxels", "count")})
            if ev["stage"] == "done":
                result["out_dir"] = ev["out_dir"]
        result["seconds"] = stages
        return JSONResponse(result)
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": repr(e)}, status_code=500)
    finally:
        gpu_lock.release()


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
