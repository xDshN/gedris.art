#!/usr/bin/env python3
"""
Сборка галереи: берёт отобранные исходники, чистит служебную метку
триальной Movavi, делает веб-версии и вклеивает разметку в index.html.

    python3 tools/build.py <selection.json> [папка с исходниками]

selection.json — список объектов:
    {"src": "...", "genre": "concert", "title": "...", "cap": "..."}

Если указана папка с исходниками, пути "src" считаются относительными от неё.
"""
import base64
import io
import json
import os
import re
import sys

from PIL import Image, ImageOps, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRID = os.path.join(ROOT, "assets/img/grid")
SMALL = os.path.join(ROOT, "assets/img/grid-sm")
FULL = os.path.join(ROOT, "assets/img/full")
PAGE = os.path.join(ROOT, "index.html")

GRID_H, GRID_W_MAX, GRID_Q = 820, 1700, 76      # сетка на десктопе
SMALL_H, SMALL_W_MAX, SMALL_Q = 460, 950, 74    # сетка на телефоне
FULL_MAX, FULL_Q = 2400, 82                     # полноэкранный просмотр

# порядок определяет порядок кнопок фильтра
GENRES = [
    ("concert", "Концерты и шоу"),
    ("event",   "События и форумы"),
    ("fashion", "Fashion"),
    ("art",     "Арт и портрет"),
    ("object",  "Предметная"),
    ("nature",  "Природа"),
]

# служебная метка триальной Movavi — плашка ровно этого цвета в углу кадра
WM_RGB = (1, 133, 198)
WM_TOL = (26, 16, 20)


def strip_watermark(im):
    """Ищет плашку Movavi в нижних углах и подрезает кадр выше неё."""
    W, H = im.size
    x0, y0 = int(W * 0.86), int(H * 0.88)
    corner = im.crop((x0, y0, W, H)).convert("RGB")
    px = corner.load()
    cw, ch = corner.size
    lo = [WM_RGB[i] - WM_TOL[i] for i in range(3)]
    hi = [WM_RGB[i] + WM_TOL[i] for i in range(3)]

    hits, top = 0, ch
    step = max(1, min(cw, ch) // 260)
    for y in range(0, ch, step):
        for x in range(0, cw, step):
            r, g, b = px[x, y]
            if lo[0] <= r <= hi[0] and lo[1] <= g <= hi[1] and lo[2] <= b <= hi[2]:
                hits += 1
                if y < top:
                    top = y
    # плашка занимает заметную площадь; одиночные попадания — это шум кадра
    if hits < 40:
        return im, False
    cut = y0 + top - int(H * 0.006)
    cut = max(int(H * 0.80), min(cut, H))
    return im.crop((0, 0, W, cut)), True


def lqip(im):
    """Крошечная размытая превьюшка — фон плитки до загрузки фото."""
    t = im.copy()
    t.thumbnail((22, 22))
    t = t.filter(ImageFilter.GaussianBlur(1.1))
    buf = io.BytesIO()
    t.convert("RGB").save(buf, "JPEG", quality=42)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;")
             .replace(">", "&gt;").replace('"', "&quot;"))


def main(sel_path, base=""):
    sel = json.load(open(sel_path, encoding="utf-8"))
    for it in sel:
        it["src"] = os.path.join(base, it["src"]) if base else it["src"]
    for d in (GRID, SMALL, FULL):
        os.makedirs(d, exist_ok=True)

    tiles, counts, cropped = [], {}, 0

    for n, it in enumerate(sel, 1):
        src = it["src"]
        im = Image.open(src)
        im = ImageOps.exif_transpose(im).convert("RGB")
        im, was = strip_watermark(im)
        cropped += was

        W, H = im.size
        ar = round(W / H, 3)
        slug = "%s-%02d" % (it["genre"], counts.get(it["genre"], 0) + 1)
        counts[it["genre"]] = counts.get(it["genre"], 0) + 1

        g = im.copy()
        g.thumbnail((GRID_W_MAX, GRID_H), Image.LANCZOS)
        g.save(os.path.join(GRID, slug + ".webp"), "WEBP", quality=GRID_Q, method=6)

        sm = im.copy()
        sm.thumbnail((SMALL_W_MAX, SMALL_H), Image.LANCZOS)
        sm.save(os.path.join(SMALL, slug + ".webp"), "WEBP", quality=SMALL_Q, method=6)

        f = im.copy()
        f.thumbnail((FULL_MAX, FULL_MAX), Image.LANCZOS)
        f.save(os.path.join(FULL, slug + ".webp"), "WEBP", quality=FULL_Q, method=6)

        alt = "%s — %s. Фотограф Мария Гедрис" % (it["title"], it["cap"])
        eager = n <= 4          # первый экран сетки грузим сразу
        tiles.append(
            '<figure class="tile reveal" tabindex="0" role="button" data-genre="{genre}"\n'
            '        data-full="assets/img/full/{slug}.webp" data-title="{title}" data-cap="{cap}"\n'
            '        aria-label="{alt}" style="--ar:{ar}">\n'
            '  <div class="tile-media" style="background-image:url({lq});background-size:cover">\n'
            '    <img src="assets/img/grid/{slug}.webp"\n'
            '         srcset="assets/img/grid-sm/{slug}.webp {sw}w, assets/img/grid/{slug}.webp {gw}w"\n'
            '         sizes="(max-width: 620px) 100vw, (max-width: 1000px) 50vw, 40vw"\n'
            '         alt="{alt}" width="{gw}" height="{gh}"\n'
            '         loading="{loading}" decoding="async" fetchpriority="{prio}">\n'
            '  </div>\n'
            '  <figcaption class="tile-cap">\n'
            '    <div><h3>{title}</h3><p>{cap}</p></div><span class="zoom" aria-hidden="true">↗</span>\n'
            '  </figcaption>\n'
            '</figure>'.format(genre=it["genre"], slug=slug, title=esc(it["title"]),
                               cap=esc(it["cap"]), alt=esc(alt), ar=ar, lq=lqip(im),
                               gw=g.size[0], gh=g.size[1], sw=sm.size[0],
                               loading="eager" if eager else "lazy",
                               prio="high" if n == 1 else "auto")
        )
        print("  %3d/%d  %-14s %s" % (n, len(sel), slug, os.path.basename(src)))

    # --- кнопки фильтра ---
    chips = ['<button data-genre="all" role="tab" aria-selected="true">Все<em>%d</em></button>' % len(sel)]
    for key, label in GENRES:
        if counts.get(key):
            chips.append('<button data-genre="%s" role="tab" aria-selected="false">%s<em>%d</em></button>'
                         % (key, label, counts[key]))

    html = open(PAGE, encoding="utf-8").read()
    html = re.sub(r"(<!-- FILTERS:START -->).*?(<!-- FILTERS:END -->)",
                  lambda m: m.group(1) + "\n        " + "\n        ".join(chips) + "\n        " + m.group(2),
                  html, flags=re.S)
    html = re.sub(r"(<!-- WORKS:START -->).*?(<!-- WORKS:END -->)",
                  lambda m: m.group(1) + "\n" + "\n".join(tiles) + "\n" + m.group(2),
                  html, flags=re.S)
    open(PAGE, "w", encoding="utf-8").write(html)

    print("\nкадров: %d, метка Movavi срезана на %d" % (len(sel), cropped))
    for key, label in GENRES:
        if counts.get(key):
            print("   %-18s %d" % (label, counts[key]))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "")
