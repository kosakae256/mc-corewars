"""アニメの配線を展開して、**いつ・どの骨が動くか**を並べる。

    python tools/pve3-anim.py                 # 全部
    python tools/pve3-anim.py --quiet         # 気になるものだけ（`npm run check` はこれ）
    python tools/pve3-anim.py crusher         # その実体だけ
    python tools/pve3-anim.py crusher --bone rightarm

仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 6-7。

## なぜ道具にするのか

> ### **アニメの間違いは、エラーを出さない**
>
> **`pve3-rpcheck.py` は「その名前が存在するか」までしか見ない。**
> **存在する正しい名前を、間違った条件で流していても、何も言われない。**

**実際に踏んだもの**（2026-09-08）:

| 症状 | 正体 |
| --- | --- |
| **腕を上げたまま向かってくる** | `controller.animation.humanoid.bow_and_arrow` が **`query.has_target` だけで**入る。**弓は関係ない** |
| **ゾンビのような動き** | `animation.zombie.attack_bare_hand` が混ざっていた |
| **人型に見えない** | 模型に `texture_width` が無く、貼り位置が総崩れ |

**どれも「ゲームを開くまで分からない」ものだった。** **開かずに分かるようにする。**

## 何をするか

```
実体ファイルの scripts.animate（または animation_controllers）
      ↓ 制御をたどる（状態・遷移・入れ子）
流れうるアニメの名前を、条件つきで全部集める
      ↓ 実体の animations 表で本体に解決する
そのアニメが動かす骨を読む
      ↓
「骨 ← アニメ ← 条件」の一覧にする
```

**そのうえで、危ないものに印を付ける。**

| 印 | 意味 |
| --- | --- |
| `AYASHII` | **その敵の持ち物と噛み合わない条件で入る**（弓を持たないのに弓のアニメ、など） |
| `DARE MO IRENAI` | **誰も入れていない変数**を読んでいる（＝ 0 のまま。動かないか、既定に落ちる） |
| `NAI` | 制御が流そうとしている名前が、実体の `animations` に無い |
"""

import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VANILLA = os.path.join(ROOT, "bedrock-samples", "resource_pack")
MINE = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3")
BP = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3", "behavior_packs", "pve_v3", "entities")

# **engine が入れる値。** ここに無い変数は「誰も入れていない」
#
# > **`variable.*` は、書かなければ 0。** **エラーにならない。**
# > **だから「読んでいるのに誰も入れていない」を見つけるのが要る。**
ENGINE_VARS = {
    "variable.attack_time",
    "variable.swim_amount",
    "variable.charge_amount",
    "variable.gliding_speed_value",
    "variable.is_holding_left",
    "variable.is_holding_right",
    "variable.is_first_person",
    "variable.is_paperdoll",
    "variable.map_face_icon",
    "variable.bob_animation",
    "variable.is_sneaking",
    "variable.is_alive",
}

# **その持ち物を見張っている印。** **条件にこれが出ていれば、縛れている**
GUARDS = {
    "bow": ["'minecraft:bow'", "== 'bow'"],
    "spear": ["melee_spear_equipped", "is_brandishing_spear"],
    "crossbow": ["'minecraft:crossbow'", "== 'crossbow'"],
    "shield": ["'shield'"],
    "spyglass": ["spyglass"],
    "goat_horn": ["goat_horn"],
    "brush": ["'brush'"],
}

# **持ち物が要る動き。** **持っていないのに入るなら、おかしい**
NEEDS_ITEM = {
    "bow_and_arrow": "bow",
    "charging": "bow",
    "brandish_spear": "spear",
    "crossbow_controller": "crossbow",
    "melee_spear_controller": "spear",
    "shield_block_main_hand": "shield",
    "shield_block_off_hand": "shield",
    "holding_spyglass": "spyglass",
    "tooting_goat_horn": "goat_horn",
    "holding_brush": "brush",
    "brushing": "brush",
}


