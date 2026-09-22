"""実際の散弾 RP を画像にする。使い方・校正範囲は spec/26-rig-preview.md。"""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

from rig_preview.assets import scene
from rig_preview.raster import render

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RP = ROOT / "worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rp", type=Path, default=DEFAULT_RP)
    parser.add_argument("--out", type=Path, default=ROOT / "out/shotgun-rig/current")
    parser.add_argument("--compare-rp", type=Path, help="配置済み RP と読み取ったファイルを照合")
    parser.add_argument("--yaw", type=float, default=0)
    parser.add_argument("--pitch", type=float, default=0)
    parser.add_argument("--head-yaw", type=float, default=0)
    parser.add_argument("--head-pitch", type=float, default=0)
    parser.add_argument("--time", type=float, default=0, help="キーフレームの評価時刻（秒）")
    parser.add_argument("--center", type=float, nargs=3, default=[0, 21, -2])
    parser.add_argument("--span", type=float, default=28)
    parser.add_argument("--size", type=int, default=640)
    parser.add_argument("--distance", type=float, default=0)
    parser.add_argument("--fov", type=float, default=50)
    parser.add_argument("--unlit", action="store_true")
    parser.add_argument("--single", action="store_true")
    parser.add_argument("--reference", type=Path, help="比較する実機スクリーンショット")
    parser.add_argument("--crop", type=int, nargs=4, help="実機画像の比較範囲 left top right bottom")
    args = parser.parse_args()
    if args.size < 32 or args.span <= 0 or args.distance < 0 or not 1 < args.fov < 179:
        parser.error("Invalid camera parameters")
    if args.reference and (not args.single or not args.crop):
        parser.error("--reference requires --single and --crop")
    faces, report = scene(args.rp, args.head_pitch, args.head_yaw, time=args.time)
    args.out.mkdir(parents=True, exist_ok=True)
    report["camera"] = {k: getattr(args, k) for k in ("center", "span", "distance", "fov", "size", "unlit")}
    if args.compare_rp:
        differences = []
        for name, expected in report["inputs_sha256"].items():
            path = args.compare_rp / name
            if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                differences.append(name)
        report["deployed_comparison"] = {"path": str(args.compare_rp), "differences": differences}
        if differences:
            raise ValueError(f"Deployed RP differs: {differences}")
    views = [("camera", args.yaw, args.pitch)] if args.single else [
        ("front", 0, 0), ("right", 90, 0), ("left", -90, 0),
        ("quarter", 40, 15), ("opposite", -40, 15), ("above", 0, 80),
    ]
    sheet = Image.new("RGB", (args.size*3, (args.size+38)*2), (25, 29, 36))
    for index, (label, yaw, pitch) in enumerate(views):
        picture, _ = render(faces, yaw, pitch, args.size, args.center, args.span,
                            args.distance, args.fov, args.unlit)
        picture.save(args.out / (label + ".png"))
        if args.reference:
            reference = Image.open(args.reference).convert("RGB")
            left, top, right, bottom = args.crop
            if not (0 <= left < right <= reference.width and 0 <= top < bottom <= reference.height):
                parser.error("Crop must stay inside the reference image")
            reference = reference.crop(args.crop)
            reference.save(args.out / "reference-crop.png")
            width = round(reference.width * args.size / reference.height)
            reference = reference.resize((width, args.size), Image.Resampling.NEAREST)
            comparison = Image.new("RGB", (width + args.size, args.size + 60), (25, 29, 36))
            comparison.paste(reference, (0, 60))
            comparison.paste(picture, (width, 60))
            draw = ImageDraw.Draw(comparison)
            draw.text((16, 16), "MINECRAFT / screenshot crop", fill="white")
            draw.text((width + 16, 16), "TOOL / actual RP, static snapshot", fill="white")
            draw.text((width + 16, 35), "Camera estimated; lighting and HUD are not reproduced", fill=(180, 190, 200))
            comparison.save(args.out / "comparison.png")
            report["reference"] = {"path": str(args.reference), "crop": args.crop,
                                   "sha256": hashlib.sha256(args.reference.read_bytes()).hexdigest(),
                                   "operation": "crop and nearest-neighbor enlargement only"}
        x, y = (index % 3)*args.size, (index // 3)*(args.size+38)
        sheet.paste(picture, (x, y+38))
        ImageDraw.Draw(sheet).text((x+14, y+12), f"{label}  yaw={yaw} pitch={pitch}  / actual RP, static", fill="white")
    if not args.single:
        sheet.save(args.out / "views.png")
    report["views"] = views
    (args.out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    print(f"Rendered {len(views)} views, {len(report['inputs_sha256'])} input files: {args.out}")
    if args.compare_rp:
        print("All input SHA-256 hashes match the deployed RP.")


if __name__ == "__main__":
    main()
