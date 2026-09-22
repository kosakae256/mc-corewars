"""`torchmcubes` の空の代用。

## なぜ要るか

TripoSR の `tsr/models/isosurface.py` が冒頭で `from torchmcubes import marching_cubes` する。
本物の `torchmcubes` は **CUDA 拡張をコンパイルする**ので、この PC（`cl.exe` も CUDA toolkit も無い）では入らない。

**genlab はメッシュを作らない**（`docs/spec/08-genlab.md` 2-2）。
20³ の格子の点を NeRF に直接問い合わせるので、marching cubes は一度も呼ばれない。
**import を通すためだけ**にこれを置く。`sys.path` の先頭に `shim/` を足すと本物より先に見つかる。

万一呼ばれたら、黙って壊れるのではなく例外で止める。
"""


def marching_cubes(*_args, **_kwargs):
    raise NotImplementedError(
        "genlab は marching cubes を使わない。ここが呼ばれたら設計が変わっている（docs/spec/08-genlab.md）"
    )