def load(path):
    """コメント付き JSON を読む（バニラは `//` と末尾カンマを含む）"""
    s = io.open(path, encoding="utf-8", errors="replace").read()
    out, i, n, instr, esc = [], 0, len(s), False, False
    while i < n:
        ch = s[i]
        if instr:
            out.append(ch)
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                instr = False
            i += 1
            continue
        if ch == '"':
            instr = True
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n and s[i + 1] == "/":
            while i < n and s[i] != "\n":
                i += 1
            continue
        if ch == "/" and i + 1 < n and s[i + 1] == "*":
            i += 2
            while i + 1 < n and not (s[i] == "*" and s[i + 1] == "/"):
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    return json.loads(re.sub(r",(\s*[}\]])", r"\1", "".join(out)))


def collect(kind):
    """バニラとこちらから、`animations` / `animation_controllers` を全部集める"""
    key = "animations" if kind == "animations" else "animation_controllers"
    got = {}
    for base in (VANILLA, MINE):
        d = os.path.join(base, kind)
        if not os.path.isdir(d):
            continue
        for root, _, files in os.walk(d):
            for f in files:
                if not f.endswith(".json"):
                    continue
                try:
                    got.update(load(os.path.join(root, f)).get(key) or {})
                except Exception:
                    pass
    return got


ANIMS = collect("animations")
CTRLS = collect("animation_controllers")


def bones_of(anim):
    """そのアニメが動かす骨と、式"""
    out = {}
    for bone, ch in (anim.get("bones") or {}).items():
        bits = []
        for what in ("rotation", "position", "scale"):
            if what in ch:
                bits.append(f"{what}={json.dumps(ch[what], ensure_ascii=False)}")
        out[bone.lower()] = " ".join(bits)
    return out


def andc(a, b):
    """条件をつなぐ"""
    got = [x for x in (a, b) if x not in (None, "", "1", True)]
    return " && ".join(str(x) for x in got) if got else "itsudemo"


def walk(entry, cond, seen, out, depth=0):
    """
    `animate` の 1 つをたどる。

    **中身は 3 通り**: 制御の名前 ／ アニメの名前 ／ `{名前: 条件}`。
    **制御は入れ子になる**——制御が別の制御を流すことがある。
    """
    if isinstance(entry, dict):
        for name, c in entry.items():
            walk(name, andc(cond, c), seen, out, depth)
        return
    name = entry
    if (name, cond) in seen or depth > 8:
        return
    seen.add((name, cond))
    out.append((name, cond, depth))


def expand(anim_names, ctrl_names, animate, out):
    """
    `animate` を、流れうるアニメまで展開する。

    > ### **名前の空間が 2 つある**（実測・2026-09-08）
    > 
    > **1.8.0 の `animation_controllers` は `{短い名前: 制御}` の配列**、
    > **`animations` は `{短い名前: アニメ}`。** **同じ短い名前が両方にあり得る**
    > （スケルトンの `brandish_spear` は、制御にもアニメにもある）。
    >
    > **`animate` の並びは「制御 → アニメ」の順で引く。**
    > **制御の中の名前は「アニメ → 制御」の順で引く**——さもないと自分自身に戻る。
    """
    stack = []
    walk_out = []
    for e in animate:
        walk(e, None, set(), walk_out)
    stack.extend([(n, c, d, True) for n, c, d in walk_out])
    seen = set()
    while stack:
        name, cond, depth, top = stack.pop(0)
        order = (ctrl_names, anim_names) if top else (anim_names, ctrl_names)
        real = order[0].get(name)
        if real is None:
            real = order[1].get(name)
        if real is None:
            out.append((name, None, cond, depth, "NAI"))
            continue
        if real in CTRLS:
            ctrl = CTRLS[real]
            for state, body in (ctrl.get("states") or {}).items():
                # **その状態に入る条件**（どの遷移から来るか）
                ins = []
                if state == ctrl.get("initial_state"):
                    ins.append("hajime")
                for other, obody in (ctrl.get("states") or {}).items():
                    for tr in obody.get("transitions") or []:
                        for to, c in tr.items():
                            if to == state:
                                ins.append(c)
                gate = " || ".join(sorted(set(ins))) if ins else "todokanai"
                for a in body.get("animations") or []:
                    if isinstance(a, dict):
                        for an, c in a.items():
                            key = (an, andc(andc(cond, gate), c), depth + 1, False)
                            if key not in seen:
                                seen.add(key)
                                stack.append(key)
                    else:
                        key = (a, andc(cond, gate), depth + 1, False)
                        if key not in seen:
                            seen.add(key)
                            stack.append(key)
            continue
        if real in ANIMS:
            out.append((name, real, cond, depth, None))
            continue
        out.append((name, real, cond, depth, "NAI"))


