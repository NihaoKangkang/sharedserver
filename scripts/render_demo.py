"""Assemble real-browser frames captured with CAPTURE_DEMO=1 (requires Pillow)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def font(size):
    for name in ("DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


root = Path(__file__).resolve().parents[1]
source = root / "build/demo-frames"
frames = []
for caption in sorted(source.glob("*.txt")):
    frame = Image.new("RGB", (1388, 920), "#eaeef2")
    draw = ImageDraw.Draw(frame)
    draw.text((20, 14), caption.read_text(), font=font(22), fill="#1f2328")
    draw.text((20, 50), "Computer browser", font=font(16), fill="#636c76")
    draw.text((982, 50), "Mobile browser session", font=font(16), fill="#636c76")
    for suffix, x in (("desktop", 16), ("phone", 982)):
        with Image.open(source / f"{caption.stem}-{suffix}.png") as screenshot:
            frame.paste(screenshot.convert("RGB"), (x, 78))
    frames.append(frame.resize((1110, 736), Image.Resampling.LANCZOS).quantize(colors=128))
if len(frames) != 5:
    raise SystemExit("Capture the five demo steps first with CAPTURE_DEMO=1.")
frames[0].save(root / "docs/assets/demo.gif", save_all=True, append_images=frames[1:],
               duration=[2200, 2800, 1800, 2200, 3000], loop=0, optimize=True)
