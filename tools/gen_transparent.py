# usage: gen.py <out.png> <ref.png> <prompt>  -- stateless image edit through the local opencode service
import base64, json, pathlib, sys, urllib.error, urllib.request

out, ref, prompt = sys.argv[1:4]
cfg = json.load(open(pathlib.Path.home() / ".config/opencode/service.json"))
auth = "Basic " + base64.b64encode(f"opencode:{cfg['password']}".encode()).decode()
body = {
    "model": {"id": "gpt-image-2", "providerID": "openai"},
    "background": "transparent", "prompt": prompt, "aspect": "16:9", "resolution": "2K",
}
if ref != "-":
    body["images"] = [{"data": base64.b64encode(open(ref, "rb").read()).decode(), "mime": "image/png", "name": pathlib.Path(ref).name}]
if len(sys.argv) > 4:
    body["aspect"] = sys.argv[4]
req = urllib.request.Request("http://127.0.0.1:49374/api/experimental/generate/image", json.dumps(body).encode(),
                             {"content-type": "application/json", "authorization": auth})
try:
    r = json.load(urllib.request.urlopen(req, timeout=280))
except urllib.error.HTTPError as e:
    sys.exit(f"HTTP {e.code}: {e.read()[:300]!r}")
img = r["data"]["images"][0]
open(out, "wb").write(base64.b64decode(img["data"]))
print("saved", out, img["mime"])
