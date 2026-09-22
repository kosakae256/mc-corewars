"""**ゲームが出した文句を読む**（ContentLog）。

    python tools/pve3-log.py            # 最新のログの、うちのパックのエラー
    python tools/pve3-log.py --all      # Molang のエラーも全部

仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 12-1。

## なぜ要るのか

> ### **ゲームは、読み込めなかった物を黙って捨てる**（2026-09-09 に気付いた）
>
> **実体が 1 個読み込まれなくても、画面には何も出ない。**
> **`spawnEntity` して初めて「is not a valid entity type」と分かる。**
> **property が全部消えても、見た目が切り替わらないだけで、理由は分からない。**
>
> **ContentLog には、その理由が 1 行で書いてある。**
> **直す前に、まずここを読む。**

**置き場**: `%APPDATA%/Minecraft Bedrock/logs/ContentLog<日付>.txt`
"""

import io
import os
import re
import sys

LOGS = os.path.join(os.environ.get("APPDATA", ""), "Minecraft Bedrock", "logs")
MINE = "pve_v3"


def newest():
    if not os.path.isdir(LOGS):
        return None
    files = [os.path.join(LOGS, f) for f in os.listdir(LOGS) if f.startswith("ContentLog")]
    return max(files, key=os.path.getmtime) if files else None


def main() -> int:
    show_all = "--all" in sys.argv
    p = newest()
    if p is None:
        print("log ga nai:", LOGS)
        return 0
    print("--", os.path.basename(p))
    seen = []
    for line in io.open(p, encoding="utf-8", errors="replace"):
        if "[error]" not in line:
            continue
        if MINE not in line:
            continue
        if not show_all and "[Molang]" in line:
            # **Molang は同じ行が何百回も出る。** 名前だけ拾う
            m = re.search(r"-(entity/[^ |]+)", line)
            tag = f"[Molang] {m.group(1) if m else '?'}"
            if tag not in seen:
                seen.append(tag)
            continue
        # 置き場の長い道は落とす
        text = re.sub(r"^\d\d:\d\d:\d\d", "", line).strip()
        text = re.sub(r".*development_behavior_packs.pve_v3 \| ", "", text)
        text = re.sub(r".*development_resource_packs.pve_v3 \| ", "", text)
        if text not in seen:
            seen.append(text)
    for x in seen:
        print(" ", x)
    print(f"--- {len(seen)} ken ---")
    return 0


if __name__ == "__main__":
    sys.exit(main())
