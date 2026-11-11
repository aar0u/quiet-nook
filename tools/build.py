# Builds public/scene/<scene>/{<frame>.webp, mask.png} from the generated PNGs.
#  - Stickers are baked onto the laptop lid in every frame: flat sticker texture, perspective-warped onto the
#    lid quad, shaded by the lid's own light, with a small contact shadow.
#  - mask.png: R = girl (rembg alpha limited by a hand-drawn polygon, with the chair and blanket removed on the
#    left), G = hair. char.js displaces only what this mask selects.
import pathlib, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

src = pathlib.Path("/home/node/scratch/tmp/cp-art")
pub = pathlib.Path("/home/node/scratch/quiet-nook/public/scene")
E = ["happy", "sleepy", "think", "cheer"]
POLY = [(440, 20), (560, 10), (690, 60), (780, 250), (825, 400), (860, 540), (850, 640), (770, 745), (700, 800),
        (480, 800), (300, 800), (235, 760), (240, 640), (285, 520), (310, 420), (340, 260), (400, 90)]
LID = [(862, 534), (1205, 521), (1127, 803), (785, 840)]  # TL, TR, BR, BL of the laptop lid
LID_W, LID_H = 900, 600                                    # flat lid texture, aspect 1.5
# sheet order -> (centre x, centre y, size, rotation degrees) on the flat lid
STICKERS = [(450, 300, 300, -5), (170, 150, 170, 12), (715, 130, 185, -8), (745, 455, 165, 7),
            (170, 455, 150, -12), (560, 520, 135, 14), (350, 80, 130, 6), (815, 290, 150, -6)]

def frames(s):
    if s == "rain":
        f = {"neutral": "scene_neutral", **{e: f"scene_{e}" for e in E}, "blink": "scene_rain_blink"}
    else:
        f = {"neutral": f"base_{s}", **{e: f"scene2_{s}_{e}" for e in E}, "blink": f"scene2_{s}_blink"}
    f["shy"] = f"shy_{s}"
    return {k: src / f"{v}.png" for k, v in f.items()}

def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def blur(a, r):
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255

