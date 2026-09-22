"""傾きを直す（**純粋関数。torch に依存しない**）。

## なぜ要るか

画像を「やや上から」撮ると、TripoSR は「真横から撮った」前提で立体を組むので、
物体が手前に傾いて出てくる。車なら鼻先だけが床に着き、残りが浮く（2026-09-21 に本人が指摘）。

## どう直すか

**「物は地面に立っている」**を条件にする。
占有点の集まりを水平軸まわりに −MAX〜＋MAX 度で回してみて、
**床に接する柱（x, z）の数が最大になる角度**を選ぶ。
車の平らな腹・ロケットの底・家の土台は、水平のときに接地面積が最大になる。
四つ足の動物は角度によらず 4 点接地なので、同点なら **回さない（0 度）** を優先する。

軸は Minecraft の並び（x, y が上, z）。
- pitch: z 軸まわり（x–y 面の回転）… 画像の奥行き方向の傾き
- roll : x 軸まわり（z–y 面の回転）… 左右の傾き

`python -m pipeline.level` で自己テストが走る。
"""

from __future__ import annotations

import math

import numpy as np

MAX_DEG = 30
STEP_DEG = 3
CONTACT_TOL = 1.0  # 最低 y からこの範囲（セル）にある柱を「接地」と数える
MIN_GAIN = 1.5  # 回す条件: 接地が 1.5 倍 ＋ 2 柱以上に増えること
MIN_ADD = 2


def rotation(axis: str, deg: float) -> np.ndarray:
    """axis ('x' | 'z') まわりの回転行列（3×3）。y が上の右手系。"""
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    if axis == "z":
        return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])
    if axis == "x":
        return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])
    raise ValueError(axis)


def contact_count(points: np.ndarray, cell: float) -> int:
    """点群を格子（1 辺 cell）に落とし、最低 y の柱がいくつあるかを数える。"""
    if len(points) == 0:
        return 0
    g = np.floor(points / cell).astype(np.int64)
    y_min = g[:, 1].min()
    low = g[g[:, 1] <= y_min + CONTACT_TOL]
    # 同じ (x, z) の柱は 1 つに数える
    cols = np.unique(low[:, [0, 2]], axis=0)
    return int(len(cols))


def best_angle(points: np.ndarray, axis: str, cell: float, center: np.ndarray) -> float:
    """接地する柱が最大になる角度（度）。同点なら 0 に近いほう。"""
    best_deg = 0.0
    best = -1
    for deg in range(-MAX_DEG, MAX_DEG + 1, STEP_DEG):
        r = rotation(axis, deg)
        p = (points - center) @ r.T + center
        n = contact_count(p, cell)
        # 同点は |deg| が小さいほうを取る（ループは負から正へ進むので、
        # 0 を跨いだ後は「より大きい」ときだけ更新すればよい）
        if n > best or (n == best and abs(deg) < abs(best_deg)):
            best, best_deg = n, float(deg)
    return best_deg


def level_matrix(points: np.ndarray, cell: float) -> tuple[np.ndarray, dict]:
    """占有点（y が上の座標）から、水平に直す回転行列と診断情報を返す。

    pitch（z 軸）→ roll（x 軸）の順に貪欲に決める。
    回す中心は点群の重心。**呼び出し側は同じ中心で回すこと。**
    """
    if len(points) == 0:
        return np.eye(3), {"pitch": 0.0, "roll": 0.0, "center": [0.0, 0.0, 0.0]}
    center = points.mean(axis=0)
    pitch = best_angle(points, "z", cell, center)
    r1 = rotation("z", pitch)
    p1 = (points - center) @ r1.T + center
    roll = best_angle(p1, "x", cell, center)
    r = rotation("x", roll) @ r1
    before = contact_count(points, cell)
    after = contact_count((points - center) @ r.T + center, cell)
    # 接地が**明らかに**増えるときだけ回す。1 枚推定で平らになりがちな裏面を床にしてしまう
    # （少しだけ増える）ケースを弾く。2026-09-21 の実測: 車 20→124、ロケット 9→16、猫 14→30 は通る
    if after < before * MIN_GAIN + MIN_ADD:
        return np.eye(3), {"pitch": 0.0, "roll": 0.0, "contact_before": before, "contact_after": before, "center": center.tolist()}
    return r, {"pitch": pitch, "roll": roll, "contact_before": before, "contact_after": after, "center": center.tolist()}


def _selftest() -> None:
    # 平らな板（車の腹のつもり）を 15 度傾けて、戻せるか
    xs, ys, zs = np.meshgrid(np.arange(0, 20.0), np.arange(0, 3.0), np.arange(0, 8.0), indexing="ij")
    box = np.stack([xs, ys, zs], axis=-1).reshape(-1, 3) + 0.5
    center = box.mean(axis=0)
    tilted = (box - center) @ rotation("z", 15).T + center
    r, info = level_matrix(tilted, cell=1.0)
    assert abs(info["pitch"] + 15) <= STEP_DEG, info
    assert info["contact_after"] >= info["contact_before"], info
    # 水平なものは回さない
    r0, info0 = level_matrix(box, cell=1.0)
    assert info0["pitch"] == 0.0 and info0["roll"] == 0.0, info0
    print("level selftest ok:", info)


if __name__ == "__main__":
    _selftest()
