# /// script
# dependencies = ["pillow", "numpy", "scipy"]
# ///
"""Makes one look (outfit, hair, pose and its faces). Run with: uv run tools/makelook.py <command> <look> ...

  status <look>            what exists and what is next
  step <look> [n=3]        generate n candidates for the next neutral step -> art-src/looks/<look>/<step>_<k>.png
  pick <look> <k>          take candidate k as the result of that step (the last step's result is neutral.png)
  faces <look> [face ...]  generate the six faces from neutral.png, retrying a refused request (never rewording it)
  build <look>             write public/looks/<look>/, update looks.json, and check the result

Prompts and the rules the model needs are in tools/looks/common.json and tools/looks/<look>.json. Sources go in
art-src/looks/<look>/ (not in git). Needs the opencode service (OPENCODE_URL, default http://127.0.0.1:49374).
"""
import base64, json, os, pathlib, re, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
CFG = ROOT / "tools" / "looks"
ART = ROOT / "art-src" / "looks"
PUB = ROOT / "public" / "looks"
FACES = ["happy", "shy", "sleepy", "think", "cheer", "blink"]

def load_cfg(look):
    common = json.loads((CFG / "common.json").read_text())
    mine = json.loads((CFG / f"{look}.json").read_text())
    return common, mine

def fill(text, common):
    """Replaces {name} with common[name], repeatedly, so a rule may use another rule."""
    for _ in range(4):
        text = re.sub(r"\{(\w+)\}", lambda m: str(common[m.group(1)]) if m.group(1) in common else m.group(0), text)
    return text

def generate(out, refs, prompt, tries=3):
    """One image edit with a transparent background. A refused request is retried as is, not reworded."""
    service = os.environ.get("OPENCODE_URL", "http://127.0.0.1:49374")
    cfg = json.loads((pathlib.Path.home() / ".config/opencode/service.json").read_text())
    auth = "Basic " + base64.b64encode(f"opencode:{cfg['password']}".encode()).decode()
    body = {"model": {"id": "gpt-image-2", "providerID": "openai"}, "background": "transparent",
            "prompt": prompt, "aspect": "16:9", "resolution": "2K",
            "images": [{"data": base64.b64encode(pathlib.Path(r).read_bytes()).decode(), "mime": "image/png", "name": pathlib.Path(r).name} for r in refs]}
    last = ""
    for i in range(tries):
        req = urllib.request.Request(f"{service}/api/experimental/generate/image", json.dumps(body).encode(),
                                     {"content-type": "application/json", "authorization": auth})
        try:
            r = json.load(urllib.request.urlopen(req, timeout=280))
            pathlib.Path(out).write_bytes(base64.b64decode(r["data"]["images"][0]["data"]))
            return True, ""
        except urllib.error.HTTPError as e:
            last = e.read()[:200].decode("utf8", "replace")
            if "content_filter" not in last:
                break
            time.sleep(1)
    return False, last

def steps_of(common, mine):
    """The look's steps with 'use' expanded from the shared definitions: [(name, refs, prompt)]."""
    out = []
    for s in mine["steps"]:
        spec = common["steps"][s["use"]] if "use" in s else s
        out.append((s["name"], spec.get("refs", ["prev"]), fill(spec["prompt"], common)))
    return out

def state_path(look): return ART / look / "state.json"
def get_state(look):
    p = state_path(look)
    return json.loads(p.read_text()) if p.exists() else {"done": 0}

def resolve_ref(ref, look, common, done_steps):
    if ref == "identity":
        return ART / common["identity"] / "neutral.png"
    if ref == "prev":
        return ART / look / (f"{done_steps[-1]}.png" if done_steps else "neutral.png")
    return pathlib.Path(ref)

def cmd_status(look):
    common, mine = load_cfg(look)
    d = ART / look
    steps = steps_of(common, mine)
    st = get_state(look)
    print(look, "steps:", [f"{n}{'*' if i < st['done'] else ''}" for i, (n, _, _) in enumerate(steps)], "(* = picked)")
    print("neutral:", (d / "neutral.png").exists(), " faces:", {f: (d / f"{f}.png").exists() for f in FACES})
    print("built:", (PUB / look / "faces.json").exists())

