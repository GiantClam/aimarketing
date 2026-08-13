from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--font-source", type=Path, required=True)
    parser.add_argument("--private-font-dir", type=Path, required=True)
    parser.add_argument("--image-out", type=Path, required=True)
    parser.add_argument("--evidence-out", type=Path, required=True)
    args = parser.parse_args()

    args.private_font_dir.mkdir(parents=True, exist_ok=True)
    private_font = args.private_font_dir / args.font_source.name
    shutil.copy2(args.font_source, private_font)

    font = ImageFont.truetype(str(private_font), size=64)
    family, style = font.getname()
    image = Image.new("RGB", (1280, 720), "#071D2D")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((72, 72, 1208, 648), radius=42, fill="#0D3550", outline="#42D3A4", width=5)
    draw.text((120, 160), "私有字体已加载", font=font, fill="#F4FBF8")
    body = ImageFont.truetype(str(private_font), size=34)
    draw.text((120, 286), "PPT Master · Windows 本地可行性验证", font=body, fill="#9FE9D3")
    draw.text((120, 370), "图像像素来自隔离 Python；标题文字仍在 PPTX 中可编辑。", font=body, fill="#D5E7EF")
    args.image_out.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.image_out, format="PNG")

    evidence = {
        "schema_version": 1,
        "font_source": f"C:/Windows/Fonts/{args.font_source.name}",
        "private_font_file": args.font_source.name,
        "private_font_sha256": sha256(private_font),
        "font_family_reported_by_pillow": family,
        "font_style_reported_by_pillow": style,
        "image_file": args.image_out.name,
        "image_sha256": sha256(args.image_out),
        "image_size": list(image.size),
        "loaded_via_absolute_private_path": private_font.is_absolute(),
    }
    args.evidence_out.parent.mkdir(parents=True, exist_ok=True)
    args.evidence_out.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

