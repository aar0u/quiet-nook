// usage: node cdp.mjs <url> <out-prefix> [width height] [jsToEvalBeforeShot]
// Opens a tab in the host Chrome via CDP, logs console/errors, saves a screenshot, closes the tab.
const HOST = "172.20.0.1:9978";
const [url, prefix, w = "1600", h = "900", js = ""] = process.argv.slice(2);
const fs = await import("node:fs");

const t = { id: process.env.TID };
const ws = new WebSocket(`ws://${HOST}/devtools/page/${t.id}`);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result);
  } else if (d.method === "Runtime.consoleAPICalled") {
    console.log("[console." + d.params.type + "]", d.params.args.map((a) => a.value ?? a.description).join(" "));
  } else if (d.method === "Runtime.exceptionThrown") {
    console.log("[exception]", d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  } else if (d.method === "Network.responseReceived" && d.params.response.status >= 400) {
    console.log("[http " + d.params.response.status + "]", d.params.response.url);
  }
};
await new Promise((r) => (ws.onopen = r));
await send("Runtime.enable");
await send("Network.enable");
await send("Page.enable");
if (+w) await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
if (url !== "-") await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 3000));
if (js) {
  const r = await send("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true });
  console.log("[eval]", JSON.stringify(r.result.value ?? r.exceptionDetails?.text));
  await new Promise((r2) => setTimeout(r2, 800));
}
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(`${prefix}.png`, Buffer.from(shot.data, "base64"));
console.log("saved", `${prefix}.png`);
ws.close();
