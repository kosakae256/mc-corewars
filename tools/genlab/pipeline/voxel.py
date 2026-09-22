"""③ 占有＋色 → `{ palette, voxels }`（**純粋関数。torch にも Minecraft にも依存しない**）。

`docs/spec/08-genlab.md` 2-3。

入力は numpy の配列だけ:
- `occ`   (N, N, N) bool   … 詰まっているか。**軸の並びは (x, y, z) で y が上**（i23d.py が揃えて渡す）
- `rgb`   (N, N, N, 3) 0〜255 … その点の色

出力は Minecraft 側にそのまま渡す形:
- `palette`  ["air", "red_wool", …]
- `voxels`   8,000 文字。添字 = y*400 + z*20 + x。**下の層から順**に並ぶ

`python -m pipeline.voxel` で自己テストが走る（torch 不要）。
"""

from __future__ import annotations

import numpy as np

from .palette import AIR, BLOCKS, DIGITS

SIZE = 20  # 20 × 20 × 20（docs/spec/08-genlab.md 0 章）


# factor³ のうち、これ以上が詰まっていたら 1 にする（2×2×2 なら 4/8 = 多数決）。
# TripoSR のときは 2/8 に緩めていた（タイヤが消えたため）が、Hunyuan3D の形は元が締まっているので
# 緩めると**太って溶けた見た目**になる（犬で確認、2026-09-21）。呼び出し側が min_sub で選ぶ
MIN_SUBCELLS = {2: 4, 3: 14}
MIN_SUBCELLS_THIN = {2: 2, 3: 5}  # 細い部品を残したいとき（TripoSR）


