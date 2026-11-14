import assert from "node:assert/strict";
import test from "node:test";
import { createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { anthropic, openai, vertex, serviceAccountAssertion, normalize, opencodePrompt } from "./backends.js";

const msgs = [
  { role: "assistant", content: "stale" },
  { role: "user", content: "a" },
  { role: "user", content: "b" },
  { role: "assistant", content: "c" },
];

test("normalize retains a leading assistant turn and merges same-role neighbours", () => {
  assert.deepEqual(normalize(msgs), [{ role: "user", content: "[Earlier user message is no longer available.]" }, { role: "assistant", content: "stale" }, { role: "user", content: "a\nb" }, { role: "assistant", content: "c" }]);
});

test("request bodies and reply extraction", () => {
  assert.equal(anthropic.body("m", "sys", msgs).system, "sys");
  assert.equal(openai.body("m", "sys", msgs).messages[0].role, "system");
  assert.equal(anthropic.text({ content: [{ text: "hi" }, { text: "!" }] }), "hi!");
  assert.equal(openai.text({ choices: [{ message: { content: "hi" } }] }), "hi");
  assert.match(opencodePrompt("sys", msgs), /用户：a\nb\n你：c\n你：$/);
});

test("vertex url and body", () => {
  assert.equal(vertex.url("p1"), "https://aiplatform.googleapis.com/v1/projects/p1/locations/global/endpoints/openapi/chat/completions");
  assert.equal(vertex.url("p1", "us-central1"), "https://us-central1-aiplatform.googleapis.com/v1/projects/p1/locations/us-central1/endpoints/openapi/chat/completions");
  const body = vertex.body("google/gemini-3.8-flash", "sys", msgs);
  assert.equal(body.messages[0].role, "system");
  assert.ok(body.max_tokens >= 8192);
  assert.ok(anthropic.body("m", "sys", msgs).max_tokens >= 4096 && openai.body("m", "sys", msgs).max_tokens >= 4096);
});

test("service account assertion is a valid RS256 JWT with the expected claims", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const creds = { client_email: "a@p.iam.gserviceaccount.com", token_uri: "https://oauth2.googleapis.com/token", private_key: privateKey };
  const jwt = serviceAccountAssertion(creds, 1_700_000_000_000, (data, key) => sign("RSA-SHA256", Buffer.from(data), key));
  const [head, claims, sig] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(head, "base64url")), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url")), { iss: creds.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: creds.token_uri, iat: 1_700_000_000, exp: 1_700_003_600 });
  assert.ok(verify("RSA-SHA256", Buffer.from(`${head}.${claims}`), createPublicKey(publicKey), Buffer.from(sig, "base64url")));
});
