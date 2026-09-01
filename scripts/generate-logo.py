#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path("/workspace/PDFTOOL")

PURPLE_TOP = (107, 78, 255)
PURPLE_BOT = (61, 40, 216)
PURPLE_MID = (81, 52, 244)
WHITE = (255, 255, 255)
INK = (19, 32, 59)
MUTED = (86, 98, 122)
GREEN = (23, 169, 98)
RED = (239, 51, 64)
LINE = (196, 186, 255)
FOLD = (226, 221, 255)
FOLD_EDGE = (186, 176, 245)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))


def load_font(px):
    for path in ("/tmp/Inter-ExtraBold.ttf", "/tmp/Inter-Bold.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, px)
    return ImageFont.load_default()


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def fill_vertical_gradient(size, top, bot):
    im = Image.new("RGB", (size, size))
    px = im.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        t = t * t * (3 - 2 * t)
        c = mix(top, bot, t)
        for x in range(size):
            px[x, y] = c
    return im


def add_radial_highlight(im, strength=0.16):
    w, h = im.size
    overlay = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    ImageDraw.Draw(overlay).ellipse(
        (-int(w * 0.15), -int(h * 0.55), int(w * 1.15), int(h * 0.62)),
        fill=(255, 255, 255, int(255 * strength)),
    )
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=max(8, w // 18)))
    return Image.alpha_composite(im.convert("RGBA"), overlay)


def render_mark(size):
    """Square app icon: purple tile, folded document, brand e."""
    s = size * 4
    radius = int(s * 0.22)
    bg = add_radial_highlight(fill_vertical_gradient(s, PURPLE_TOP, PURPLE_BOT), 0.16)
    icon = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    icon.paste(bg.convert("RGBA"), (0, 0), rounded_mask(s, radius))

    m = int(s * 0.17)
    r = int(s * 0.10)
    fold = int(s * 0.20)

    doc_mask = Image.new("L", (s, s), 0)
    dd = ImageDraw.Draw(doc_mask)
    dd.rounded_rectangle((m, m, s - m, s - m), radius=r, fill=255)
    dd.polygon(
        [(s - m - fold - 1, m - 2), (s - m + 2, m - 2), (s - m + 2, m + fold + 1)],
        fill=0,
    )
    white = Image.new("RGBA", (s, s), (*WHITE, 255))
    icon.paste(white, (0, 0), doc_mask)

    d = ImageDraw.Draw(icon)
    d.polygon(
        [
            (s - m - fold, m),
            (s - m, m + fold),
            (s - m - fold, m + fold),
        ],
        fill=FOLD,
    )
    edge_w = max(2, s // 160)
    d.line(
        [(s - m - fold, m + 1), (s - m - fold, m + fold), (s - m - 1, m + fold)],
        fill=FOLD_EDGE,
        width=edge_w,
    )

    font_size = int(s * (0.50 if size >= 48 else 0.58))
    font = load_font(font_size)
    letter = "e"
    bbox = d.textbbox((0, 0), letter, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (s - tw) // 2 - bbox[0] - int(s * 0.02)
    ty = int(s * (0.26 if size >= 64 else 0.24)) - bbox[1]
    d.text((tx, ty), letter, font=font, fill=PURPLE_MID)

    if size >= 64:
        lw = max(5, int(s * 0.026))
        x0 = int(s * 0.30)
        y = int(s * 0.64)
        gap = int(s * 0.055)
        for i, frac in enumerate((0.36, 0.28)):
            yy = y + i * gap
            d.rounded_rectangle((x0, yy, x0 + int(s * frac), yy + lw), radius=lw // 2, fill=LINE)

    return icon.resize((size, size), Image.Resampling.LANCZOS)


def render_wordmark(height=160):
    mark = render_mark(height)
    font_main = load_font(int(height * 0.46))
    font_sub = load_font(int(height * 0.16))
    e, pdf, conv = "e", "PDF", "Converter"
    sub = "All-in-One PDF & Image Tools"
    scratch = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    be = scratch.textbbox((0, 0), e, font=font_main)
    bp = scratch.textbbox((0, 0), pdf, font=font_main)
    bc = scratch.textbbox((0, 0), conv, font=font_main)
    bs = scratch.textbbox((0, 0), sub, font=font_sub)
    gap = int(height * 0.16)
    text_w = max((be[2] - be[0]) + (bp[2] - bp[0]) + (bc[2] - bc[0]), bs[2] - bs[0])
    width = mark.width + gap + text_w + int(height * 0.12)
    im = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    im.paste(mark, (0, 0), mark)
    d = ImageDraw.Draw(im)
    x = mark.width + gap
    main_h = be[3] - be[1]
    y0 = (height - (main_h + int(height * 0.10) + (bs[3] - bs[1]))) // 2 - be[1] + int(height * 0.04)
    d.text((x, y0), e, font=font_main, fill=GREEN)
    x1 = x + (be[2] - be[0])
    d.text((x1, y0), pdf, font=font_main, fill=RED)
    x2 = x1 + (bp[2] - bp[0])
    d.text((x2, y0), conv, font=font_main, fill=INK)
    d.text((x, y0 + main_h + int(height * 0.08) - bs[1] + be[1]), sub, font=font_sub, fill=MUTED)
    return im


def save_png(im, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)
    print("wrote", path, im.size)


def main():
    icons = ROOT / "icons"
    icons.mkdir(exist_ok=True)

    mapping = {
        16: icons / "favicon-16.png",
        32: icons / "favicon-32.png",
        48: icons / "favicon-48.png",
        96: icons / "favicon-96.png",
        180: ROOT / "apple-touch-icon.png",
        192: ROOT / "favicon.png",
        512: icons / "icon-512.png",
    }
    for size, dest in mapping.items():
        save_png(render_mark(size), dest)
    save_png(render_mark(180), icons / "apple-touch-icon.png")
    save_png(render_mark(192), icons / "icon-192.png")
    save_png(render_mark(48), icons / "logo-mark.png")
    save_png(render_mark(96), icons / "logo-mark-2x.png")

    ico = [render_mark(s) for s in (16, 32, 48)]
    ico[0].save(ROOT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[1:])
    print("wrote", ROOT / "favicon.ico")

    save_png(render_wordmark(160), icons / "logo-wordmark.png")

    og = Image.new("RGB", (1200, 630), (247, 248, 255))
    orb = Image.new("RGBA", (1200, 630), (0, 0, 0, 0))
    od = ImageDraw.Draw(orb)
    od.ellipse((780, -80, 1280, 420), fill=(117, 88, 255, 38))
    od.ellipse((-120, 360, 420, 780), fill=(23, 169, 98, 28))
    og = Image.alpha_composite(og.convert("RGBA"), orb.filter(ImageFilter.GaussianBlur(40))).convert("RGB")
    mark = render_mark(220)
    og.paste(mark, (90, (630 - 220) // 2), mark)
    font_lg = load_font(72)
    font_sm = load_font(28)
    d = ImageDraw.Draw(og)
    x, y = 350, 210
    d.text((x, y), "e", font=font_lg, fill=GREEN)
    we = d.textbbox((x, y), "e", font=font_lg)
    d.text((we[2], y), "PDF", font=font_lg, fill=RED)
    wp = d.textbbox((we[2], y), "PDF", font=font_lg)
    d.text((wp[2], y), "Converter", font=font_lg, fill=INK)
    d.text((x, y + 96), "Free online PDF & image tools", font=font_sm, fill=MUTED)
    save_png(og.convert("RGBA"), icons / "og-image.png")

    svg = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="ePDFConverter">
  <defs>
    <linearGradient id="epdfBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6B4EFF"/>
      <stop offset="100%" stop-color="#3D28D8"/>
    </linearGradient>
    <clipPath id="epdfDoc">
      <path d="M87 87h234L425 191v234c0 29-23 52-52 52H87c-29 0-52-23-52-52V139c0-29 23-52 52-52z"/>
    </clipPath>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#epdfBg)"/>
  <rect x="87" y="87" width="338" height="338" rx="52" fill="#ffffff" clip-path="url(#epdfDoc)"/>
  <path d="M321 87l104 104H321V87z" fill="#E2DDFF"/>
  <path d="M321 87v104H425" fill="none" stroke="#BAB0F5" stroke-width="8" stroke-linejoin="round"/>
  <text x="248" y="312" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="248" fill="#5134F4">e</text>
  <rect x="154" y="352" width="188" height="16" rx="8" fill="#C4BAFF"/>
  <rect x="154" y="384" width="148" height="16" rx="8" fill="#C4BAFF"/>
  <rect x="154" y="416" width="108" height="16" rx="8" fill="#C4BAFF"/>
</svg>
"""
    (icons / "logo.svg").write_text(svg)
    (ROOT / "favicon.svg").write_text(svg)
    print("wrote", icons / "logo.svg")


if __name__ == "__main__":
    main()
