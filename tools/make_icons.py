"""Renders the PWA icons (pure stdlib): a walnut-framed felt board with two checkers."""
import math, struct, zlib, os

def png(path, size, px):
    raw = b''.join(b'\x00' + bytes(sum((px(x, y) for x in range(size)), ())) for y in range(size))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

def mix(a, b, t): return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))
def clamp(v): return max(0.0, min(1.0, v))
def smooth(d, w): return clamp(0.5 - d / w)

def checker(u, v, cx, cy, r, white):
    dx, dy = u - cx, v - cy
    d = math.hypot(dx, dy) / r
    if d > 1.0: return None
    lx, ly = (dx / r + 0.35), (dy / r + 0.4)
    light = clamp(1 - math.hypot(lx, ly) * 0.75)
    if white: base = mix((190, 170, 120), (255, 250, 235), light)
    else: base = mix((12, 8, 7), (112, 96, 88), light ** 1.6)
    ring = abs(d - 0.68)
    if ring < 0.035: base = mix(base, (0, 0, 0), 0.28 if white else 0.0)
    if not white and ring < 0.035: base = mix(base, (150, 135, 125), 0.35)
    if d > 0.93: base = mix(base, (0, 0, 0), (d - 0.93) / 0.07 * 0.35)
    return base

def pixel_at(u, v):
    edge = min(u, 1 - u, v, 1 - v)
    if edge < 0.055:  # walnut frame
        g = 0.5 + 0.5 * math.sin(v * 150 + 4 * math.sin(u * 9) + math.sin(u * 40) * 0.6)
        c = mix((92, 52, 26), (140, 86, 44), g * 0.7 + (0.3 if edge > 0.045 else 0))
        if edge < 0.008: c = mix(c, (20, 10, 4), 0.6)
        return c
    # felt with vignette
    r = math.hypot(u - 0.5, v - 0.5)
    c = mix((44, 126, 80), (14, 58, 36), clamp(r * 1.5))
    # triangles top / bottom
    iu = (u - 0.055) / 0.89
    col = int(iu * 6)
    fx = iu * 6 - col
    tri = 1 - abs(2 * fx - 1)
    band = 0.27
    for top in (True, False):
        t = (v - 0.055) / band if top else (1 - 0.055 - v) / band
        if 0 <= t < tri:
            alt = (col % 2 == 0) == top
            tc = mix((170, 52, 42), (96, 24, 20), t) if alt else mix((240, 224, 180), (180, 154, 100), t)
            c = tc
    # soft shadow under checkers
    for cx, cy in ((0.405, 0.43), (0.595, 0.57)):
        sd = math.hypot(u - cx - 0.012, v - cy - 0.03) / 0.215
        if sd < 1.25: c = mix(c, (0, 0, 0), 0.45 * clamp(1.25 - sd))
    for cx, cy, white in ((0.405, 0.43, True), (0.595, 0.57, False)):
        k = checker(u, v, cx, cy, 0.2, white)
        if k: c = k
    return c

def make(size, path):
    ss = 2
    def px(x, y):
        acc = [0, 0, 0]
        for sy in range(ss):
            for sx in range(ss):
                c = pixel_at((x + (sx + .5) / ss) / size, (y + (sy + .5) / ss) / size)
                for i in range(3): acc[i] += c[i]
        return tuple(int(round(a / (ss * ss))) for a in acc)
    png(path, size, px)

out = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(out, exist_ok=True)
make(512, os.path.join(out, 'icon-512.png'))
make(192, os.path.join(out, 'icon-192.png'))
make(180, os.path.join(out, 'apple-touch-icon.png'))
print('ok')
