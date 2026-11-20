import assert from "node:assert/strict";
import { test } from "node:test";
import { createRuntimeLoader } from "../src/runtime.js";

test("concurrent cold requests share initialization and warm requests reuse it", async () => {
  let starts = 0;
  const runtime = { app: {} };
  const load = createRuntimeLoader(async () => { starts++; return runtime; });
  const results = await Promise.all(Array.from({ length: 20 }, () => load()));
  assert.equal(starts, 1);
  assert.ok(results.every((value) => value === runtime));
  assert.equal(await load(), runtime);
  assert.equal(starts, 1);
});

test("a failed initialization can retry on the next request", async () => {
  let starts = 0;
  const load = createRuntimeLoader(async () => {
    if (++starts === 1) throw new Error("temporary database outage");
    return { ready: true };
  });
  await assert.rejects(load, /temporary database outage/);
  assert.deepEqual(await load(), { ready: true });
  assert.equal(starts, 2);
});
