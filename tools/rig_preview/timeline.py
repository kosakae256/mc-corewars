"""Bedrock の静的／キーフレームチャンネルを任意時刻でサンプリングする。"""

import math
import re


def scalar(value):
    if isinstance(value, bool):
        raise ValueError("数値を入力してください。")
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value), False
    if isinstance(value, str):
        match = re.fullmatch(r"\s*([+-]?\d+(?:\.\d+)?)\s*-\s*this\s*", value)
        if match:
            return float(match[1]), True
    raise ValueError(f"未対応の式: {value}")


def vector(value):
    values = value if isinstance(value, list) else [value] * 3
    if len(values) == 1:
        values = values * 3
    if len(values) != 3:
        raise ValueError("チャンネルには3軸の値が必要です。")
    for component in values:
        scalar(component)
    return values


def endpoint(value, side):
    if not isinstance(value, dict):
        return vector(value)
    return vector(value.get(side, value.get("post", value.get("pre"))))


def interpolate(vectors, weights):
    result = []
    for components in zip(*vectors):
        parsed = [scalar(c) for c in components]
        if len({p[1] for p in parsed}) != 1:
            raise ValueError("同じ軸のキーでは加算と this による上書きを混在させないでください。")
        value = sum(w*p[0] for w, p in zip(weights, parsed))
        result.append(f"{value:.8f} - this" if parsed[0][1] else value)
    return result


def channel_at(channel, time):
    if not isinstance(channel, dict):
        return vector(channel)
    keys = sorted((float(t), v) for t, v in channel.items())
    if not keys or any(not math.isfinite(t) or t < 0 for t, _ in keys):
        raise ValueError("キーフレームの時刻が不正です。")
    if time < keys[0][0]:
        return endpoint(keys[0][1], "pre")
    if time >= keys[-1][0]:
        return endpoint(keys[-1][1], "post")
    for index, (start, a) in enumerate(keys[:-1]):
        end, b = keys[index+1]
        if not start <= time < end:
            continue
        if time == start:
            return endpoint(a, "post")
        u = (time-start) / (end-start)
        # step は Bedrock の pre/post 不連続として書き出す。
        mode = a.get("lerp_mode", "linear") if isinstance(a, dict) else "linear"
        if mode == "catmullrom":
            prior = endpoint(keys[max(0, index-1)][1], "post")
            after = endpoint(keys[min(len(keys)-1, index+2)][1], "pre")
            weights = [(-u+2*u*u-u**3)/2, (2-5*u*u+3*u**3)/2,
                       (u+4*u*u-3*u**3)/2, (-u*u+u**3)/2]
            return interpolate([prior, endpoint(a, "post"), endpoint(b, "pre"), after], weights)
        if mode != "linear":
            raise ValueError(f"未対応の補間: {mode}")
        return interpolate([endpoint(a, "post"), endpoint(b, "pre")], [1-u, u])
    raise ValueError("キーフレームを評価できません。")


def sample(clip, time):
    """スクラブでは終端キーを表示する。ループ時刻の巻き戻しはプレイヤー側で行う。"""
    return {"bones": {bone: {kind: channel_at(value, time) for kind, value in values.items()}
                      for bone, values in clip.get("bones", {}).items()}}


def validate(clip, allowed):
    if not isinstance(clip, dict) or not isinstance(clip.get("bones", {}), dict):
        raise ValueError("アニメーションの bones が不正です。")
    length = clip.get("animation_length", 1)
    if not isinstance(length, (int, float)) or not 0 < length <= 300:
        raise ValueError("アニメーションの長さは0秒より大きく300秒以下にしてください。")
    if clip.get("loop", False) not in (True, False, "hold_on_last_frame"):
        raise ValueError("未対応のループ設定です。")
    for bone, channels in clip.get("bones", {}).items():
        if bone.lower() not in allowed:
            raise ValueError(f"模型にない骨: {bone}")
        for kind, value in channels.items():
            if kind not in ("position", "rotation", "scale"):
                raise ValueError(f"未対応のチャンネル: {kind}")
            values = value.values() if isinstance(value, dict) else [value]
            if isinstance(value, dict):
                times = [float(t) for t in value]
                if len(set(times)) != len(times) or any(not 0 <= t <= 300 for t in times):
                    raise ValueError("キーの時刻が不正です。")
                if not times:
                    raise ValueError("空のキーフレームです。")
            for frame in values:
                if isinstance(frame, dict) and frame.get("lerp_mode", "linear") not in ("linear", "catmullrom"):
                    raise ValueError("未対応の補間です。")
                for side in ("pre", "post"):
                    for component in endpoint(frame, side):
                        number, override = scalar(component)
                        low, high = {"position": (-48, 48), "rotation": (-720, 720), "scale": (0, 8)}[kind]
                        if not low <= number <= high or (kind == "scale" and override):
                            raise ValueError(f"{kind} の値が範囲外です。")
    sample(clip, 0)
    return clip
