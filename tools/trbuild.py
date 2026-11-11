# Builds public/char/<face>.webp from the transparent generations tr_<face>.png (each is a full re-render of her).
# Every re-render drifts by a pixel or two and redraws the hair a little differently, which shows as a jump when
# the expression changes. So each one is (1) registered to the neutral frame with sub-pixel shifts and (2) pasted
# onto neutral only where the face actually changed; everything else is neutral's own pixels.
# usage: tr_build.py <out-dir>
import pathlib, sys
import numpy as np
from PIL import Image
from scipy import ndimage

W, H = 1672, 941
HEAD = (slice(120, 520), slice(400, 760))        # y, x: where expressions may change anything

def load(f):
    a = np.asarray(Image.open(f"tr_{f}.png").convert("RGBA").resize((W, H), Image.LANCZOS), dtype=np.float32) / 255
    a[..., :3] *= a[..., 3:]                      # premultiplied, so shifting and blending do not bleed colour
    return a

def register(n, e):
    """Sub-pixel shift (dy, dx) of e that best matches n on the body, outside the head box."""
    ys, xs = slice(560, 780), slice(250, 900)
    ref = n[ys, xs, 3] * 0 + n[ys, xs, :3].sum(-1) + n[ys, xs, 3]
    best = (1e9, 0, 0)
    for dy in np.arange(-3, 3.01, .25):
        for dx in np.arange(-3, 3.01, .25):
            s = ndimage.shift(e[ys, xs, :3].sum(-1) + e[ys, xs, 3], (dy, dx), order=1, mode="nearest")
            err = np.abs(s[8:-8, 8:-8] - ref[8:-8, 8:-8]).mean()
            if err < best[0]: best = (err, dy, dx)
    return best

def face_weight(n, e):
    d = np.abs(e - n).max(-1)
    m = np.zeros((H, W), bool); m[HEAD] = d[HEAD] > 0.10
    m = ndimage.binary_opening(m, iterations=1)
    m = ndimage.binary_closing(m, iterations=10)
    m = ndimage.binary_fill_holes(m)
    m = ndimage.binary_dilation(m, iterations=6)
    return ndimage.gaussian_filter(m.astype(np.float32), 4)[..., None]

if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    n = load("neutral")
    def save(name, p):
        a = p[..., 3:]; rgb = np.where(a > 1e-4, p[..., :3] / np.maximum(a, 1e-4), 0)
        Image.fromarray((np.clip(np.dstack([rgb, a]), 0, 1) * 255 + .5).astype(np.uint8), "RGBA").save(out / f"{name}.webp", quality=92, method=6, exact=True)
    save("neutral", n)
    for f in ["happy", "shy", "sleepy", "think", "cheer", "blink"]:
        e = load(f)
        err, dy, dx = register(n, e)
        e = np.stack([ndimage.shift(e[..., c], (dy, dx), order=1, mode="nearest") for c in range(4)], -1)
        w = face_weight(n, e)
        save(f, n * (1 - w) + e * w)
        print(f, "shift (%.2f, %.2f) residual %.4f, face area %d px" % (dx, dy, err, int((w > .5).sum())))
