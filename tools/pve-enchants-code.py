"""エンチャントのデータを TypeScript に書き出す。

    python tools/pve-enchants-code.py worlds/pve/packs/pve

**出どころは `tools/pve_enchant_table.py`。**
書き出し先: `scripts/features/bow/enchants/list.ts`

**ここにあるのはデータだけ**（`docs/spec/11-structure.md` 2-1）。
何が起きるかは `features/bow/enchants/effects.ts`。
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pve_enchant_table import enchants  # noqa: E402

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve/packs/pve"
OUT = os.path.join(ROOT, "scripts", "features", "bow", "enchants", "list.ts")

HEAD = '''/**
 * エンチャントの一覧（**26 種**）。
 *
 * 仕様は `docs/spec/20-enchants.md`。
 *
 * > ### このファイルは書き出したもの。**手で直さない。**
 * >
 * > 出どころは `tools/pve_enchant_table.py`。
 * > **直したらもう一度走らせる**（`python tools/pve-enchants-code.py`）。
 */

/** エンチャントの名前 */
export type EnchantKey =
'''


def main() -> int:
    es = enchants()
    out = [HEAD]
    for i, e in enumerate(es):
        out.append(f'  {"|" if i else "|"} "{e["key"]}"\n')
    out.append(";\n\n")
    out.append('''/** どの軸を動かすか（`docs/spec/20-enchants.md` 3 章） */
export type EnchantAxis =
  | "power"
  | "spread"
  | "pierce"
  | "homing"
  | "bounce"
  | "explode"
  | "charge"
  | "element"
  | "support"
  | "gain";

/** エンチャント 1 つの持ち物 */
export interface EnchantInfo {
  readonly key: EnchantKey;
  readonly label: string;
  /** 共通か、弓だけか */
  readonly scope: "common" | "bow";
  /** 段の上限（1〜5） */
  readonly max: number;
  readonly axis: EnchantAxis;
  /** 説明欄に出す一言 */
  readonly about: string;
}

export const ENCHANT_LIST: readonly EnchantInfo[] = [
''')
    for e in es:
        about = e["what"].replace("**", "").replace('"', '\\"')
        out.append(
            "  {\n"
            f'    key: "{e["key"]}",\n'
            f'    label: "{e["name"]}",\n'
            f'    scope: "{e["scope"]}",\n'
            f'    max: {e["max"]},\n'
            f'    axis: "{e["axis"]}",\n'
            f'    about: "{about}",\n'
            "  },\n"
        )
    out.append("];\n")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("".join(out))
    print(f"書いた: {OUT}  （{len(es)} 種）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
