import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";

let server;
let baseUrl;
before(async () => {
  server = await new Promise((resolve) => {
    const instance = createApp({ clientUrl: "https://mentorlagbe.example" }).listen(0, "127.0.0.1", () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test("health exposes liveness without private configuration", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "mentorlagbe-api" });
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("unknown API routes return structured JSON errors", async () => {
  const response = await fetch(`${baseUrl}/api/missing`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "NOT_FOUND");
});

test("malformed JSON returns a client error without leaking a stack", async () => {
  const response = await fetch(`${baseUrl}/api/missing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: { code: "INVALID_JSON", message: "Request body must contain valid JSON." } });
});

test("CORS permits the configured client instead of reflecting arbitrary origins", async () => {
  const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: "https://unrelated.example" } });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://mentorlagbe.example");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
});