def cmd_step(look, n=3):
    common, mine = load_cfg(look)
    steps = steps_of(common, mine)
    st = get_state(look)
    if st["done"] >= len(steps):
        sys.exit("all steps are picked; run faces")
    name, refs, prompt = steps[st["done"]]
    d = ART / look; d.mkdir(parents=True, exist_ok=True)
    done = [s[0] for s in steps[:st["done"]]]
    # the first step starts from the identity picture; later steps from the previous result
    paths = [resolve_ref("identity" if (r == "prev" and not done) else r, look, common, done) for r in refs]
    print("step", name, "from", [str(p.relative_to(ROOT)) for p in paths])
    with ThreadPoolExecutor(n) as ex:
        res = list(ex.map(lambda k: (k, generate(d / f"{name}_{k}.png", paths, prompt)), range(1, n + 1)))
    for k, (ok, err) in res:
        print(f"  {name}_{k}.png", "ok" if ok else "FAILED " + err[:90])
    print("look at them (tools/makelook.py does not choose), then: pick", look, "<k>")

def cmd_pick(look, k):
    common, mine = load_cfg(look)
    steps = steps_of(common, mine)
    st = get_state(look)
    name = steps[st["done"]][0]
    d = ART / look
    src = d / f"{name}_{k}.png"
    if not src.exists():
        sys.exit(f"{src} does not exist")
    (d / f"{name}.png").write_bytes(src.read_bytes())
    st["done"] += 1
    if st["done"] == len(steps):
        (d / "neutral.png").write_bytes(src.read_bytes())
        print("neutral.png set; next: faces")
    state_path(look).write_text(json.dumps(st))

def cmd_faces(look, only):
    common, mine = load_cfg(look)
    d = ART / look
    if not (d / "neutral.png").exists():
        sys.exit("no neutral.png yet")
    base = fill(f"Edit the attached image. {{same}} Keep the fully transparent background (real alpha channel, no matte, no fringe, every hair strand with natural soft alpha). {{only_her}} {{keep_eyes}} Change only the face to show", common)
    todo = [f for f in (only or FACES) if f in FACES]
    def one(f):
        prompt = base + " " + fill(mine.get("faces", {}).get(f, common["faces"][f]), common)
        ok, err = generate(d / f"{f}.png", [d / "neutral.png"], prompt)
        return f, ok, err
    with ThreadPoolExecutor(len(todo)) as ex:
        for f, ok, err in ex.map(one, todo):
            print(" ", f, "ok" if ok else "REFUSED/FAILED after 3 tries: " + err[:100])
    print("faces that failed keep their previous picture if there was one")

def cmd_build(look):
    sys.path.insert(0, str(ROOT / "tools"))
    import trbuild
    common, mine = load_cfg(look)
    src, out = ART / look, PUB / look
    faces = [f for f in FACES if (src / f"{f}.png").exists()]
    n, es, w = trbuild.build(src, out, faces)
    problems = trbuild.check(n, es, w)
    # looks.json: one entry per look, the only place its name, fit and binding are written
    index = PUB / "looks.json"
    entries = json.loads(index.read_text()) if index.exists() else []
    entry = {"id": look, "name": mine["name"], "fit": mine.get("fit", [1, 0, 0, 0])}
    if "when" in mine: entry["when"] = mine["when"]
    entries = [e for e in entries if e["id"] != look] + [entry] if not any(e["id"] == look for e in entries) else [entry if e["id"] == look else e for e in entries]
    index.write_text(json.dumps(entries, ensure_ascii=False, indent=1) + "\n")
    for p in problems:
        print("PROBLEM:", p)
    print("built", look, "-", "no problems" if not problems else f"{len(problems)} problem(s)")
    return not problems

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cmd, look, rest = sys.argv[1], sys.argv[2], sys.argv[3:]
    if cmd == "status": cmd_status(look)
    elif cmd == "step": cmd_step(look, int(rest[0]) if rest else 3)
    elif cmd == "pick": cmd_pick(look, int(rest[0]))
    elif cmd == "faces": cmd_faces(look, rest)
    elif cmd == "build": sys.exit(0 if cmd_build(look) else 1)
    else: sys.exit(__doc__)
