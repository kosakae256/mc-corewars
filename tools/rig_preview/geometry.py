"""Bedrock の静的 geometry を面へ変換する。ゲーム状態の評価とは分離する。"""

import re
import numpy as np


def translation(value):
    result = np.eye(4)
    result[:3, 3] = value
    return result


def rotation(value):
    # Bedrock model 座標（X が反転した座標系）で X → Y → Z を適用。
    x, y, z = np.radians(value) * [-1, 1, -1]
    cx, cy, cz = np.cos([x, y, z])
    sx, sy, sz = np.sin([x, y, z])
    result = np.eye(4)
    result[:3, :3] = (np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
                      @ np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
                      @ np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]))
    return result


def points(matrix, values):
    values = np.asarray(values)
    return values @ matrix[:3, :3].T + matrix[:3, 3]


def static_value(value, previous):
    """未知の Molang をゼロ扱いしない。現在必要な定数・this 上書きだけ許す。"""
    if isinstance(value, (int, float)):
        return value
    match = re.fullmatch(r"\s*([+-]?\s*\d+(?:\.\d+)?)\s*(?:-\s*(this))?\s*", value)
    if not match:
        raise ValueError(f"Unsupported static expression: {value}")
    return float(match[1].replace(" ", "")) - (previous if match[2] else 0)


def channels(clips, bones=()):
    """this は初期姿勢を含む現在値。結果は初期姿勢からの差分に戻す。"""
    lookup = {b["name"].lower(): b for b in bones}
    initial = {}
    for name, bone in lookup.items():
        parent = lookup.get(bone.get("parent", "").lower(), {})
        initial[name] = {
            "position": np.array(bone.get("pivot", [0, 0, 0]), dtype=float)
                        - np.array(parent.get("pivot", [0, 0, 0])),
            "rotation": np.array(bone.get("rotation", [0, 0, 0]), dtype=float),
            "scale": np.ones(3),
        }
    result = {name: {k: v.copy() for k, v in values.items()} for name, values in initial.items()}
    for clip in clips:
        for name, values in clip.get("bones", {}).items():
            bone = result.setdefault(name.lower(), {})
            for channel, value in values.items():
                if channel not in ("rotation", "position", "scale"):
                    raise ValueError(f"Unsupported channel: {channel}")
                default = 1 if channel == "scale" else 0
                old = bone.get(channel, np.full(3, default, dtype=float))
                vector = value if isinstance(value, list) else [value] * 3
                if len(vector) != 3:
                    raise ValueError(f"Expected 3 components: {name}/{channel}")
                evaluated = np.array([static_value(v, p) for v, p in zip(vector, old)])
                bone[channel] = old * evaluated if channel == "scale" else old + evaluated
    for name, values in result.items():
        for channel in ("position", "rotation"):
            if name in initial and channel in values:
                values[channel] = values[channel] - initial[name][channel]
    return result


def matrices(bones, pose, bindings=None):
    """pivot はモデルの絶対座標。親の変換を適用してから子の局所変換を重ねる。"""
    lookup = {bone["name"].lower(): bone for bone in bones}
    done, visiting = {}, set()

    def visit(name):
        if name in done:
            return done[name]
        if name in visiting:
            raise ValueError(f"Bone cycle: {name}")
        visiting.add(name)
        bone = lookup[name]
        pivot = np.array(bone.get("pivot", [0, 0, 0]), dtype=float)
        anim = pose.get(name, {})
        parent = visit(bone["parent"].lower()) if "parent" in bone else np.eye(4)
        if "binding" in bone:
            if bindings is None or bone["binding"] not in bindings:
                raise ValueError(f"Unresolved binding: {bone['binding']}")
            parent = bindings[bone["binding"]]
        scale = np.diag([*anim.get("scale", [1, 1, 1]), 1])
        angles = np.array(bone.get("rotation", [0, 0, 0])) + anim.get("rotation", 0)
        done[name] = (parent @ translation(pivot + anim.get("position", 0))
                      @ rotation(angles) @ scale @ translation(-pivot))
        visiting.remove(name)
        return done[name]

    for name in lookup:
        visit(name)
    return done


# UV top-left, top-right, bottom-right, bottom-left in native Bedrock coordinates.
# X reflection also exchanges the east/west faces of editor coordinates.
FACES = {
    "west": [[1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]],
    "east": [[0, 1, 1], [0, 1, 0], [0, 0, 0], [0, 0, 1]],
    "north": [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]],
    "south": [[1, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1]],
    "up": [[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]],
    "down": [[1, 0, 1], [0, 0, 1], [0, 0, 0], [1, 0, 0]],
}


def uv_faces(cube, bone):
    """展開図の UV と面ごとの UV を、同じ表現にそろえる。"""
    uv = cube.get("uv", [0, 0])
    if isinstance(uv, dict):
        result = {}
        for name, face in uv.items():
            face = {**face}
            if name in ("up", "down") and "uv_size" in face:
                face["uv"] = (np.array(face["uv"]) + face["uv_size"]).tolist()
                face["uv_size"] = (-np.array(face["uv_size"])).tolist()
            result[name] = face
        return result
    x, y, z = cube["size"]
    u, v = uv
    result = {
        "east": {"uv": [u, v + z], "uv_size": [z, y]},
        "north": {"uv": [u + z, v + z], "uv_size": [x, y]},
        "west": {"uv": [u + z + x, v + z], "uv_size": [z, y]},
        "south": {"uv": [u + 2*z + x, v + z], "uv_size": [x, y]},
        "up": {"uv": [u + z + x, v + z], "uv_size": [-x, -z]},
        "down": {"uv": [u + z + 2*x, v], "uv_size": [-x, z]},
    }
    if cube.get("mirror", bone.get("mirror", False)):
        result["east"], result["west"] = result["west"], result["east"]
        for face in result.values():
            face["uv"][0] += face["uv_size"][0]
            face["uv_size"][0] *= -1
    return result


def mesh(model, world, texture, prefix):
    """inflate を含むすべての cube を生成する。透明な外層も省略しない。"""
    result = []
    description = model["description"]
    tex_scale = np.array([texture.shape[1] / description["texture_width"],
                          texture.shape[0] / description["texture_height"]])
    for bone in model["bones"]:
        if "texture_meshes" in bone:
            raise ValueError("texture_meshes is not supported")
        for index, cube in enumerate(bone.get("cubes", [])):
            inflate = cube.get("inflate", bone.get("inflate", 0))
            origin = np.array(cube["origin"]) - inflate
            size = np.array(cube["size"]) + 2*inflate
            transform = world[bone["name"].lower()]
            if "rotation" in cube:
                pivot = np.array(cube.get("pivot", [0, 0, 0]))
                transform = transform @ translation(pivot) @ rotation(cube["rotation"]) @ translation(-pivot)
            for face, spec in uv_faces(cube, bone).items():
                if "uv_size" not in spec:
                    raise ValueError(f"Missing uv_size: {bone['name']}/{face}")
                u, v = spec["uv"]
                du, dv = spec["uv_size"]
                uv = np.array([[u, v], [u + du, v], [u + du, v + dv], [u, v + dv]])
                turn = spec.get("uv_rotation", 0)
                if turn % 90:
                    raise ValueError(f"Unsupported UV rotation: {turn}")
                uv = np.roll(uv, -(turn // 90), axis=0) * tex_scale
                vertices = points(transform, origin + size * np.array(FACES[face]))
                result.append((vertices, uv, texture, f"{prefix}/{bone['name']}/{index}"))
    return result