def borrowed_from(animate, names=None):
    """
    **その配線は、バニラの実体を丸写ししたものか。**

    > ### **写したものは、バニラの癖もそのまま持つ**
    >
    > **こちらが組んだ配線の間違いと、バニラ由来の癖は、分けて見ないといけない。**
    > **`animate` が丸ごと一致すれば、写したものと分かる。**

    > ### **こちらが足した分は、数に入れない**（**踏んだ**・2026-09-09）
    >
    > **鼓舞の印**（`controller.animation.pve3.roused`）**を全部の敵に足したら、
    > 丸写しの一致が崩れて、12 体が急に「弓を持たないのに弓のアニメ」と言われた。**
    > **足したのはこちらの配線**——**バニラ由来かどうかの判定には混ぜない。**
    """
    animate = [x for x in animate if "pve3" not in json.dumps((names or {}).get(x if isinstance(x, str) else list(x)[0], ""))]
    want = json.dumps(animate, sort_keys=True)
    d = os.path.join(VANILLA, "entity")
    if not os.path.isdir(d):
        return None
    for f in sorted(os.listdir(d)):
        if not f.endswith(".json"):
            continue
        try:
            de = load(os.path.join(d, f))["minecraft:client_entity"]["description"]
        except Exception:
            continue
        a = (de.get("scripts") or {}).get("animate")
        if a is not None and json.dumps(a, sort_keys=True) == want:
            return f.split(".")[0]
    return None


def plan(de):
    """
    **その実体で流れうるアニメを、順番どおりに返す。**

    `[(短い名前, 本体の名前, 条件, 深さ, 印), ...]`

    **`pve3-render.py` もこれを使う**——**見る道具と描く道具が、同じ配線を読む。**
    """
    names = de.get("animations") or {}
    scripts = de.get("scripts") or {}
    animate = scripts.get("animate") or []
    ctrls = {}
    for x in de.get("animation_controllers") or []:
        if isinstance(x, dict):
            ctrls.update(x)
        else:
            ctrls[x] = x
    if not animate and ctrls:
        animate = list(ctrls)
    out = []
    if animate:
        expand(names, ctrls, animate, out)
    return out


def gear_of(entity_id):
    """その敵が手に持つもの。**装備表から読む**"""
    f = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3",
                     "behavior_packs", "pve_v3", "loot_tables", "gear", f"{entity_id}.json")
    if not os.path.exists(f):
        return set()
    try:
        d = load(f)
    except Exception:
        return set()
    got = set()
    for pool in d.get("pools") or []:
        for e in pool.get("entries") or []:
            got.add(str(e.get("name", "")).replace("minecraft:", ""))
    return got


