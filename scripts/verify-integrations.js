import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const origin = process.argv[2];
assert.ok(origin?.startsWith("https://") && new URL(origin).origin === origin);
assert.ok(process.env.SEED_PASSWORD, "SEED_PASSWORD is required");
let cookie;
let token;
async function request(path, { method = "GET", body } = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !multipart ? { "Content-Type": "application/json" } : {}) },
    body: body ? multipart ? body : JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  assert.equal(response.status, 200, `${path}: ${response.status} ${JSON.stringify(data)}`);
  return { response, data };
}
const login = await request("/auth/sign-in/email", { method: "POST", body: {
  email: process.env.INTEGRATION_EMAIL ?? "student@mentorlagbe.demo", password: process.env.SEED_PASSWORD,
} });
cookie = login.response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
const identity = (await request("/token")).data;
token = identity.token;
const expectedAmount = identity.user.role === "tutor" ? 15 : 10;
try {
  if (process.argv[3]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const payment = await request("/payments/verify", { method: "POST", body: { sessionId: process.argv[3] } });
      assert.equal(payment.data.paymentStatus, "paid");
      assert.equal(payment.data.amount, expectedAmount);
    }
    assert.equal((await request("/account/me")).data.plan, "pro");
    console.log("Paid checkout verification, repeated verification and Pro plan: passed");
  } else {
    const form = new FormData();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=", "base64");
    form.set("image", new Blob([png], { type: "image/png" }), "integration-check.png");
    const uploaded = await request("/account/images", { method: "POST", body: form });
    assert.equal(new URL(uploaded.data.url).hostname, "i.ibb.co");
    const image = await fetch(uploaded.data.url);
    assert.ok(image.ok && image.headers.get("content-type")?.startsWith("image/"));
    console.log("Authenticated ImgBB upload and hosted image retrieval: passed");
    const checkout = await request("/payments/checkout", { method: "POST", body: {} });
    assert.equal(new URL(checkout.data.url).hostname, "checkout.stripe.com");
    await writeFile(".local/integration-checkout.json", JSON.stringify({ url: checkout.data.url, image: uploaded.data.url }));
    console.log("Stripe checkout creation: passed; URL saved privately for browser verification");
  }
} finally {
  await request("/auth/sign-out", { method: "POST", body: {} });
}
