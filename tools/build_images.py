#!/usr/bin/env python3
"""
Herramienta de desarrollo (no se sube a Hostinger).

Genera todas las imágenes WebP de la web a partir de las fotos originales
que están en "Documentos/Proyecto Parias". Corrige la orientación EXIF,
recorta, redimensiona y extrae el logo y el emblema con fondo transparente.

Uso:
    python tools/build_images.py --src "C:/Users/edeit/OneDrive/Documentos/Proyecto Parias"
"""

import argparse
import math
from pathlib import Path

from PIL import Image, ImageOps

CREAM = (237, 230, 214)

# id de salida → (archivo original, ancho máx., calidad, recorte relativo [x0, y0, x1, y1] o None)
PHOTOS = {
    "hero":             ("20260706_220831.jpg",          1920, 74, (0.0, 0.15, 1.0, 0.67)),
    "hero-mobile":      ("20260706_220831.jpg",          1080, 74, None),
    "pieza-frente":     ("20260703_125613.jpg",          1000, 86, (0.0, 0.21, 1.0, 0.96)),
    "pieza-espalda":    ("20260703_125635.jpg",          1000, 86, (0.0, 0.19, 1.0, 0.94)),
    "detalle-relieve":  ("IMG_20260709_170628_060.jpg",  1080, 80, None),
    "look-noche":       ("20260706_221538(1).jpg",       1100, 78, None),
    "look-espaldas":    ("20261012_144413.jpg",          960, 74, None),
    "look-frente":      ("20261012_144505.jpg",          960, 74, None),
    "envio-empaque":    ("20260703_124539.jpg",          1000, 78, (0.0, 0.0, 1.0, 0.92)),
}


def load(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    return im.convert("RGB")


def crop_rel(im, box):
    if not box:
        return im
    w, h = im.size
    return im.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))


def fit_width(im, max_w):
    if im.width <= max_w:
        return im
    return im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)


def save_webp(im, dst, quality, lossless=False):
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=quality, method=6, lossless=lossless)
    print(f"  {dst.name:28s} {im.size[0]}x{im.size[1]}  {dst.stat().st_size // 1024} KB")


# Fotos de producto muy oscuras: se levantan un poco las sombras para que se lea la silueta
LIFT_SHADOWS = {"pieza-frente", "pieza-espalda"}


def lift_shadows(im, gamma=0.82):
    table = [round(255 * (i / 255) ** gamma) for i in range(256)]
    return im.point(table * 3)


def build_photos(src, out):
    for name, (file, max_w, q, box) in PHOTOS.items():
        im = fit_width(crop_rel(load(src / file), box), max_w)
        if name in LIFT_SHADOWS:
            im = lift_shadows(im)
        save_webp(im, out / f"{name}.webp", q)


def tint_alpha(alpha, color):
    """Return RGBA image with a flat color and the given alpha mask."""
    img = Image.new("RGBA", alpha.size, color + (0,))
    img.putalpha(alpha)
    return img


def build_wordmark(src, out):
    """Logotipo SARYIAN en crema sobre transparente (desde la portada de Facebook)."""
    im = load(src / "Portada de Facebook Frase Motivacional Retro Rosa Rojo_20261021_194215_0000.png")
    lum = im.convert("L")
    # Solo trazos oscuros del logotipo (las líneas y el "MMXXVI" son gris claro)
    bbox = lum.point(lambda v: 255 if v < 120 else 0).getbbox()
    pad = 6
    bbox = (bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad)
    lum = lum.crop(bbox)
    bg, ink = 230, 34
    alpha = lum.point(lambda v: max(0, min(255, round((bg - v) / (bg - ink) * 255))))
    # Elimina restos de las líneas finas grises
    alpha = alpha.point(lambda a: 0 if a < 40 else a)
    logo = tint_alpha(alpha, CREAM)
    save_webp(logo, out / "logo-saryian.webp", 92)


def circle_geometry(lum):
    mask = lum.point(lambda v: 255 if v < 140 else 0)
    x0, y0, x1, y1 = mask.getbbox()
    return (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2


def build_emblem(src, out):
    """Emblema del sol: versión original (círculo + rayos) y versión solo rayos en crema."""
    im = load(src / "Canvas.png")
    lum = im.convert("L")
    cx, cy, r = circle_geometry(lum)
    box = (round(cx - r - 4), round(cy - r - 4), round(cx + r + 4), round(cy + r + 4))
    lum = lum.crop(box)
    w, h = lum.size
    c = w / 2
    px = lum.load()

    disc = Image.new("L", (w, h), 0)
    rays = Image.new("L", (w, h), 0)
    dp, rp = disc.load(), rays.load()
    bg, circle, ray = 252, 36, 87
    for y in range(h):
        for x in range(w):
            v = px[x, y]
            d = math.hypot(x + 0.5 - c, y + 0.5 - c)
            # Disco: opaco dentro, borde suavizado contra el blanco
            if d < r - 3:
                dp[x, y] = 255
                rp[x, y] = max(0, min(255, round((v - circle) / (ray - circle) * 255)))
            else:
                dp[x, y] = max(0, min(255, round((bg - v) / (bg - circle) * 255)))

    # Emblema original: gris oscuro con rayos gris medio (igual que en la playera)
    rgb = Image.merge("RGB", (lum, lum, lum))
    emblem = rgb.convert("RGBA")
    emblem.putalpha(disc)
    emblem = emblem.resize((640, 640), Image.LANCZOS)
    save_webp(emblem, out / "emblema.webp", 90)

    # Solo rayos, en crema, para el sol decorativo
    sun = tint_alpha(rays, CREAM).resize((900, 900), Image.LANCZOS)
    save_webp(sun, out / "sol-rayos.webp", 88)

    # Favicons (PNG: máxima compatibilidad en pestañas de Safari)
    for size in (32, 180):
        fav = emblem.resize((size, size), Image.LANCZOS)
        dst = out.parent / f"favicon-{size}.png"
        fav.save(dst, "PNG", optimize=True)
        print(f"  {dst.name:28s} {size}x{size}  {dst.stat().st_size // 1024} KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "assets" / "img"))
    args = ap.parse_args()
    src, out = Path(args.src), Path(args.out)
    print(f"\nFotos: {src}\nSalida: {out}\n")
    build_photos(src, out)
    build_wordmark(src, out)
    build_emblem(src, out)


if __name__ == "__main__":
    main()
