import assert from "node:assert/strict";
import { test } from "node:test";
import { readConfig } from "../src/config.js";
const valid = {
  NODE_ENV: "production",
  CLIENT_URL: "https://mentorlagbe.example",
  BETTER_AUTH_URL: "https://mentorlagbe.example",
  MONGODB_URI: "mongodb://127.0.0.1:27017",
  BETTER_AUTH_SECRET: "a".repeat(40),
  JWT_SECRET: "b".repeat(40),
};
test("production configuration rejects localhost defaults and malformed origins", () => {
  assert.equal(readConfig(valid).CLIENT_URL, valid.CLIENT_URL);
  for (const key of ["CLIENT_URL", "BETTER_AUTH_URL"]) {
    for (const value of [undefined, "http://localhost:3000", "https://example.com/", "https://example.com/path"]) {
      assert.throws(() => readConfig({ ...valid, [key]: value }), new RegExp(key));
    }
  }
});
test("production configuration rejects shared or placeholder secrets", () => {
  assert.throws(() => readConfig({ ...valid, JWT_SECRET: valid.BETTER_AUTH_SECRET }), /distinct generated/);
  assert.throws(() => readConfig({ ...valid, JWT_SECRET: "replace-with-a-different-32-character-secret" }), /distinct generated/);
});
