"""Draws the StockCheck app icons from the Netrisyl "Ni" octagon badge in brand/netrisyl-logo.png.
Needs Pillow and NumPy (a dev-time tool only; the app does not depend on them).

  python3 scripts/make-icons.py                              # public/: white background
  python3 scripts/make-icons.py --out DIR --background navy  # somewhere else, or the navy alternative
  python3 scripts/make-icons.py --out DIR --sheet            # both backgrounds plus a preview sheet

Only the badge is used, never the whole wide logo. In the logo the orange arrow's tail and the globe's edge
overlap the badge, and its border is lit differently on each side with a hard step down the left. So the
border is REDRAWN, not copied: one cross-section all the way round (outer rim, pale highlight, gold band,
dark inner line) with a smooth gold-to-orange gradient from top to bottom, anti-aliased from the distance to
the octagon's outline. Inside, everything is pure white except the N and the i, which are the original pixels.
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw

LOGO = os.path.join(os.path.dirname(__file__), '..', 'brand', 'netrisyl-logo.png')
NAVY, WHITE = (4, 26, 71), (255, 255, 255)  # the app's --color-brand-navy; plain white

# The octagon outline measured on the logo (pixels), clockwise from the top-left of the flat top edge.
OUTER = [(366, 310), (621, 310), (690, 380), (690, 637), (613, 722), (374, 722), (297, 637), (297, 381)]
RING = 19  # border thickness: its inner edge is where the logo's own border ends
CX = (297 + 690) / 2
PAD = 6  # the cut-out is cropped this far outside the octagon
Y0, Y1 = 310, 722

# Where the N, the i's stem and the i's dot are in the logo. Nothing else inside the octagon is kept
# (the arrow's tail is: it ends below y = 612 and right of x = 634).
GLYPHS = [(340, 392, 552, 632), (572, 460, 634, 632), (566, 374, 644, 452)]  # x0, y0, x1, y1
HALO = 235  # inside a glyph box, near-white pixels (lowest channel at or above this) are the background: pure white

# The border: colours down the cross-section, from the outer edge (d = 0) inwards. 'band' is the gold-to-orange gradient.
GOLD, ORANGE = np.array([255, 200, 62.0]), np.array([240, 112, 8.0])
RIM, HIGHLIGHT, DARK = np.array([214, 100, 8.0]), np.array([255, 238, 168.0]), np.array([118, 34, 4.0])
PROFILE = [(0.0, 'rim'), (2.2, 'rim'), (3.2, 'highlight'), (4.4, 'highlight'), (6.0, 'band'), (15.0, 'band'), (16.6, 'dark'), (RING, 'dark')]


def inside_distance(points, xs, ys):
    """How far inside the (convex, clockwise) polygon each point is; negative outside."""
    d = np.full(xs.shape, np.inf)
    n = len(points)
    for i in range(n):
        (x1, y1), (x2, y2) = points[i], points[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        length = (dx * dx + dy * dy) ** 0.5
        d = np.minimum(d, ((xs - x1) * -dy + (ys - y1) * dx) / length)
    return d


def band_gradient(ys):
    """Gold at the top, orange at the bottom, smooth in between (one gradient for the whole octagon)."""
    t = np.clip((ys - Y0) / (Y1 - Y0), 0, 1)
    t = t * t * (3 - 2 * t)
    return GOLD[None, :] * (1 - t)[:, None] + ORANGE[None, :] * t[:, None]


def border_colour(d, ys):
    """The border's colour at distance d from the outer edge, for pixels at height ys (flat arrays)."""
    colour = {'rim': RIM, 'highlight': HIGHLIGHT, 'dark': DARK}
    out = np.zeros((len(d), 3))
    band = band_gradient(ys)
    shade = 1 + 0.04 * np.sin(np.clip((d - 6.0) / 9.0, 0, 1) * np.pi)  # a faint cylinder-like swell across the band
    for (d0, k0), (d1, k1) in zip(PROFILE, PROFILE[1:]):
        m = (d >= d0) & (d < d1)
        t = ((d[m] - d0) / (d1 - d0))[:, None]
        c0 = band[m] * shade[m][:, None] if k0 == 'band' else colour[k0][None, :]
        c1 = band[m] * shade[m][:, None] if k1 == 'band' else colour[k1][None, :]
        out[m] = c0 * (1 - t) + c1 * t
    out[d < PROFILE[0][0]] = RIM
    out[d >= RING] = DARK
    return np.clip(out, 0, 255)


def interior_colour(logo):
    """Pure white everywhere except the N and the i, whose original pixels are kept (their pale halo goes white)."""
    h, w, _ = logo.shape
    out = np.full((h, w, 3), 255.0)
    keep = np.zeros((h, w), bool)
    for x0, y0, x1, y1 in GLYPHS:
        keep[y0:y1, x0:x1] = True
    keep &= logo.min(axis=2) < HALO
    out[keep] = logo[keep]
    return out


def badge():
    """The badge as RGBA: the octagon with a rebuilt border and a pure white inside, transparent outside."""
    logo = np.asarray(Image.open(LOGO).convert('RGB'), dtype=float)
    h, w, _ = logo.shape
    ys, xs = np.mgrid[0:h, 0:w]
    px, py = xs + 0.5, ys + 0.5
    d = inside_distance(OUTER, px, py)

    rgb = interior_colour(logo)
    near = d < RING + 1
    ring = border_colour(d[near], py[near])
    inner = np.clip(RING + 0.5 - d[near], 0, 1)[:, None]  # the border's inner edge, anti-aliased
    rgb[near] = ring * inner + rgb[near] * (1 - inner)

    alpha = np.clip(d + 0.5, 0, 1)  # the outer edge, anti-aliased from the distance to the outline
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    x0, y0 = min(p[0] for p in OUTER) - PAD, min(p[1] for p in OUTER) - PAD
    x1, y1 = max(p[0] for p in OUTER) + PAD, max(p[1] for p in OUTER) + PAD
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
