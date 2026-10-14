"""Draws the StockCheck app icons from the Netrisyl "Ni" octagon badge in brand/netrisyl-logo.png.
Needs Pillow and NumPy (a dev-time tool only; the app does not depend on them).

  python3 scripts/make-icons.py                              # public/: white background
  python3 scripts/make-icons.py --out DIR --background navy  # somewhere else, or the navy alternative
  python3 scripts/make-icons.py --out DIR --sheet            # both backgrounds plus a preview sheet

Only the badge is used, never the whole wide logo. In the logo the orange arrow's tail and the globe's edge
overlap the badge's lower right, so the badge is cut out along its own octagon outline, the damaged part of
its border is rebuilt from the (symmetric) left side, and the plain white inside is cleaned. The N and the i
are untouched.
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw

LOGO = os.path.join(os.path.dirname(__file__), '..', 'brand', 'netrisyl-logo.png')
NAVY, WHITE = (4, 26, 71), (255, 255, 255)  # the app's --color-brand-navy; plain white

# The octagon outline measured on the logo (pixels), clockwise from the top-left of the flat top edge.
OUTER = [(366, 310), (621, 310), (690, 380), (690, 637), (613, 722), (374, 722), (297, 637), (297, 381)]
RING = 15  # border thickness
CX = (297 + 690) / 2  # the badge's vertical axis of symmetry
DAMAGE_FROM_Y = 585  # below this, the right-hand border is overlapped by the arrow tail
LETTERS_BOTTOM = 630  # the N and the i end at about y = 627
CLEAR_RIGHT_OF = 645  # right of the i nothing belongs inside the octagon
PAD = 6  # the cut-out is cropped this far outside the octagon


def offset_polygon(points, d):
    """The polygon moved inwards by d (works for a convex polygon given clockwise in image coordinates)."""
    n, lines = len(points), []
    for i in range(n):
        (x1, y1), (x2, y2) = points[i], points[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        length = (dx * dx + dy * dy) ** 0.5
        nx, ny = -dy / length, dx / length  # for clockwise points in image coordinates this points inwards
        lines.append(((x1 + nx * d, y1 + ny * d), (dx, dy)))
    out = []
    for i in range(n):
        (p, u), (q, v) = lines[i - 1], lines[i]
        det = u[0] * -v[1] + u[1] * v[0]
        t = ((q[0] - p[0]) * -v[1] + (q[1] - p[1]) * v[0]) / det
        out.append((p[0] + t * u[0], p[1] + t * u[1]))
    return out


def polygon_mask(size, points, scale=4):
    """An anti-aliased 0..1 mask of the polygon, drawn at `scale` times the size and shrunk."""
    big = Image.new('L', (size[0] * scale, size[1] * scale), 0)
    ImageDraw.Draw(big).polygon([(x * scale, y * scale) for x, y in points], fill=255)
    return np.asarray(big.resize(size, Image.LANCZOS), dtype=float) / 255


def badge():
    """The badge as RGBA: the octagon with its border repaired, transparent outside."""
    logo = np.asarray(Image.open(LOGO).convert('RGB'), dtype=float)
    h, w, _ = logo.shape
    size = (w, h)
    inner_mask = polygon_mask(size, offset_polygon(OUTER, RING))
    outer_mask = polygon_mask(size, OUTER)
    ys, xs = np.mgrid[0:h, 0:w]

    rgb = logo.copy()
    ring = (outer_mask > 0) & (inner_mask < 1)
    # 1. The border below the arrow's reach, on the right half: take it from the mirror image on the left.
    damaged_ring = ring & (xs > CX) & (ys > DAMAGE_FROM_Y)
    mirrored = np.clip(np.round(2 * CX - xs[damaged_ring]).astype(int), 0, w - 1)
    rgb[damaged_ring] = logo[ys[damaged_ring], mirrored]
    # 2. The plain white inside: clear what is below the letters and to the right of the i (that is the arrow).
    inside = inner_mask >= 1
    clear = inside & (((ys > LETTERS_BOTTOM)) | (xs > CLEAR_RIGHT_OF))
    rgb[clear] = 255
    # Alpha: the octagon, shrunk by a pixel so the light fringe of the original's anti-aliasing is not carried over.
    alpha = polygon_mask(size, offset_polygon(OUTER, 1.0))
    x0, y0 = min(p[0] for p in OUTER) - PAD, min(p[1] for p in OUTER) - PAD
    x1, y1 = max(p[0] for p in OUTER) + PAD, max(p[1] for p in OUTER) + PAD
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA').crop((int(x0), int(y0), int(x1), int(y1)))


def icon(badge_img, size, background, fill):
    """A square icon: the badge centred on the background, `fill` of the width wide (the octagon, not the crop)."""
    canvas = Image.new('RGBA', (size, size), background + (255,))
    octagon_w = max(p[0] for p in OUTER) - min(p[0] for p in OUTER)
    scale = (size * fill) / octagon_w
    resized = badge_img.resize((round(badge_img.width * scale), round(badge_img.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas.convert('RGB')


# How much of the icon's width the octagon takes. The maskable icon keeps the whole octagon inside the
# central circle of radius 40% (Android's safe zone), which is stricter than the central 80% square.
FILL = 0.70
OCT_R = max(((x - CX) ** 2 + (y - (310 + 722) / 2) ** 2) ** 0.5 for x, y in OUTER)  # centre to farthest corner
MASKABLE_FILL = 0.40 * (max(p[0] for p in OUTER) - min(p[0] for p in OUTER)) / OCT_R * 0.97  # corners just inside the circle

ICONS = [('icon-192.png', 192, FILL), ('icon-512.png', 512, FILL), ('icon-maskable-512.png', 512, MASKABLE_FILL), ('apple-touch-icon.png', 180, FILL)]


def write_set(folder, background):
    os.makedirs(folder, exist_ok=True)
    b = badge()
    for name, size, fill in ICONS:
        icon(b, size, background, fill).save(os.path.join(folder, name), optimize=True)


def sheet(folder):
    """A contact sheet: both backgrounds, with the maskable icon also shown under a circle and a rounded-square mask."""
    cell, gap = 256, 24
    out = Image.new('RGB', (4 * cell + 5 * gap, 3 * cell + 4 * gap), (226, 232, 240))
    for row, name in enumerate(['white', 'navy']):
        x = gap
        for file, _, _ in ICONS:
            im = Image.open(os.path.join(folder, name, file)).resize((cell, cell), Image.LANCZOS)
            out.paste(im, (x, gap + row * (cell + gap)))
            x += cell + gap
    # the maskable icons under a circle mask, as Android may show them
    for i, name in enumerate(['white', 'navy']):
        im = Image.open(os.path.join(folder, name, 'icon-maskable-512.png')).resize((cell, cell), Image.LANCZOS)
        mask = Image.new('L', (cell, cell), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, cell - 1, cell - 1), fill=255)
        out.paste(im, (gap + i * (cell + gap), 2 * (cell + gap) + gap), mask)
    out.save(os.path.join(folder, 'preview-sheet.png'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'public'))
    parser.add_argument('--background', choices=['white', 'navy'], default='white')
    parser.add_argument('--sheet', action='store_true', help='write white/ and navy/ sets and a preview sheet into --out')
    args = parser.parse_args()
    if args.sheet:
        write_set(os.path.join(args.out, 'white'), WHITE)
        write_set(os.path.join(args.out, 'navy'), NAVY)
        sheet(args.out)
        Image.fromarray(np.asarray(badge())).save(os.path.join(args.out, 'badge-cutout.png'))
    else:
        write_set(args.out, NAVY if args.background == 'navy' else WHITE)
