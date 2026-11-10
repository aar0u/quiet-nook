# Keys the white background out of each scene's clock sprite, finds the blank display quad, writes
# public/props/clock_<scene>.webp and public/props/clock.json (display corners as fractions of the sprite).
import json, math, pathlib
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFilter

src = pathlib.Path("/home/node/scratch/tmp/cp-art")
out = pathlib.Path("/home/node/scratch/quiet-nook/public/props")
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
    pix0 = np.asarray(im)
    # the generator leaves bright yellow blobs and a one-pixel white rim just outside the clock's outline
    yellow = (pix0[..., 0] > 170) & (pix0[..., 1] > 170) & (pix0[..., 2] < 110)
    keep = ~bg & ~ndimage.binary_dilation(yellow, iterations=3)
    keep = ndimage.binary_opening(keep, iterations=3)
    lab, _ = ndimage.label(keep)
    fg = ndimage.binary_fill_holes(lab == lab[im.height // 2, im.width // 2])  # only the clock, no stray specks
    # The key leaves a stair-stepped, speckled outline. Blur the hard mask and threshold it to get a smooth contour,
    # pull it in one pixel to drop the dark halo ring, then anti-alias it.
    soft = np.asarray(Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5)), dtype=np.float32) / 255
    smooth = ndimage.binary_erosion(soft > 0.5, iterations=3)
    # the bottom edge carries a row of dark specks; shave a few more pixels off the underside (the feet are tall enough)
    smooth = ndimage.binary_erosion(smooth, structure=np.ones((3, 1), bool), iterations=3)
    alpha_f = np.asarray(Image.fromarray((smooth * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0)), dtype=np.float32) / 255
    # edge colours still carry the black background: copy the nearest solid interior colour into the outer band
    interior = ndimage.binary_erosion(smooth, iterations=2)
    iy, ix = ndimage.distance_transform_edt(~interior, return_distances=False, return_indices=True)
    pix = np.asarray(im, dtype=np.uint8)
    rgb = np.where(interior[..., None], pix, pix[iy, ix])
    # a median over the outer band removes the one-pixel coloured specks the generator leaves along the edge
    band = smooth & ~ndimage.binary_erosion(smooth, iterations=7)
    rgb = np.where(band[..., None], ndimage.median_filter(rgb, size=(7, 7, 1)), rgb)
    full = Image.fromarray(np.dstack([rgb, (alpha_f * 255).astype(np.uint8)]), "RGBA")
    bb = full.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
    rgba = full.crop(bb)
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
    # about 2.4x the size it is drawn at, so the canvas downsamples it by a small factor instead of aliasing
    a = np.asarray(rgba, dtype=np.float32) / 255
    nw, nh = 420, round(420 * H / W)
    pm = Image.fromarray((a[..., :3] * a[..., 3:] * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)
    al = Image.fromarray((a[..., 3] * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)
    pa, aa = np.asarray(pm, dtype=np.float32) / 255, np.asarray(al, dtype=np.float32)[..., None] / 255
    final = np.dstack([np.clip(pa / np.maximum(aa, 1e-3), 0, 1) * 255, aa[..., 0] * 255]).astype(np.uint8)
    Image.fromarray(final, "RGBA").save(out / f"clock_{s}.webp", quality=95, method=6)
    # where the two feet touch the desk, and the slope of the line through them: char.js grounds the clock on these
    A = final[..., 3]
    fh, fw = A.shape
    def foot(x0, x1):
        ys, xs = np.where(A[:, int(fw * x0):int(fw * x1)] > 128)
        low = xs[ys >= ys.max() - 2]
        return [(int(fw * x0) + float(low.mean())) / fw, (int(ys.max()) + 1) / fh]
    feet = [foot(0.10, 0.30), foot(0.70, 0.90)]
    meta[s]["feet"] = feet
    meta[s]["slope"] = math.degrees(math.atan2((feet[1][1] - feet[0][1]) * fh, (feet[1][0] - feet[0][0]) * fw))
    print(s, (W, H), [[round(v, 3) for v in q] for q in meta[s]["quad"]])
(out / "clock.json").write_text(json.dumps(meta))