def downsample_majority(occ: np.ndarray, factor: int, min_sub: int | None = None) -> np.ndarray:
    """(N,N,N) の占有を factor³ ごとに数えて (N/f, N/f, N/f) に落とす。

    細い部品（脚・柱・タイヤ）が単純な間引きで消えるのを減らすため、
    細かい格子で問い合わせてから数える（2-2「解像度」）。閾値は min_sub（既定は MIN_SUBCELLS）。
    """
    n = occ.shape[0]
    assert occ.shape == (n, n, n) and n % factor == 0, f"shape={occ.shape}, factor={factor}"
    m = n // factor
    blocks = occ.reshape(m, factor, m, factor, m, factor)
    counts = blocks.sum(axis=(1, 3, 5))
    k = min_sub if min_sub is not None else MIN_SUBCELLS.get(factor, max(1, factor**3 // 2))
    return counts >= k


def downsample_color(rgb: np.ndarray, occ_fine: np.ndarray, factor: int) -> np.ndarray:
    """色は**詰まっている点だけ**の平均にする。空気の色（意味の無い値）を混ぜない。"""
    n = rgb.shape[0]
    m = n // factor
    r = rgb.reshape(m, factor, m, factor, m, factor, 3).astype(np.float64)
    w = occ_fine.reshape(m, factor, m, factor, m, factor, 1).astype(np.float64)
    total = (r * w).sum(axis=(1, 3, 5))
    cnt = w.sum(axis=(1, 3, 5))
    cnt[cnt == 0] = 1  # 空のセルは 0 割りを避ける（どうせ air になる）
    return total / cnt


def ground(occ: np.ndarray) -> np.ndarray:
    """一番下の占有層が y=0 に来るように下へ詰める（接地）。空なら何もしない。"""
    ys = np.where(occ.any(axis=(0, 2)))[0]
    if len(ys) == 0:
        return occ
    shift = int(ys[0])
    if shift == 0:
        return occ
    out = np.zeros_like(occ)
    out[:, : occ.shape[1] - shift, :] = occ[:, shift:, :]
    return out


def shift_like(arr: np.ndarray, occ_before: np.ndarray) -> np.ndarray:
    """`ground()` と同じ量だけ色配列も下へ詰める。"""
    ys = np.where(occ_before.any(axis=(0, 2)))[0]
    if len(ys) == 0 or ys[0] == 0:
        return arr
    shift = int(ys[0])
    out = np.zeros_like(arr)
    out[:, : arr.shape[1] - shift, :] = arr[:, shift:, :]
    return out


def fill_between(occ: np.ndarray) -> np.ndarray:
    """殻の中を**柱ごとに**詰める。

    各 (x, z) の柱について、**一番下の占有点から一番上の占有点までの間**を 1 にする。
    床までは埋めない——浮いた球に台座が生えるのを避ける（浮いた形は ground() で落ちる）。
    張り出し（腕・屋根の庇）の下は空くので、上から見ても形が分かる程度には詰まる。
    それでも困るなら殻のまま使う（solid=False）。
    """
    n = occ.shape[1]
    ys = np.arange(n)[None, :, None]
    lo = np.where(occ, ys, n).min(axis=1, keepdims=True)  # 柱ごとの最下
    hi = np.where(occ, ys, -1).max(axis=1, keepdims=True)  # 柱ごとの最上
    return (ys >= lo) & (ys <= hi)


DARK_MAX = 45  # これより暗い色は「本当に黒い」（タイヤ・髪・窓）。影とは見なさない。写真の影は 45〜80 に落ちる
GRAY_SAT = 0.12  # 彩度がこれ未満なら無彩色として扱う（青みがかった影を青にしない）
BRIGHT_PCT = 90  # 同じ色味の集まりの中で、この百分位の明るさを「本来の明るさ」にする（75 にすると白い車・豚が灰に沈んだ）
CHROMA_PCTS = (40, 90)  # 色味を決めるのに使う明るさの帯（百分位）。下は影の色かぶり、上は鏡面のハイライトなので外す
DARK_GROUP = 70  # 集まりの明るさの中央値がこれ未満なら、影ではなく黒い物（カラス・黒い服）。持ち上げずに黒にする
DARK_OBJECT_BRIGHT = 140  # 物体全体が黒いとき（中央値が DARK_MAX 未満）、この明るさに届かない集まりは黒い物の照り返し。黒にする
GRAY_BANDS = (0.62, 0.32)  # 無彩色を 3 段に分ける境（物体で一番明るい灰に対する比）。白 / 灰 / **黒**
SATURATION = 1.15  # 有彩色の彩度をこの倍率で上げる。淡い色が白・灰に吸われて「何色か分からない」のを防ぐ（1.3 は茶を橙にした）
SATURATION_FROM = 0.55  # 彩度の底上げは、元の彩度がこれ以上の集まりだけ。クリーム色の羊・ベージュの熊を橙にしない
# 0.3 → 0.55（2026-09-23。本人「肌の色が黄色いブロックで表現されることが多い」）。
# **肌は彩度 0.4 前後**なので 0.3 だと底上げがかかり、彩度が上がって white_terracotta より orange_wool が近くなっていた
# （実測: 肌 (206,162,121) は素の状態なら white_terracotta が最も近い。底上げ後に逆転する）


def unshade(rgb: np.ndarray, occ: np.ndarray) -> np.ndarray:
    """**影を無視する**（2026-09-21 決定）。

    画像の陰影が色に焼き付いていて、白い車の腹や側面が灰・紫のブロックになる。
    Lambert 反射なら影は色味（rgb の比）を変えず明るさだけ落とすので、
    **有彩色は色味でまとめ、その集まりの上位の明るさを全員に与える**。彩度も少し上げる。

    > ### 無彩色（白・灰）は 3 段で残す（同日・飛行機で直した）
    >
    > 灰と白は色味が同じなので、全部を「明るい方」に揃えると**飛行機のエンジン・窓・翼の灰色まで白**になり、
    > 淡い一色の塊になる。無彩色だけは**物体の中の相対的な明るさ**で 白 / 灰 / 濃灰 の 3 段に分ける。
    > 影も灰になりうるが、「全部白」より部品が見える方が当てやすい。
    本当に暗い色（DARK_MAX 未満）は影ではなく黒なので触らない。
    """
    out = rgb.copy()
    pts = rgb[occ]
    if len(pts) == 0:
        return out
    mx = pts.max(axis=1)
    safe_mx = np.maximum(mx, 1.0)
    chroma = pts / safe_mx[:, None]  # 0〜1。明るさを外した色味
    sat = 1.0 - pts.min(axis=1) / safe_mx
    dark = mx < DARK_MAX
    neutral = (sat < GRAY_SAT) & ~dark
    colored = ~neutral & ~dark
    fixed = pts.copy()
    # 物体の大半が黒なら（カラス・黒猫）、残りの明るい点は羽の照り返しなので黒に寄せる。灰の鳥にしない
    object_dark = float(np.median(mx)) < DARK_MAX
    dark_limit = DARK_OBJECT_BRIGHT if object_dark else DARK_GROUP

    # 有彩色: **色相（12 分割・30°）**でまとめる。同じ赤でもハイライトは薄赤（桃）、影は濃赤になり、
    # 色味で細かく分けると赤・橙・桃のまだらになった（赤い車で踏んだ）。
    # グループ内は「中くらいの明るさの帯の平均の色味 × 上位の明るさ」の 1 色に揃える。
    #
    # > ### 「彩度の高い半分」で色味を決めると、クリーム色の羊・ベージュの熊が橙になる（2026-09-21 全語テスト）
    # >
    # > 生成画像の影は暖色にかぶるので、影の側ほど彩度が高い。そこを採ると淡い物が全部濃い橙・黄・桃になった
    # > （羊・熊・ライオン・シロクマ・コアラ・イグルー）。明るさの中帯（CHROMA_PCTS）で色味を取り、
    # > 彩度の底上げも元から色のある集まり（SATURATION_FROM 以上）だけに掛ける。
    # > 本来の明るさが低い集まり（DARK_GROUP 未満）は影ではなく黒い物なので、持ち上げずに黒にする（カラスが茶になった）。
    hue = _hue_deg(pts)
    key = np.floor(hue / 30.0).astype(np.int64) % 12
    for k in np.unique(key[colored]):
        sel = (key == k) & colored
        mx_sel = mx[sel]
        lo, hi = np.percentile(mx_sel, CHROMA_PCTS)
        mid = (mx_sel >= lo) & (mx_sel <= hi)
        if not mid.any():
            mid = np.ones(len(mx_sel), dtype=bool)
        base_chroma = chroma[sel][mid].mean(axis=0)
        bright = np.percentile(mx_sel, BRIGHT_PCT)
        if np.median(mx_sel) < DARK_GROUP or (object_dark and bright < dark_limit):
            fixed[sel] = 12.0
            continue
        c = base_chroma * bright
        mean = c.mean()
        base_sat = 1.0 - base_chroma.min() / max(base_chroma.max(), 1e-6)
        boost = SATURATION if base_sat >= SATURATION_FROM else 1.0
        fixed[sel] = np.clip(mean + (c - mean) * boost, 0, 255)

    # 無彩色: 物体の中で一番明るい灰（上位 90%）に対する比で 3 段。全体が暗ければ黒い物
    if neutral.any():
        top = float(np.percentile(mx[neutral], BRIGHT_PCT))
        rel = mx[neutral] / max(top, 1.0)
        level = np.where(rel >= GRAY_BANDS[0], top, np.where(rel >= GRAY_BANDS[1], top * 0.5, 12.0))  # 一番暗い帯は黒に落とす
        if np.median(mx[neutral]) < DARK_GROUP or (object_dark and top < dark_limit):
            level = np.full_like(level, 12.0)
        fixed[neutral] = np.clip(level[:, None] * np.ones((1, 3)), 0, 255)

    out[occ] = fixed
    return out


def _hue_deg(pts: np.ndarray) -> np.ndarray:
    """(N,3) の RGB → 色相（0〜360）。彩度 0 なら 0。"""
    r, g, b = pts[:, 0], pts[:, 1], pts[:, 2]
    mx = pts.max(axis=1)
    mn = pts.min(axis=1)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4))
    return (h * 60.0) % 360.0


