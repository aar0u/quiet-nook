# Builds public/scene/<scene>/{frames.webp, mask.png} from the generated PNGs.
# mask.png: R = girl (rembg alpha limited to a hand-drawn polygon so the lamp, laptop and chair stay out), G = hair.
import pathlib, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src = pathlib.Path("/home/node/scratch/tmp/cp-art")
pub = pathlib.Path("/home/node/chillpulse/public/scene")
E = ["happy", "sleepy", "think", "cheer"]
POLY = [(440, 20), (560, 10), (690, 60), (780, 250), (825, 400), (860, 540), (850, 640), (770, 745), (700, 800),
        (480, 800), (300, 800), (235, 760), (240, 640), (285, 520), (310, 420), (340, 260), (400, 90)]

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
    return np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255

poly = Image.new("L", (1672, 941), 0)
ImageDraw.Draw(poly).polygon(POLY, fill=255)
poly = np.asarray(poly.filter(ImageFilter.GaussianBlur(10)), dtype=np.float32) / 255

only = sys.argv[1:] or ["rain", "day", "dusk", "snow"]
for s in only:
    out = pub / s
    out.mkdir(parents=True, exist_ok=True)
    fr = frames(s)
    for name, p in fr.items():
        if p.exists():
            Image.open(p).convert("RGB").save(out / f"{name}.webp", quality=88, method=6)
        else:
            print("missing", p)
    alpha = np.asarray(Image.open(src / f"mask_{s}.png").convert("RGBA").getchannel("A"), dtype=np.float32) / 255
    girl = blur(ss(0.35, 0.65, alpha) * poly, 1.2)
    rgb = np.asarray(Image.open(fr["neutral"]).convert("RGB"), dtype=np.float32) / 255
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    hair = blur(girl * ss(0.40, 0.18, lum), 2)
    m = np.zeros((941, 1672, 3), np.uint8)
    m[..., 0] = (girl * 255).astype(np.uint8)
    m[..., 1] = (hair * 255).astype(np.uint8)
    Image.fromarray(m).save(out / "mask.png", optimize=True)
    print(s, "ok")
