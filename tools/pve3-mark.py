"""性能表の「確認」欄に印を付ける。

    python tools/pve3-mark.py bat slime      # その id を「確」にする
    python tools/pve3-mark.py --list         # いまの状況

仕様は `worlds/pve-v3/docs/07-enemy-plan.md` 6 章。

## なぜ道具にするのか

> ### **手で書き換えると、別の表まで壊す**（実測・2026-09-09）
>
> **性能表（6 章）とデザイン表（7 章）は、どちらも `| 名前 | id | …` で始まる。**
> **行の形だけで探すと、デザイン表の最後の列まで「確」に置き換わる。**
> **実際に壊した。**

**この道具は 6 章の中だけを触る。** **7 章には入らない。**
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = os.path.join(ROOT, "worlds", "pve-v3", "docs", "07-enemy-plan.md")
CHECKED = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3", "scripts", "core", "checked.ts")

# **性能表の列数**（`| 名前 | id | 見た目 | HP | 力 | 速 | 攻速 | 押 | エメ | 備考 | 採用 | 実装 | 確認 |`）
CELLS = 13


def write_checked(ids):
    """**性能表の「確」を、そのまま `scripts/core/checked.ts` に写す。**

    **表と実装がずれないように、こちらから書く**——**手で足さない。**
    """
    old = io.open(CHECKED, encoding="utf-8").read()
    head = old[: old.index("export const CHECKED")]
    body = "".join(f'  "{i}",\n' for i in sorted(ids))
    got = head + "export const CHECKED: ReadonlySet<string> = new Set([\n" + body + "]);\n"
    if got != old:
        io.open(CHECKED, "w", encoding="utf-8", newline="\n").write(got)
        print("checked.ts:", len(ids), "tai")


def main() -> int:
    want = {a for a in sys.argv[1:] if not a.startswith("-")}
    show = "--list" in sys.argv or not want
    s = io.open(PLAN, encoding="utf-8").read()
    # **6 章だけを切り出す**——7 章（デザイン表）には入らない
    head = s.index("## 6. 性能表")
    tail = s.index("## 7. デザイン表")
    body, rest = s[head:tail], s[tail:]

    out, star, done, todo, sure = [], None, [], [], []
    for ln in body.split("\n"):
        m = re.match(r"### 6-(\d)\. ★(\d)", ln)
        if m is not None:
            star = int(m.group(2))
        row = re.match(r"^\| (.+?) \| `([a-z0-9_]+)` \|", ln)
        cells = ln.split("|")
        # **列の数が合わない行は、性能表の行ではない**
        if star is None or row is None or len(cells) != CELLS + 2:
            out.append(ln)
            continue
        eid = row.group(2)
        name = row.group(1).strip("* ")
        if eid in want and cells[-3].strip() == "**済**":
            cells[-2] = " **確** "
            ln = "|".join(cells)
            done.append(eid)
        if cells[-2].strip() == "**確**":
            sure.append(eid)
        else:
            todo.append(f"★{star}:{eid} {name}")
        out.append(ln)

    if done:
        io.open(PLAN, "w", encoding="utf-8", newline="\n").write(s[:head] + "\n".join(out) + rest)
    write_checked(sure)
    missing = want - set(done)
    if missing:
        print("mitsukaranai:", " ".join(sorted(missing)))
    if done:
        print("kakunin:", " ".join(done))
    if show or done:
        print(f"mada {len(todo)} tai")
        for t in todo:
            print("  ", t)
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
