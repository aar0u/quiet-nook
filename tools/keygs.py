# Keys the girl out of her green-screen frames: soft alpha, colour unmixing and despill.
# usage: keygs.py <out-dir> [frame ...]   (reads gs_<frame>.png from the cp-art folder)
import pathlib, sys
import numpy as np
from PIL import Image
from scipy import ndimage

src = pathlib.Path("/home/node/scratch/tmp/cp-art")

def key(path):
    im = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    bg = np.median(im[20:300, 1200:1650].reshape(-1, 3), axis=0)        # a patch of pure screen, far from her
    dom = g - np.maximum(r, b)                                          # how green a pixel is
    dom_bg = float(bg[1] - max(bg[0], bg[2]))
    # I = a*F + (1-a)*B with F roughly neutral wrt green, so a ~ 1 - dom/dom_bg; the ends are snapped so flat
    # areas are exactly 0 or 1 and only the true edge keeps partial alpha
    a = np.clip(1 - dom / dom_bg, 0, 1)
    a = np.clip((a - 0.03) / 0.94, 0, 1)
    # unmix the colour: F = (I - (1-a)*B) / a, then despill any green that is left
    F = (im - (1 - a[..., None]) * bg) / np.maximum(a[..., None], 0.05)
    F = np.clip(F, 0, 1)
    F[..., 1] = np.minimum(F[..., 1], np.maximum(F[..., 0], F[..., 2]))
    # Dark hair lit by the green screen picks up a green cast (green bounce light), and its edge pixels still carry
    # some of the screen. Pull green down to the red/blue average wherever the pixel is dark or only partly opaque.
    lum = F @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    avg = 0.5 * (F[..., 0] + F[..., 2])
    cast = (lum < 0.38) | (a < 0.97)
    F[..., 1] = np.where(cast, np.minimum(F[..., 1], avg * 0.97), F[..., 1])
    # Colour bleed: the unmixed colour of a half-transparent edge pixel is the noisiest number in the image (it is a
    # small difference of large numbers), and on thin hair it shows as light and dark fringes that twinkle when she
    # moves. Give every edge pixel the colour of the nearest solid pixel instead; only its alpha is kept.
    solid = a > 0.95
    dist, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    edge = (~solid) & (a > 0.0) & (dist <= 6)
    F = np.where(edge[..., None], F[iy, ix], F)
    # drop specks that are not connected to her
    lab, n = ndimage.label(a > 0.08)
    if n:
        sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 400])
        a = a * ndimage.binary_dilation(keep, iterations=2)
    F[a < 0.02] = 0
    return np.dstack([F, a])

def contamination(rgba):
    """Pixels, left of her sleeve, that are light and only partly opaque. Between the long hair strands the model
    sometimes paints a pale shape (skin or cardigan colour) instead of leaving green, and it keys as exactly this.
    Used to choose between generations; the key itself is never forced."""
    a, lum = rgba[..., 3], rgba[..., :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    zone = np.zeros(a.shape, bool)
    zone[430:, :345] = True
    return int((zone & (a > 0.03) & (a < 0.97) & (lum > 0.30)).sum())

if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for name in sys.argv[2:] or ["neutral", "happy", "shy", "sleepy", "think", "cheer", "blink"]:
        rgba = key(src / f"gs_{name}.png")
        Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").save(out / f"{name}.webp", quality=92, method=6, exact=True)
        print(name, "ok", "alpha>0.5 px:", int((rgba[..., 3] > 0.5).sum()))
