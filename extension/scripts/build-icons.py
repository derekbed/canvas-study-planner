from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
for size in (16, 32, 48, 128):
    scale = 8
    image = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    factor = size * scale / 64
    box = lambda points: tuple(round(value * factor) for value in points)
    draw.rounded_rectangle(box((0, 0, 64, 64)), radius=round(15 * factor), fill="#3158dd")
    for line in ((18, 21, 46, 21), (22, 16, 22, 26), (42, 16, 42, 26),
                 (18, 21, 18, 48), (18, 48, 46, 48), (46, 48, 46, 21)):
        draw.line(box(line), fill="white", width=round(5 * factor), joint="curve")
    draw.line(box((25, 35, 30, 40, 40, 29)), fill="white", width=round(5 * factor), joint="curve")
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f"icon{size}.png")