def nearest_block(rgb: tuple[float, float, float]) -> int:
    """RGB に最も近いブロックの **palette 添字（1 始まり。0 は air）** を返す。"""
    best = 0
    best_d = float("inf")
    for i, (_name, c) in enumerate(BLOCKS):
        d = (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2
        if d < best_d:
            best_d = d
            best = i
    return best + 1


_BLOCK_RGB = np.array([c for _n, c in BLOCKS], dtype=np.float64)  # (K, 3)


def _hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(N,3) 0〜255 → 色相 0〜1・彩度 0〜1・明度 0〜1。"""
    mx = rgb.max(axis=1)
    mn = rgb.min(axis=1)
    v = mx / 255.0
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    h = _hue_deg(rgb) / 360.0
    return h, s, v


_BLOCK_H, _BLOCK_S, _BLOCK_V = _hsv(_BLOCK_RGB)
NEUTRAL_SAT = 0.28  # これ未満の彩度は無彩色。白・灰・黒のブロックからだけ選ぶ（0.2 だとシロクマ・イグルーが桃色のテラコッタになった）
# 無彩色の候補は**羊毛・コンクリートの白・灰・黒だけ**。テラコッタは cyan_terracotta (87,91,91) のように
# 彩度が低くて灰に見えるものがあり、灰の中に混ざると色名がばらつく
_BLOCK_NEUTRAL = (_BLOCK_S < NEUTRAL_SAT) & np.array([n.endswith(("_wool", "_concrete")) for n, _c in BLOCKS])
HUE_W, SAT_W, VAL_W = 6.0, 2.8, 1.5  # 色相を最優先で当てる。明度 0.5 だと薄桃の豚が暗い light_gray_terracotta に、彩度 1 だと淡い茶の熊が orange_wool に行った
# 彩度の重み 2.0 → 2.8（2026-09-23）。**淡い色を、彩度の高い羊毛・コンクリートに当てない**ため。
# 実測の変化: 肌 → orange_wool から hardened_clay へ、マリオの肌 → yellow_wool から white_terracotta へ、
# 戦車 → yellow_wool 69% から white_terracotta 69% へ。ピカチュウの黄・ルイージの緑・消火器の赤は変わらない
HUE_FREE, HUE_W2 = 12.0 / 180.0, 8.0  # 色相差 12° までは近い色味として見逃し、それを超えた分に重ねて罰する（明度を重くすると純赤が橙に行くため）


def nearest_blocks(rgb: np.ndarray) -> np.ndarray:
    """(N,3) の色 → palette 添字（1 始まり）。numpy で一括（80³ でも 1 秒未満）。

    > ### RGB の距離で選ぶと、鮮やかな赤が橙になる（2026-09-21 に踏んだ）
    >
    > (255,27,13) は red_wool (160,39,34) より orange_concrete (224,97,0) に RGB では近い。
    > **色相を最優先**（重み 6）、彩度 1、明度 0.5 で選ぶ。
    > **無彩色（彩度 0.2 未満）は白・灰・黒のブロックからだけ**選ぶ——灰が cyan_terracotta や pink_terracotta にならないように。
    """
    if len(rgb) == 0:
        return np.zeros(0, dtype=np.int64)
    h, s, v = _hsv(rgb)
    dh = np.abs(h[:, None] - _BLOCK_H[None, :])
    dh = np.minimum(dh, 1.0 - dh) * 2.0  # 円環。0〜1
    hue_term = HUE_W * dh + HUE_W2 * np.maximum(0.0, dh - HUE_FREE)
    d = hue_term + SAT_W * np.abs(s[:, None] - _BLOCK_S[None, :]) + VAL_W * np.abs(v[:, None] - _BLOCK_V[None, :])
    # 無彩色の入力: 有彩色のブロックを候補から外し、明度だけで選ぶ
    neutral_in = s < NEUTRAL_SAT
    d_neutral = np.abs(v[:, None] - _BLOCK_V[None, :]) + np.where(_BLOCK_NEUTRAL[None, :], 0.0, 1e6)
    d = np.where(neutral_in[:, None], d_neutral, d)
    # 有彩色の入力: 無彩色のブロックは候補から外す（淡い色が白に吸われないように）
    d = np.where(~neutral_in[:, None] & _BLOCK_NEUTRAL[None, :], 1e6, d)
    return d.argmin(axis=1) + 1


def smooth_palette(idx: np.ndarray, occ: np.ndarray) -> np.ndarray:
    """ブロックの色（palette 添字）の斑を、**隣 6 方向の多数派**に揃える（1 回）。

    写真の模様や影の残りで、白と茶が 1 個ずつまだらに散ると「溶けた」見た目になる。
    自分も 1 票に数え、同数なら自分を保つ。空気は数えない。
    """
    n = idx.shape[0]
    k = int(idx.max()) + 1
    votes = np.zeros((n, n, n, k), dtype=np.uint8)
    own = np.eye(k, dtype=np.uint8)[idx]  # one-hot (n,n,n,k)
    own[~occ] = 0
    votes += own
    for axis in range(3):
        for sh in (1, -1):
            votes += np.roll(own, sh, axis=axis)
    votes[..., 0] = 0  # 空気には揃えない
    # 同数なら自分: 自分の票にほんの少し重みを足す
    weighted = votes.astype(np.int16) * 2 + own.astype(np.int16)
    best = weighted.argmax(axis=-1)
    out = idx.copy()
    out[occ] = best[occ]
    return out


def encode(occ: np.ndarray, rgb: np.ndarray) -> dict:
    """n³ の占有と色を `{ size, palette, voxels, count }` にする。

    palette は **使ったブロックだけ**を並べる（air が 0）。
    voxels の並びは y → z → x の順（**下の層から**。ゲームはこの順に置く）。
    """
    n = occ.shape[0]
    assert occ.shape == (n, n, n), occ.shape
    # y → z → x の順に並べ替える（配列は (x, y, z) 順なので転置）
    occ_yzx = occ.transpose(1, 2, 0).reshape(-1)
    rgb_yzx = rgb.transpose(1, 2, 0, 3).reshape(-1, 3)
    idx_all = np.zeros(len(occ_yzx), dtype=np.int64)
    idx_all[occ_yzx] = nearest_blocks(rgb_yzx[occ_yzx])
    # 斑を隣の多数派に揃える（(y,z,x) 順に並べた配列を一度 3D に戻して処理）
    idx_3d = smooth_palette(idx_all.reshape(n, n, n), occ_yzx.reshape(n, n, n))
    idx_all = idx_3d.reshape(-1)
    # 使ったブロックだけの palette に詰め直す
    used = np.unique(idx_all[occ_yzx])
    palette = [AIR] + [BLOCKS[i - 1][0] for i in used]
    remap = np.zeros(len(BLOCKS) + 1, dtype=np.int64)
    remap[used] = np.arange(1, len(used) + 1)
    digits = np.frombuffer(DIGITS.encode("ascii"), dtype=np.uint8)
    chars = digits[remap[idx_all]]
    return {"size": n, "palette": palette, "voxels": chars.tobytes().decode("ascii"), "count": int(occ_yzx.sum())}


def build(occ_fine: np.ndarray, rgb_fine: np.ndarray, factor: int, fill: bool = False, min_sub: int | None = None) -> dict:
    """細かい格子（(20f)³）から最終形まで一気に。run.py がこれを呼ぶ。

    > ### fill（柱で詰める）は**既定で切る**（2026-09-21）
    >
    > 象の鼻・猫の頭のような張り出しの下が縦に埋まり、**「溶けて垂れた」見た目**になった（80³ で顕著）。
    > Hunyuan3D の占有は元から中身が詰まっている（logits の正 = 内側）ので、詰める必要が無い。
    > 殻だけのメッシュから来た占有のときだけ True にする。
    """
    occ = downsample_majority(occ_fine, factor, min_sub)
    rgb = downsample_color(rgb_fine, occ_fine, factor)
    if fill:
        occ = fill_between(occ)
        # 詰めたセルには色が無いので、同じ柱の一番近い占有点の色を使う
        rgb = _spread_color_down(occ, rgb)
    rgb = shift_like(rgb, occ)
    occ = ground(occ)
    rgb = unshade(rgb, occ)
    return encode(occ, rgb)


def _spread_color_down(occ: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    """色の無いセル（平均が 0 のまま）に、その柱の上側の色を流し込む（numpy。80³ でも一瞬）。"""
    has = occ & rgb.any(axis=-1)  # 色を持つ占有セル
    n = occ.shape[1]
    # 各セルについて「自分より上で一番近い、色を持つセルの y」を取る
    ys = np.arange(n)[None, :, None]
    src = np.where(has, ys, -1)  # (x, y, z)
    # 上から下へ最大値を伝播（上側の色付きセルの y）
    src = np.maximum.accumulate(src[:, ::-1, :], axis=1)[:, ::-1, :]
    out = rgb.copy()
    fill = occ & ~has & (src >= 0)
    xi, yi, zi = np.nonzero(fill)
    out[xi, yi, zi] = rgb[xi, src[xi, yi, zi], zi]
    return out


def ascii_layers(voxels: str, size: int = SIZE) -> str:
    """確認用。各層を上から順に文字で描く（0 は空白）。"""
    lines = []
    for y in range(size - 1, -1, -1):
        rows = []
        for z in range(size):
            row = voxels[y * size * size + z * size : y * size * size + z * size + size]
            rows.append(row.replace("0", "."))
        if any(r.strip(".") for r in rows):
            lines.append(f"--- y={y} ---")
            lines.extend(rows)
    return "\n".join(lines)


def _selftest() -> None:
    # 40³ の球（中心やや上）→ 20³ に落として接地・詰め
    n = 40
    g = np.indices((n, n, n)).astype(np.float64)
    c = np.array([20, 26, 20])[:, None, None, None]
    occ = ((g - c) ** 2).sum(axis=0) <= 10**2
    rgb = np.zeros((n, n, n, 3))
    rgb[..., 0] = 200  # 赤っぽく
    out = build(occ, rgb, factor=2, fill=True)
    assert out["size"] == SIZE and len(out["voxels"]) == SIZE**3
    assert out["palette"][0] == AIR and any(n.startswith("red_") for n in out["palette"]), out["palette"]
    # 接地: y=0 に何かある
    assert any(ch != "0" for ch in out["voxels"][: SIZE * SIZE]), "接地していない"
    assert out["count"] > 0
    for c, want in (((255, 27, 13), "red_"), ((87, 91, 91), "gray_"), ((30, 30, 30), "black_"), ((230, 230, 230), "white_"), ((250, 220, 50), "yellow_")):
        got = BLOCKS[nearest_blocks(np.array([c], dtype=float))[0] - 1][0]
        assert got.startswith(want), (c, got)
    print("voxel selftest ok:", out["palette"], "count", out["count"])
    print(ascii_layers(out["voxels"]).split("\n--- y=")[0][:400])


if __name__ == "__main__":
    _selftest()