def poly_mask(pts):
    m = Image.new("L", (1672, 941), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.asarray(m, dtype=np.float32) / 255

# ---------------- stickers ----------------
def cut_stickers():
    sheet = np.asarray(Image.open(src / "stickers1.png").convert("RGB"), dtype=np.float32)
    bg = np.median(sheet[:20, :20].reshape(-1, 3), axis=0)
    fg = np.abs(sheet - bg).sum(-1) > 60
    lab, n = ndimage.label(fg)
    # a sticker made of two pieces (the moon and its star) is merged when their bounding boxes overlap
    slices = ndimage.find_objects(lab)
    boxes = {i: slices[i - 1] for i in range(1, n + 1)}
    parent = {i: i for i in boxes}
    def root(i):
        while parent[i] != i:
            i = parent[i]
        return i
    for i in boxes:
        for j in boxes:
            if i < j and all(a.start < b.stop and b.start < a.stop for a, b in zip(boxes[i], boxes[j])):
                parent[root(j)] = root(i)
    lab = np.vectorize(lambda v: root(v) if v else 0)(lab) if n else lab
    objs = [(i, ndimage.center_of_mass(lab == i), (lab == i).sum()) for i in sorted(set(lab.flat) - {0})]
    objs = [o for o in objs if o[2] > 5000]
    h = sheet.shape[0]
    objs.sort(key=lambda o: (o[1][0] > h / 2, o[1][1]))  # row by row, left to right
    assert len(objs) == 8, f"expected 8 stickers, found {len(objs)}"
    out = []
    for i, _, _ in objs:
        m = ndimage.binary_fill_holes(lab == i)
        ys, xs = np.where(m)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        a = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
        rgba = Image.fromarray(sheet.astype(np.uint8)).convert("RGBA")
        rgba.putalpha(a)
        out.append(rgba.crop(box))
    return out

def lid_texture(stickers):
    """Returns (rgb premultiplied, alpha, shadow alpha) as flat 900x600 arrays."""
    canvas = Image.new("RGBA", (LID_W, LID_H), (0, 0, 0, 0))
    shadow = Image.new("L", (LID_W, LID_H), 0)
    for st, (cx, cy, size, rot) in zip(stickers, STICKERS):
        k = size / max(st.size)
        st = st.resize((round(st.width * k), round(st.height * k)), Image.LANCZOS).rotate(rot, expand=True, resample=Image.BICUBIC)
        pos = (cx - st.width // 2, cy - st.height // 2)
        canvas.alpha_composite(st, pos)
        shadow.paste(255, (pos[0] + 5, pos[1] + 8), st.getchannel("A"))
    arr = np.asarray(canvas, dtype=np.float32) / 255
    rgb = Image.fromarray((arr[..., :3] * arr[..., 3:] * 255).astype(np.uint8))  # premultiplied so warping does not bleed
    alpha = Image.fromarray((arr[..., 3] * 255).astype(np.uint8))
    return rgb, alpha, shadow.filter(ImageFilter.GaussianBlur(3))

def coeffs(pa, pb):
    A, B = [], []
    for (x, y), (u, v) in zip(pa, pb):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    return np.linalg.solve(np.array(A, float), np.array(B, float))

def warp(img):
    c = coeffs(LID, [(0, 0), (LID_W, 0), (LID_W, LID_H), (0, LID_H)])
    return np.asarray(img.transform((1672, 941), Image.PERSPECTIVE, c, Image.BICUBIC), dtype=np.float32) / 255

def stickers_layer(neutral, stickers):
    """Sticker colour (already lit), coverage and shadow coverage as full-frame arrays."""
    tex_rgb, tex_a, tex_sh = lid_texture(stickers)
    a = warp(tex_a)
    pm = warp(tex_rgb)
    col = pm / np.maximum(a[..., None], 1e-3)
    sh = warp(tex_sh)
    lid = poly_mask(LID)
    lum = neutral @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    norm = np.maximum(blur(lid, 18), 1e-3)
    lum_b = blur(lum * lid, 18) / norm
    rgb_b = np.stack([blur(neutral[..., c] * lid, 18) / norm for c in range(3)], -1)
    tint = np.clip(rgb_b / np.maximum(lum_b[..., None], 1e-3), 0.6, 1.5) ** 0.7
    shade = np.minimum(0.97, 1.5 * lum_b)[..., None]
    lit = np.clip(col * shade * tint, 0, 1)
    detail = (lum - blur(lum, 6))[..., None] * 0.7              # keep the lid's own glints and grain
    return np.clip(lit + detail, 0, 1), a * lid, sh * lid

def bake(f, sh, lit, cov):
    f = f * (1 - 0.30 * sh[..., None])
    return f * (1 - cov[..., None]) + lit * cov[..., None]

# The plate is a model-generated empty room (lap_<scene>.png), used as one whole image. Nothing is drawn over her:
# the laptop sits far enough from where she rests her arms that she never overlaps it. Her cut-outs (public/char/)
# are keyed from green-screen frames by keygs.py and are shared by every scene.
LIDS = {  # TL, TR, BR, BL of the laptop lid in each plate
    "rain": [(1010, 624), (1274, 599), (1205, 831), (931, 875)],
    "day": [(951, 624), (1228, 590), (1151, 838), (862, 884)],
    "dusk": [(996, 634), (1263, 604), (1187, 842), (905, 885)],
    "snow": [(1019, 621), (1276, 589), (1215, 821), (942, 875)],
}
only = sys.argv[1:] or ["rain", "day", "dusk", "snow"]
stk = cut_stickers()
for s in only:
    out = pub / s
    out.mkdir(parents=True, exist_ok=True)
    cx = sum(p[0] for p in LIDS[s]) / 4
    cy = sum(p[1] for p in LIDS[s]) / 4
    LID[:] = [(cx + (x - cx) * 0.93, cy + (y - cy) * 0.93) for x, y in LIDS[s]]  # inset: the lid corners are rounded
    room = np.asarray(Image.open(src / f"lap2_{s}.png").convert("RGB"), dtype=np.float32) / 255
    lit, cov, sh = stickers_layer(room, stk)
    plate = bake(room, sh, lit, cov)
    Image.fromarray((np.clip(plate, 0, 1) * 255).astype(np.uint8)).save(out / "plate.webp", quality=90, method=6)
    for old in ("front.png", "mask.png", "neutral.webp", "happy.webp", "shy.webp", "sleepy.webp", "think.webp", "cheer.webp", "blink.webp"):
        (out / old).unlink(missing_ok=True)
    print(s, "ok")
