"""性能表の「実装」欄を、実物に合わせて付け直す。

    python tools/pve3-planmark.py            # 見るだけ
    python tools/pve3-planmark.py --write    # 書き込む

仕様は `worlds/pve-v3/docs/07-enemy-plan.md` 6 章。

## なぜ道具にするのか

> ### **手で付けると、必ずずれる**
>
> **50 体を何人かで手分けして作ると、表の「実装」欄だけが取り残される。**
> **同じファイルを同時に編集して壊れることもある。**

**実物を見て決める。** **表に書かれた `id` の実体ファイルが 3 つとも揃っていれば「済」。**

| 見るもの | |
| --- | --- |
| **表の値** | `core/roster/star<★>.ts` にその `id` があるか |
| **ビヘイビア** | `behavior_packs/pve_v3/entities/<id>.json` があるか |
| **見た目** | `resource_packs/pve_v3/entity/<id>.entity.json` があるか |

**「確認」欄は触らない**——**あれは人が動かして OK を出した印**（`07-enemy-plan.md` 6 章）。
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3")
PLAN = os.path.join(ROOT, "worlds", "pve-v3", "docs", "07-enemy-plan.md")
ROSTER = os.path.join(PACK, "scripts", "core", "roster")
BP = os.path.join(PACK, "behavior_packs", "pve_v3", "entities")
RP = os.path.join(PACK, "resource_packs", "pve_v3", "entity")


def made():
    """**実物が揃っている id。** 3 つとも無いと「済」にしない"""
    got = set()
    if not os.path.isdir(ROSTER):
        return got
    for f in sorted(os.listdir(ROSTER)):
        if not f.startswith("star"):
            continue
        s = io.open(os.path.join(ROSTER, f), encoding="utf-8").read()
        for eid in re.findall(r"^  ([a-z0-9_]+): \{", s, re.M):
            if os.path.exists(os.path.join(BP, f"{eid}.json")) and os.path.exists(
                os.path.join(RP, f"{eid}.entity.json")
            ):
                got.add(eid)
    return got


def main() -> int:
    write = "--write" in sys.argv
    have = made()
    s = io.open(PLAN, encoding="utf-8").read()
    out = []
    changed = []
    for ln in s.split("\n"):
        # **表の行だけ見る。** `| 名前 | `id` | …` の形
        m = re.match(r"^\| (.+?) \| `([a-z0-9_]+)` \|", ln)
        if m is None:
            out.append(ln)
            continue
        cells = ln.split("|")
        # **末尾から 3 つが 採用 / 実装 / 確認**（行末の空セルを除く）
        if len(cells) < 5:
            out.append(ln)
            continue
        eid = m.group(2)
        want = "**済**" if eid in have else ""
        if cells[-3].strip() == want:
            out.append(ln)
            continue
        cells[-3] = f" {want} " if want else "  "
        changed.append((m.group(1).strip("* "), eid, want or "（消した）"))
        out.append("|".join(cells))
    print(f"jissou: {len(have)} tai")
    for name, eid, want in changed:
        print(f"  {name} ({eid}) -> {want}")
    if not changed:
        print("  kawaranai")
        return 0
    if write:
        io.open(PLAN, "w", encoding="utf-8", newline="\n").write("\n".join(out))
        print("kaita:", os.path.relpath(PLAN, ROOT))
    else:
        print("(--write de kakikomu)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
