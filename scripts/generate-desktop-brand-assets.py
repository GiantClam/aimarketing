"""Regenerate the desktop AI Marketing logo, PNG icons, and Windows ICO."""

from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ModuleNotFoundError as error:
    raise SystemExit("Pillow is required: python -m pip install Pillow") from error


ROOT = Path(__file__).resolve().parents[1]
TAURI_ICONS = ROOT / "apps" / "desktop" / "src-tauri" / "icons"
PUBLIC_BRAND = ROOT / "apps" / "desktop" / "public" / "brand"
YELLOW = "#FFD000"
INK = "#111111"
OFF_WHITE = "#F5F5F5"


def icon_svg() -> str:
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
  <title id="title">AI Marketing app icon</title>
  <desc id="desc">A golden angular AM growth mark on a near-black rounded square.</desc>
  <rect x="24" y="24" width="464" height="464" rx="112" fill="#111111"/>
  <path
    d="M132 366V278L218 192L291 265L378 178"
    fill="none"
    stroke="#FFD000"
    stroke-width="58"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path d="M344 142L417 135L410 208Z" fill="#FFD000"/>
  <path
    d="M180 359L228 294L280 359"
    fill="none"
    stroke="#FFD000"
    stroke-width="30"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
"""


def logo_svg(text_color: str, dark: bool = False) -> str:
    tile_border = ' stroke="#343434" stroke-width="8"' if dark else ""
    description = "AI Marketing horizontal logo for dark backgrounds." if dark else "AI Marketing horizontal logo in black and golden yellow."
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 240" role="img" aria-labelledby="title desc">
  <title id="title">AI Marketing</title>
  <desc id="desc">{description}</desc>
  <g transform="translate(20 20) scale(.390625)">
    <rect x="0" y="0" width="512" height="512" rx="112" fill="#111111"{tile_border}/>
    <path d="M132 366V278L218 192L291 265L378 178" fill="none" stroke="#FFD000" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M344 142L417 135L410 208Z" fill="#FFD000"/>
    <path d="M180 359L228 294L280 359" fill="none" stroke="#FFD000" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g fill="{text_color}" font-family="Impact, 'Arial Narrow', 'Roboto Condensed', sans-serif" font-weight="900">
    <text x="254" y="157" font-size="112" letter-spacing="1">AI</text>
    <text x="382" y="157" font-size="112" letter-spacing="3">MARKETING</text>
  </g>
  <rect x="256" y="181" width="805" height="8" rx="4" fill="#FFD000"/>
</svg>
"""


def _scaled(points: list[tuple[int, int]], factor: int) -> list[tuple[int, int]]:
    return [(x * factor, y * factor) for x, y in points]


def _round_line(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    width: int,
    fill: str,
) -> None:
    draw.line(points, fill=fill, width=width, joint="curve")
    radius = width // 2
    for x, y in points:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def render_icon(size: int = 1024) -> Image.Image:
    render_size = size * 4
    factor = render_size // 512
    image = Image.new("RGBA", (render_size, render_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (24 * factor, 24 * factor, 488 * factor, 488 * factor),
        radius=112 * factor,
        fill=INK,
    )
    _round_line(
        draw,
        _scaled([(132, 366), (132, 278), (218, 192), (291, 265), (378, 178)], factor),
        58 * factor,
        YELLOW,
    )
    draw.polygon(_scaled([(344, 142), (417, 135), (410, 208)], factor), fill=YELLOW)
    _round_line(
        draw,
        _scaled([(180, 359), (228, 294), (280, 359)], factor),
        30 * factor,
        YELLOW,
    )
    return image.resize((size, size), Image.Resampling.LANCZOS)


def _brand_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = (
        Path("C:/Windows/Fonts/impact.ttf"),
        Path("C:/Windows/Fonts/arialnb.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    raise FileNotFoundError("No supported condensed bold font was found")


def render_logo(text_color: str) -> Image.Image:
    canvas = Image.new("RGBA", (2240, 480), (0, 0, 0, 0))
    icon = render_icon(1024).resize((400, 400), Image.Resampling.LANCZOS)
    canvas.alpha_composite(icon, (40, 40))
    draw = ImageDraw.Draw(canvas)

    font_size = 224
    while True:
        font = _brand_font(font_size)
        ai_box = draw.textbbox((0, 0), "AI", font=font)
        marketing_box = draw.textbbox((0, 0), "MARKETING", font=font)
        total_width = (ai_box[2] - ai_box[0]) + 66 + (marketing_box[2] - marketing_box[0])
        if total_width <= 1620:
            break
        font_size -= 2

    baseline_y = 104
    ai_x = 508
    draw.text((ai_x, baseline_y), "AI", font=font, fill=text_color, stroke_width=0)
    ai_width = ai_box[2] - ai_box[0]
    draw.text((ai_x + ai_width + 66, baseline_y), "MARKETING", font=font, fill=text_color, stroke_width=0)
    draw.rounded_rectangle((512, 362, 2122, 378), radius=8, fill=YELLOW)
    return canvas


def main() -> None:
    TAURI_ICONS.mkdir(parents=True, exist_ok=True)
    PUBLIC_BRAND.mkdir(parents=True, exist_ok=True)

    (TAURI_ICONS / "ai-marketing-icon.svg").write_text(icon_svg(), encoding="utf-8", newline="\n")
    (PUBLIC_BRAND / "ai-marketing-logo.svg").write_text(logo_svg(INK), encoding="utf-8", newline="\n")
    (PUBLIC_BRAND / "ai-marketing-logo-dark.svg").write_text(logo_svg(OFF_WHITE, dark=True), encoding="utf-8", newline="\n")

    icon = render_icon()
    icon.save(TAURI_ICONS / "ai-marketing-icon.png", optimize=True)
    icon.save(
        TAURI_ICONS / "ai-marketing-icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    icon.resize((64, 64), Image.Resampling.LANCZOS).save(
        PUBLIC_BRAND / "ai-marketing-icon-64.png",
        optimize=True,
    )

    render_logo(INK).resize((1120, 240), Image.Resampling.LANCZOS).save(
        PUBLIC_BRAND / "ai-marketing-logo.png",
        optimize=True,
    )
    render_logo(OFF_WHITE).resize((1120, 240), Image.Resampling.LANCZOS).save(
        PUBLIC_BRAND / "ai-marketing-logo-dark.png",
        optimize=True,
    )


if __name__ == "__main__":
    main()
