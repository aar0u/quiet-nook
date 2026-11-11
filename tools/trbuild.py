# Builds public/looks/<look>/ from transparent generations <src>/<face>.png (each is a full re-render of her).
#
# Two renders of her never agree exactly: the head angle, the eye position and the lip shape differ a little, and the
# hair is redrawn a pixel off. Two things follow.
#  - Hair and body must come from one picture (neutral) in every face, or the whole figure twitches when the face
#    changes.
#  - The face must come whole from the new picture. A seam through a brow, lid or lip shows both versions (double
#    brows). So the seam is cut along the outline of the face's skin region (brows, eyes, lips and the bang strands
#    between them are inside it), where it runs through dark hair and along the jaw, never through a feature.
# The face region is computed once per look from the changes of all its expressions together and shared by all of
# them, so an expression whose eyes change only a little (a glance, a sparkle) still gets its eyes inside it.
#
# Output: neutral.webp (the whole picture), for every other face a small patch <face>.webp (colour = her premultiplied
# colour, alpha = the blend weight) and faces.json with the patch rectangles. char.js lays the patch over neutral in
# memory, so every pixel outside the patch is byte-identical in all faces. (Saving each face as its own lossy image
# does not give that: the encoder spreads a local change as small colour errors over the whole picture.)
# usage: tr_build.py <src-dir> <out-dir> [face ...]     (faces default to all; missing ones are skipped)
import json, pathlib, sys
import numpy as np
from PIL import Image
from scipy import ndimage

W, H = 1672, 941
HEAD = (slice(60, 560), slice(250, 900))         # y, x: where expressions may change anything
FACES = ["happy", "shy", "sleepy", "think", "cheer", "blink"]

def load(src, f):
    a = np.asarray(Image.open(src / f"{f}.png").convert("RGBA").resize((W, H), Image.LANCZOS), dtype=np.float32) / 255
    a[..., :3] *= a[..., 3:]                      # premultiplied, so shifting and blending do not bleed colour
    return a

def register(n, e):
    """Sub-pixel shift (dy, dx) of e that best matches n on the body, outside the head box."""
    ys, xs = slice(600, 780), slice(250, 900)
    ref = n[ys, xs, :3].sum(-1) + n[ys, xs, 3]
    best = (1e9, 0, 0)
    for dy in np.arange(-3, 3.01, .25):
        for dx in np.arange(-3, 3.01, .25):
            s = ndimage.shift(e[ys, xs, :3].sum(-1) + e[ys, xs, 3], (dy, dx), order=1, mode="nearest")
            err = np.abs(s[8:-8, 8:-8] - ref[8:-8, 8:-8]).mean()
            if err < best[0]: best = (err, dy, dx)
    return best

def skin_of(p):
    lum = p[..., :3].sum(-1) / 3 / np.maximum(p[..., 3], 1e-3)
    return (lum > 0.58) & (p[..., 3] > 0.9)       # hair highlights are about 0.5, skin is brighter

def face_changes(n, e):
    """Blobs of change that sit on skin: eyes, lids, mouth, blush. A redrawn strand sits on hair, and the fist and
    sleeve are redrawn a little too; both are left out."""
    d = np.abs(e - n).max(-1)
    m = np.zeros((H, W), bool); m[HEAD] = d[HEAD] > 0.06
    m = ndimage.binary_opening(m, iterations=1)
    skin = skin_of(n)
    lab, k = ndimage.label(m)
    keep = []
    for i in range(1, k + 1):
        c = lab == i
        ring = ndimage.binary_dilation(c, iterations=8) & ~c
        # a real feature change is strong (lashes, mouth interior); the soft shading on the neck that the model also
        # redraws is not, and it must stay out of the region or the neck shimmers whenever the face changes
        if c.sum() >= 80 and skin[ring].mean() >= 0.5 and d[c].max() >= 0.2:
            keep.append(i)
    if not keep:
        return np.zeros((H, W), bool)
    cen = {i: np.array(ndimage.center_of_mass(lab == i)) for i in keep}
    got = [min(keep, key=lambda i: cen[i][0])]    # start from the highest change (the eyes), add what is within reach
    grew = True
    while grew:
        grew = False
        for i in keep:
            if i not in got and min(np.hypot(*(cen[i] - cen[g])) for g in got) <= 120:
                got.append(i); grew = True
    return np.isin(lab, got)

