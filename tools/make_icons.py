#!/usr/bin/env python3
"""Generate launcher icon mipmap PNGs for every density bucket from the master art."""
from PIL import Image, ImageDraw
import os

SRC = "android/res/icon_raw.png"
OUT = "android/res"
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE = 432  # 108dp @ xxxhdpi

master = Image.open(SRC).convert("RGBA")


def round_mask(size, radius_frac=0.14):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    r = int(size * radius_frac)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return m


def make_square(size):
    img = master.copy()
    side = min(img.size)
    img = img.crop(((img.width - side) // 2, (img.height - side) // 2,
                    (img.width + side) // 2, (img.height + side) // 2))
    img = img.resize((size, size), Image.LANCZOS)
    img.putalpha(round_mask(size))
    return img


for dpi, size in DENSITIES.items():
    d = os.path.join(OUT, "mipmap-" + dpi)
    os.makedirs(d, exist_ok=True)
    make_square(size).save(os.path.join(d, "ic_launcher.png"))
    print("icon", dpi, size)

# adaptive icon foreground: art inside the 66% safe zone, transparent margin
fg = Image.new("RGBA", (ADAPTIVE, ADAPTIVE), (0, 0, 0, 0))
art = make_square(int(ADAPTIVE * 0.70)).resize((int(ADAPTIVE * 0.70),) * 2, Image.LANCZOS)
off = (ADAPTIVE - art.width) // 2
fg.paste(art, (off, off), art)
d = os.path.join(OUT, "mipmap-anydpi-v26")
os.makedirs(d, exist_ok=True)
os.makedirs(os.path.join(OUT, "mipmap-xxxhdpi"), exist_ok=True)
fg.save(os.path.join(OUT, "mipmap-xxxhdpi", "ic_launcher_fg.png"))
# solid harbour-teal background
bg = Image.new("RGBA", (ADAPTIVE, ADAPTIVE), (12, 36, 52, 255))
bg.save(os.path.join(OUT, "mipmap-xxxhdpi", "ic_launcher_bg.png"))
print("adaptive fg/bg written")
