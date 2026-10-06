"""Draws the StockCheck app icons (a white tick on slate) as PNGs, using only the standard library.
Run: python3 scripts/make-icons.py"""
import struct, zlib

BG, FG = (15, 23, 42), (255, 255, 255)

def tick(size, padding):
    # The tick runs (0.28,0.52) -> (0.44,0.68) -> (0.74,0.36) of the drawable area.
    inner, off = size * (1 - 2 * padding), size * padding
    pts = [(off + x * inner, off + y * inner) for x, y in [(0.28, 0.52), (0.44, 0.68), (0.74, 0.36)]]
    width = inner * 0.09
    def near(px, py):
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            dx, dy = x2 - x1, y2 - y1
            t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
            if (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2 <= width ** 2:
                return True
        return False
    return near

def png(path, size, padding=0.0):
    near = tick(size, padding)
    rows = b''.join(b'\x00' + b''.join(bytes(FG if near(x + 0.5, y + 0.5) else BG) for x in range(size)) for y in range(size))
    chunk = lambda kind, data: struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))

png('public/icon-192.png', 192)
png('public/icon-512.png', 512)
png('public/icon-maskable-512.png', 512, padding=0.1)  # safe zone for Android's masks
png('public/apple-touch-icon.png', 180)
