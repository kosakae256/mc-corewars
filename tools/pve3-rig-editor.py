"""スティーブの全身アニメーションをブラウザーで作成する。仕様: spec/27-rig-editor.md。"""

import argparse
import io
import json
import secrets
import subprocess
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from rig_preview.assets import scene
from rig_preview.editor_store import EditorStore
from rig_preview.raster import render
from rig_preview.timeline import sample, validate

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "worlds/pve-v3/packs/pve_v3"
RP = PACKAGE / "resource_packs/pve_v3"
WEB = ROOT / "tools/rig_preview/web"


class App:
    def __init__(self):
        self.token = secrets.token_urlsafe(32)
        self.store = EditorStore(RP, ROOT / "out/shotgun-rig/editor-backups")
        self.lock = threading.Lock()
        self.deployment = {"running": False, "message": "", "ok": None}

    def deploy(self):
        """チェック成功後だけ配置。停止・再入場の操作はしない。"""
        out = ROOT / "out/shotgun-rig"
        log = out / "editor-deploy.log"
        out.mkdir(parents=True, exist_ok=True)
        try:
            env = (PACKAGE / ".env").read_text(encoding="utf-8")
            if not any(line.strip() in ("PROJECT_NAME=pve_v3", 'PROJECT_NAME="pve_v3"') for line in env.splitlines()):
                raise ValueError("配置先の PROJECT_NAME を確認できません。")
            paths = json.loads(subprocess.check_output(["node", str(ROOT / "tools/rig_preview/deploy_paths.cjs")],
                               cwd=PACKAGE, creationflags=subprocess.CREATE_NO_WINDOW))
            for value in paths["local"]:
                if not Path(value).resolve().is_relative_to(PACKAGE.resolve()) or Path(value).resolve() == PACKAGE.resolve():
                    raise ValueError(f"掃除するパスが作業範囲外です: {value}")
            for value in paths["collateral"]:
                resolved = Path(value).resolve()
                if resolved.name != "pve_v3" or resolved.parent.name not in ("development_behavior_packs", "development_resource_packs"):
                    raise ValueError(f"配置先の範囲が不正です: {value}")
            with log.open("w", encoding="utf-8") as stream:
                for task, label in [("check", "パックを検査しています…"), ("local-deploy", "ゲームへ配置しています…")]:
                    self.deployment.update(message=label)
                    result = subprocess.run(["npm.cmd", "run", task], cwd=PACKAGE, stdout=stream,
                                            stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
                    if result.returncode:
                        raise ValueError(f"{task} が失敗しました。ログ: {log}")
            self.deployment.update(ok=True, message="配置しました。Minecraftのワールドに入り直してください。")
        except Exception as error:
            self.deployment.update(ok=False, message=str(error))
        finally:
            self.deployment["running"] = False


APP = App()


class Handler(BaseHTTPRequestHandler):
    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError):
            pass

    def log_message(self, format, *args):
        pass

    def reply(self, body, content_type="application/json", status=200):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            content = (WEB / "index.html").read_text(encoding="utf-8").replace("__TOKEN__", APP.token)
            self.reply(content.encode("utf-8"), "text/html; charset=utf-8")
        elif path in ("/editor.js", "/editor.css", "/timeline.js"):
            self.reply((WEB / path[1:]).read_bytes(), "text/javascript" if path.endswith("js") else "text/css")
        elif path == "/api/state":
            self.reply(APP.store.load())
        elif path == "/api/deployment":
            self.reply(APP.deployment)
        else:
            self.reply({"error": "見つかりません"}, status=404)

    def do_POST(self):
        if self.headers.get("X-Rig-Token") != APP.token:
            self.reply({"error": "画面を再読み込みしてください。"}, status=403)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 2097152:
                raise ValueError("リクエストの大きさが不正です。")
            data = json.loads(self.rfile.read(length))
            path = urlparse(self.path).path
            if path == "/api/preview":
                loaded = APP.store.load()
                time = float(data.get("time", 0))
                if not 0 <= time <= 300:
                    raise ValueError("時刻が範囲外です。")
                body = validate(data["body"], {b["name"].lower() for b in loaded["bones"]["body"]})
                item = validate(data["item"], {b["name"].lower() for b in loaded["bones"]["item"]})
                clips = {"animation.pve3.gun.hold": sample(body, time),
                         "animation.pve3.gun_item.shotgun": sample(item, time)}
                camera = data["camera"]
                yaw, pitch, span = (float(camera[k]) for k in ("yaw", "pitch", "span"))
                if not -360 <= yaw <= 360 or not -89 <= pitch <= 89 or not 18 <= span <= 60:
                    raise ValueError("カメラの値が範囲外です。")
                faces, _ = scene(RP, overrides=clips, show_item=bool(data.get("show_item", True)))
                picture, _ = render(faces, yaw=yaw, pitch=pitch, span=span, center=(0, 17, -3), size=480)
                buffer = io.BytesIO()
                picture.save(buffer, format="PNG")
                self.reply(buffer.getvalue(), "image/png")
            elif path in ("/api/save", "/api/deploy"):
                with APP.lock:
                    if APP.deployment["running"]:
                        raise ValueError("配置中です。完了してから保存してください。")
                    saved = APP.store.save(data["clips"], data["revisions"])
                    if path == "/api/deploy":
                        APP.deployment.update(running=True, ok=None, message="検査を開始します…")
                        threading.Thread(target=APP.deploy, daemon=True).start()
                    self.reply(saved)
            else:
                self.reply({"error": "見つかりません"}, status=404)
        except (ValueError, KeyError, TypeError, OSError) as error:
            self.reply({"error": str(error)}, status=400)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()
    url = f"http://127.0.0.1:{args.port}"
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError:
        if not args.no_open:
            from urllib.request import urlopen
            try:
                existing = json.load(urlopen(url + "/api/state", timeout=2))
                if "bones" not in existing or "clips" not in existing:
                    raise ValueError("別のサーバーが使っています。")
            except Exception:
                raise RuntimeError(f"ポート {args.port} を使用できません。--port で別の番号を指定してください。")
            webbrowser.open(url)
            print(f"Opened existing editor: {url}", flush=True)
            return
        raise
    print(f"Rig editor: {url}", flush=True)
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
