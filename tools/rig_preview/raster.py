"""透視補正 UV と Z バッファによる PNG 出力。画像の加工で模型をごまかさない。"""

import numpy as np
from PIL import Image


def camera(yaw, pitch):
    yaw, pitch = np.radians([yaw, pitch])
    return np.array([[np.cos(yaw), 0, -np.sin(yaw)],
                     [np.sin(pitch)*np.sin(yaw), np.cos(pitch), np.sin(pitch)*np.cos(yaw)],
                     [np.cos(pitch)*np.sin(yaw), -np.sin(pitch), np.cos(pitch)*np.cos(yaw)]])


def render(faces, yaw=0, pitch=0, size=640, center=(0, 18, 0), span=38,
           distance=0, fov=50, unlit=False):
    """distance=0 は平行投影。正の値なら対象中心からの距離（モデル単位）。"""
    rgb = np.full((size, size, 3), [35, 40, 49], dtype=np.uint8)
    depth = np.full((size, size), np.inf)
    identifiers = np.full((size, size), -1, dtype=np.int32)
    view = camera(yaw, pitch)
    focal = size / (2 * np.tan(np.radians(fov) / 2))
    for face_id, (vertices, uv, texture, _) in enumerate(faces):
        positions = (vertices - center) @ view.T
        z = positions[:, 2] + distance if distance else positions[:, 2]
        if distance and z.min() <= .1:
            raise ValueError("Camera intersects model; increase --distance")
        invz = 1 / z if distance else np.ones(4)
        xy = positions[:, :2] * (focal * invz[:, None] if distance else size / span)
        xy = xy * [1, -1] + size / 2
        normal = np.cross(vertices[1] - vertices[0], vertices[3] - vertices[0])
        length = np.linalg.norm(normal)
        if length < 1e-9:
            continue
        # 中立の面陰影。ゲームの環境光・色補正とは比較を分ける。
        normal = normal / length
        shade = 1 if unlit else .65 + .35 * abs(normal[1]) + .12 * abs(normal[2])
        for indices in ([0, 1, 2], [0, 2, 3]):
            tri = xy[indices]
            lo = np.maximum(np.floor(tri.min(axis=0)).astype(int), 0)
            hi = np.minimum(np.ceil(tri.max(axis=0)).astype(int), size-1)
            if (lo > hi).any():
                continue
            xx, yy = np.meshgrid(np.arange(lo[0], hi[0]+1)+.5, np.arange(lo[1], hi[1]+1)+.5)
            a, b, c = tri
            denom = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(denom) < 1e-9:
                continue
            w0 = ((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1])) / denom
            w1 = ((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1])) / denom
            weights = np.stack([w0, w1, 1-w0-w1], axis=-1)
            inside = (weights >= -1e-8).all(axis=-1)
            reciprocal = weights @ invz[indices]
            fragz = 1 / reciprocal if distance else weights @ z[indices]
            texcoords = (weights @ (uv[indices] * invz[indices, None])) / reciprocal[..., None]
            px = np.clip(np.floor(texcoords[..., 0]).astype(int), 0, texture.shape[1]-1)
            py = np.clip(np.floor(texcoords[..., 1]).astype(int), 0, texture.shape[0]-1)
            texels = texture[py, px]
            region = np.s_[lo[1]:hi[1]+1, lo[0]:hi[0]+1]
            mask = inside & (texels[..., 3] >= 128) & (fragz < depth[region])
            rgb[region][mask] = np.clip(texels[..., :3][mask] * shade, 0, 255).astype(np.uint8)
            depth[region][mask] = fragz[mask]
            identifiers[region][mask] = face_id
    return Image.fromarray(rgb), identifiers