def face_region(n, es):
    per = [face_changes(n, e) for e in es]
    per = [b for b in per if b.any()]
    if not per:
        return np.zeros((H, W), np.float32)
    # The jaw line is redrawn a little differently too, which shows up as a change below the mouth. The region ends just
    # under the lips: the median over the expressions of where their changes end, so one odd expression cannot drag
    # the region down over the chin and neck (the neck would then shimmer whenever the face changes).
    bottom = int(np.median([np.nonzero(b)[0].max() for b in per])) + 18
    blobs = np.zeros((H, W), bool)
    for b in per:
        blobs |= b
    blobs[bottom:] = False
    ys, xs = np.nonzero(blobs)
    win = np.zeros((H, W), bool)                  # from above the brows to just under the lips
    win[max(ys.min() - 90, 0):ys.max() + 18, max(xs.min() - 90, 0):xs.max() + 90] = True
    skin = ndimage.binary_closing(skin_of(n) & win, structure=np.ones((3, 3), bool), iterations=14) & win
    skin = ndimage.binary_fill_holes(skin)
    lab, _ = ndimage.label(skin)
    seeds = np.unique(lab[blobs]); seeds = seeds[seeds > 0]
    near = ndimage.distance_transform_edt(~blobs) <= 75   # not out over hair, collar or hand
    m = (np.isin(lab, seeds) & near) | blobs
    m = ndimage.binary_closing(m, iterations=6)
    m = ndimage.binary_fill_holes(m)
    # Pull the edge a little inside the skin. Right at the skin/hair border the two renders disagree about the hair
    # (the hair behind the neck is solid in one and translucent in the other), and a seam there shows as a dark block.
    # Inside the skin both renders have the same colour, so the seam is invisible.
    m = ndimage.binary_erosion(m, iterations=4) | ndimage.binary_dilation(blobs, iterations=3)
    # The brows move with the expression and their outer ends run out under the bangs, where the skin outline does
    # not reach. A seam across a brow leaves one half where the old brow was and the other where the new one is. So the
    # whole band from above the brows to under the eyes is taken, wider than the eyes on both sides: the seam then
    # runs through hair, where it cannot be seen.
    eyes = blobs.copy(); eyes[ys.min() + 110:] = False
    ey, ex = np.nonzero(eyes)
    band = np.zeros((H, W), bool)
    band[max(ys.min() - 70, 0):ey.max() + 8, max(ex.min() - 45, 0):ex.max() + 45] = True
    # only where she is solid in every picture: at the outer edge of the hair the renders disagree about how wide and
    # how opaque it is, and taking that edge from another render shows as a dark block beside her head
    solid = n[..., 3] > 0.97
    for e in es:
        solid &= e[..., 3] > 0.97
    solid = ndimage.binary_erosion(solid, iterations=6)
    m |= band & solid
    return ndimage.gaussian_filter(m.astype(np.float32), 8)

def aligned(n, src, faces):
    out = {}
    for f in faces:
        if not (src / f"{f}.png").exists():
            print(f, "missing, skipped"); continue
        e = load(src, f)
        err, dy, dx = register(n, e)
        out[f] = np.stack([ndimage.shift(e[..., c], (dy, dx), order=1, mode="nearest") for c in range(4)], -1)
    return out

def round_corners(n, box, r):
    """Rounds the sharp convex corners of her silhouette inside box (x0, y0, x1, y1) with a morphological opening.
    Used where the picture is cut off by the frame and leaves a straight edge with a right angle."""
    x0, y0, x1, y1 = box
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    disk = (yy ** 2 + xx ** 2) <= r * r
    b = n[y0:y1, x0:x1, 3] > 0.5
    removed = b & ~ndimage.binary_opening(np.pad(b, r, mode="edge"), structure=disk)[r:-r, r:-r]
    keep = 1 - np.clip(ndimage.gaussian_filter(removed.astype(np.float32), 1.0) * 1.6, 0, 1)
    n = n.copy()
    n[y0:y1, x0:x1] *= keep[..., None]
    return n

def build(src, out, faces):
    n = load(src, "neutral")
    if (src / "round.json").exists():                # {"box": [x0, y0, x1, y1], "r": radius}
        cfg = json.loads((src / "round.json").read_text())
        n = round_corners(n, cfg["box"], cfg["r"])
    es = aligned(n, src, faces)
    w = face_region(n, list(es.values()))
    out.mkdir(parents=True, exist_ok=True)
    a = n[..., 3:]; rgb = np.where(a > 1e-4, n[..., :3] / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.dstack([rgb, a]), 0, 1) * 255 + .5).astype(np.uint8), "RGBA").save(out / "neutral.webp", quality=92, method=6, exact=True)
    ys, xs = np.nonzero(w > 0.004)
    y0, y1, x0, x1 = max(ys.min() - 1, 0), min(ys.max() + 2, H), max(xs.min() - 1, 0), min(xs.max() + 2, W)
    rects = {}
    for f, e in es.items():
        patch = np.dstack([np.clip(e[y0:y1, x0:x1, :3], 0, 1), w[y0:y1, x0:x1, None]])
        Image.fromarray((patch * 255 + .5).astype(np.uint8), "RGBA").save(out / f"{f}.webp", quality=92, method=6, exact=True)
        rects[f] = [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]
    (out / "faces.json").write_text(json.dumps(rects))
    print("face region", [int(x0), int(y0), int(x1 - x0), int(y1 - y0)], "faces", list(es))
    return n, es, w

if __name__ == "__main__":
    build(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3:] or FACES)