def report(path, only_bone, quiet=False):
    doc = load(path)
    de = doc["minecraft:client_entity"]["description"]
    ident = de["identifier"]
    eid = ident.split(":")[-1]
    scripts = de.get("scripts") or {}
    out = plan(de)
    if not out:
        return 0
    animate = scripts.get("animate") or list(
        {k for x in (de.get("animation_controllers") or []) if isinstance(x, dict) for k in x}
    )

    gear = gear_of(eid)
    borrowed = borrowed_from(animate, de.get("animations") or {})
    # **script が入れる変数**（`pre_animation` / `initialize` で代入しているもの）
    mine_vars = set()
    for line in (scripts.get("pre_animation") or []) + (scripts.get("initialize") or []):
        mine_vars.update(f"variable.{m}" for m in re.findall(r"(?:variable|v)\.([a-z_0-9]+)\s*=", str(line)))

    rows = []
    ng = 0
    for name, real, cond, _depth, err in sorted(out):
        if err == "NAI":
            rows.append(("NAI", name, real or "-", cond, "seigyo ga nagasu na wo, animations ni motanai"))
            ng += 1
            continue
        anim = ANIMS[real]
        bones = bones_of(anim)
        if only_bone and only_bone.lower() not in bones:
            continue
        txt = json.dumps(anim, ensure_ascii=False)
        used = set(re.findall(r"(?:variable|v)\.[a-z_0-9]+", txt)) | set(re.findall(r"(?:variable|v)\.[a-z_0-9]+", str(cond)))
        used = {u.replace("v.", "variable.") for u in used}
        dead = sorted(u for u in used if u not in ENGINE_VARS and u not in mine_vars)
        flags = []
        need = NEEDS_ITEM.get(name)
        # **条件そのものが持ち物を見ているなら、それでよい**
        # （`query.is_item_name_any('slot.weapon.mainhand', 'minecraft:bow')` など）
        guarded = need is not None and any(g in str(cond) for g in GUARDS.get(need, []))
        if need is not None and not guarded and not any(need in g for g in gear):
            if borrowed is None:
                flags.append(f"AYASHII: {need} wo motanai noni hairu")
                ng += 1
            else:
                # > **バニラの配線をそのまま写した実体は、バニラの癖もそのまま持つ。**
                # > **例: ゾンビは目標を見つけると両腕を前に出す**（`bow_and_arrow` が
                # > `query.has_target` だけで入る）——**それがバニラのゾンビの動き。**
                flags.append(f"VANILLA {borrowed} NARI: {need} nashi de hairu")
        if dead:
            flags.append("DARE MO IRENAI: " + ", ".join(dead))
        rows.append(("", name, real, cond, " / ".join(sorted(bones)) + ("  << " + " | ".join(flags) if flags else "")))

    moto = f"  <- vanilla {borrowed} no haisen wo utsushita" if borrowed else ""
    if quiet:
        # **`npm run check` から呼ぶとき。** **印の付いた行だけ出す**
        # **数える印だけ。** `DARE MO IRENAI` や `VANILLA ... NARI` は出さない
        keep = [r for r in rows if r[0] != "" or "AYASHII" in r[4]]
        if keep:
            print(f"=== {ident}{moto}")
            for mark, name, real, cond, note in keep:
                print(f"  {mark:4}{name:26} -> {real}")
                print(f"      itsu : {cond}")
                print(f"      hone : {note}")
        return ng
    print(f"=== {ident} ({os.path.basename(path)})  mochimono={sorted(gear) or 'nashi'}{moto}")
    for mark, name, real, cond, note in rows:
        head = f"{mark:4}{name:26} -> {real}"
        print(f"  {head}")
        print(f"      itsu : {cond}")
        print(f"      hone : {note}")
    print()
    return ng


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only_bone = None
    quiet = "--quiet" in sys.argv
    if "--bone" in sys.argv:
        only_bone = sys.argv[sys.argv.index("--bone") + 1]
    d = os.path.join(MINE, "entity")
    files = sorted(f for f in os.listdir(d) if f.endswith(".entity.json"))
    if args:
        files = [f for f in files if f.split(".")[0] in args]
    ng = 0
    for f in files:
        try:
            ng += report(os.path.join(d, f), only_bone, quiet)
        except Exception as e:  # noqa: BLE001
            print(f"YOMENAI {f}: {e}")
            ng += 1
    print(f"--- {len(files)} ken / kininaru {ng} ken ---")
    return 1 if ng else 0


if __name__ == "__main__":
    raise SystemExit(main())
