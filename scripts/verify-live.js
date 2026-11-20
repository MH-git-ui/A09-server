import assert from "node:assert/strict";

const origin = process.argv[2];
if (!origin || new URL(origin).origin !== origin || !origin.startsWith("https://"))
  throw new Error("Supply the deployed frontend HTTPS origin without a trailing slash.");
if (!process.env.SEED_PASSWORD) throw new Error("SEED_PASSWORD is required.");

async function request(path, { cookie, token, body, method = "GET" } = {}) {
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  assert.ok(response.headers.get("content-type")?.includes("application/json"), `${path}: expected JSON, received ${response.status}`);
  return { status: response.status, data: await response.json(), headers: response.headers };
}

assert.equal((await request("/health")).status, 200);
const browse = await request("/tuitions?limit=6");
assert.equal(browse.status, 200);
assert.ok(browse.data.total >= 12);
assert.equal(browse.data.items.length, 6);
console.log("Public API proxy and seeded listings: passed");
for (const role of ["admin", "tutor", "student"]) {
  const login = await request("/auth/sign-in/email", {
    method: "POST",
    body: { email: `${role}@mentorlagbe.demo`, password: process.env.SEED_PASSWORD },
  });
  assert.equal(login.status, 200, `${role} signin failed`);
  const cookies = login.headers.getSetCookie();
  assert.ok(cookies.some(value => /;\s*Secure/i.test(value)), "Production auth cookie must be secure");
  const cookie = cookies.map(value => value.split(";")[0]).join("; ");
  const issued = await request("/token", { cookie });
  assert.equal(issued.status, 200);
  assert.equal(issued.data.user.role, role);
  const token = issued.data.token;
  assert.equal((await request("/dashboard/overview", { cookie, token })).status, 200);
  assert.equal((await request("/admin/users", { cookie, token })).status, role === "admin" ? 200 : 403);
  assert.equal((await request("/auth/sign-out", { cookie, method: "POST", body: {} })).status, 200);
  assert.equal((await request("/account/me", { cookie, token })).status, 401);
  console.log(`${role}: signin, session, dashboard, access restrictions and logout passed`);
}
