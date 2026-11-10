# Keys the white background out of each scene's clock sprite, finds the blank display quad, writes
# public/props/clock_<scene>.webp and public/props/clock.json (display corners as fractions of the sprite).
import json, pathlib
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFilter

src = pathlib.Path("/home/node/scratch/tmp/cp-art")
out = pathlib.Path("/home/node/chillpulse/public/props")
out.mkdir(parents=True, exist_ok=True)
meta = {}
for s in ["rain", "day", "dusk", "snow"]:
    im = Image.open(src / f"clk5_{s}_white.png").convert("RGB")
    m = im.copy()
    for pt in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)]:
        ImageDraw.floodfill(m, pt, (255, 0, 255), thresh=40)
    a = np.asarray(m)
    bg = (a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 255)
    lab, _ = ndimage.label(~bg)
    fg = lab == lab[im.height // 2, im.width // 2]  # keep only the clock, drop stray specks
    alpha = Image.fromarray(np.where(fg, 255, 0).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)
    bb = alpha.point(lambda v: 255 if v > 20 else 0).getbbox()
    rgba = rgba.crop(bb)
    W, H = rgba.size
    # display = the dark connected region around the sprite center
    lum = np.asarray(rgba.convert("L"), dtype=np.float32)
    box = lum[int(H * 0.4):int(H * 0.7), int(W * 0.3):int(W * 0.7)]
    dy, dx = np.unravel_index(np.argmin(box), box.shape)
    seed = (int(W * 0.3) + int(dx), int(H * 0.4) + int(dy))
    darkmask = (lum < lum[seed[1], seed[0]] + 70) & (np.asarray(rgba.getchannel("A")) > 200)
    labels, _ = ndimage.label(darkmask)
    ys, xs = np.where(labels == labels[seed[1], seed[0]])
    print(s, "seed", seed, "region", len(xs))
    pts = np.stack([xs, ys], 1).astype(np.float32)
    tl, tr = pts[np.argmin(pts.sum(1))], pts[np.argmax(pts[:, 0] - pts[:, 1])]
    br, bl = pts[np.argmax(pts.sum(1))], pts[np.argmin(pts[:, 0] - pts[:, 1])]
    c = (tl + tr + br + bl) / 4
    quad = [c + (p - c) * 0.9 for p in (tl, tr, br, bl)]  # inset 10% so the digits stay inside the glass
    meta[s] = {"aspect": W / H, "quad": [[float(p[0] / W), float(p[1] / H)] for p in quad]}
    rgba.resize((600, round(600 * H / W)), Image.LANCZOS).save(out / f"clock_{s}.webp", quality=92, method=6)
    print(s, (W, H), [[round(v, 3) for v in q] for q in meta[s]["quad"]])
(out / "clock.json").write_text(json.dumps(meta))
