import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDatabase } from "../src/db.js";
import { createAuth } from "../src/auth.js";
import { createApp } from "../src/app.js";
import { paymentService } from "../src/payments.js";
let mongo, database, server, base, auth, config;
const accounts = {};
const password = "Integration-Password-123!";
async function call(path, { actor, method = "GET", body, token, cookie } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: config.CLIENT_URL,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(actor || cookie ? { Cookie: cookie ?? accounts[actor].cookie } : {}),
      ...(actor || token
        ? { Authorization: `Bearer ${token ?? accounts[actor].token}` }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return { status: response.status, data, headers: response.headers };
}
before(
  async () => {
    mongo = await MongoMemoryServer.create();
    config = {
      NODE_ENV: "test",
      MONGODB_URI: mongo.getUri(),
      MONGODB_DB: `test_${randomBytes(5).toString("hex")}`,
      CLIENT_URL: "http://localhost:3000",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      JWT_SECRET: randomBytes(32).toString("hex"),
    };
    database = await connectDatabase(config);
    auth = createAuth(config, database);
    server = await new Promise((resolve) => {
      const s = createApp({
        clientUrl: config.CLIENT_URL,
        config,
        db: database.db,
        auth,
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
    for (const [name, role] of [
      ["student", "student"],
      ["tutor", "tutor"],
      ["other", "tutor"],
      ["admin", "student"],
    ]) {
      const signup = await call("/auth/sign-up/email", {
        method: "POST",
        body: {
          name: `Test ${name}`,
          email: `${name}@integration.test`,
          password,
          role,
        },
      });
      assert.equal(signup.status, 200, JSON.stringify(signup.data));
      const cookie = signup.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join("; ");
      if (name === "admin")
        await database.db
          .collection("users")
          .updateOne(
            { email: "admin@integration.test" },
            { $set: { role: "admin" } },
          );
      const session = await call("/token", { cookie });
      assert.equal(session.status, 200, JSON.stringify(session.data));
      accounts[name] = {
        cookie,
        token: session.data.token,
        user: session.data.user,
      };
    }
  },
  { timeout: 120000 },
);
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await database?.client.close();
  await mongo?.stop();
});

test("public signup rejects admin privilege escalation", async () => {
  const r = await call("/auth/sign-up/email", {
    method: "POST",
    body: {
      name: "Bad Role",
      email: "bad@integration.test",
      password,
      role: "admin",
    },
  });
  assert.equal(r.status, 400);
});
test("unauthenticated and wrong-role requests are rejected", async () => {
  assert.equal((await call("/admin/users")).status, 401);
  assert.equal((await call("/admin/users", { actor: "student" })).status, 403);
  assert.equal(
    (await call("/tutor/tuitions", { actor: "student" })).status,
    403,
  );
});
test("public update-user cannot modify the account role", async () => {
  await call("/auth/update-user", {
    actor: "student",
    method: "POST",
    body: { role: "tutor", name: "Test Student" },
  });
  const r = await call("/account/me", { actor: "student" });
  assert.equal(r.data.role, "student");
});
test("business database contains exactly the four specified collections", async () => {
  const names = (await database.db.listCollections().toArray())
    .map((c) => c.name)
    .sort();
  assert.deepEqual(names, ["applications", "payments", "tuitions", "users"]);
});

let tuition;
test("authentication records stay in four physical collections and never leak into user lists", async () => {
  const raw = database.client.db(config.MONGODB_DB);
  assert.ok(await raw.collection("users").countDocuments({ __authModel: "account" }) >= 4);
  assert.ok(await raw.collection("users").countDocuments({ __authModel: "session" }) >= 4);
  assert.equal(await database.db.collection("users").countDocuments(), 4);
  const list = await call("/admin/users", { actor: "admin" });
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 4);
  assert.ok(list.data.every(user => user.email && !user.password && !user.token && !user.__authModel));
  const authId = (await raw.collection("users").findOne({ __authModel: "account" }))._id;
  assert.equal(await database.db.collection("users").findOne({ _id: authId }), null);
  assert.equal((await raw.listCollections().toArray()).length, 4);
  assert.equal((await database.client.db(`${config.MONGODB_DB}_auth`).listCollections().toArray()).length, 0);
});
const listing = {
  title: "A thoughtful mathematics class",
  subject: "Mathematics",
  classLevel: "HSC",
  mode: "Online",
  location: "Google Meet",
  monthlyFee: 2000,
  daysPerWeek: 3,
  schedule: "Sunday and Tuesday evenings",
  description:
    "Practical explanations, regular exercises and individual support for mathematics students.",
  bannerImage: "https://example.com/banner.jpg",
};
test("free tutor limit remains correct during concurrent creation", async () => {
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      call("/tutor/tuitions", {
        actor: "tutor",
        method: "POST",
        body: listing,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 2);
  assert.equal(results.filter((r) => r.status === 403).length, 1);
  tuition = results.find((r) => r.status === 201).data;
});
test("pending listings stay private and ownership is enforced", async () => {
  const browse = await call("/tuitions");
  assert.equal(browse.data.total, 0);
  assert.equal((await call(`/tuitions/${tuition._id}`)).status, 404);
  assert.equal(
    (
      await call(`/tutor/tuitions/${tuition._id}`, {
        actor: "other",
        method: "PATCH",
        body: listing,
      })
    ).status,
    404,
  );
});
test("admin approval enables searchable paginated public listings", async () => {
  assert.equal(
    (
      await call(`/admin/tuitions/${tuition._id}`, {
        actor: "admin",
        method: "PATCH",
        body: { approvalStatus: "approved" },
      })
    ).status,
    200,
  );
  const r = await call(
    "/tuitions?search=mathematics&mode=Online&classLevel=HSC&limit=1",
  );
  assert.equal(r.data.total, 1);
  assert.equal(r.data.items[0]._id, tuition._id);
  assert.equal((await call("/tuitions?search=%5B")).data.total, 0);
});
let application;
test("students can apply once and tutors cannot apply", async () => {
  const body = {
    studentPhone: "+8801700000000",
    preferredSchedule: "Evenings",
    studentNote: "I need some extra practice.",
  };
  assert.equal(
    (
      await call(`/applications/${tuition._id}`, {
        actor: "tutor",
        method: "POST",
        body,
      })
    ).status,
    403,
  );
  const r = await call(`/applications/${tuition._id}`, {
    actor: "student",
    method: "POST",
    body,
  });
  assert.equal(r.status, 201);
  application = r.data;
  assert.equal(
    (
      await call(`/applications/${tuition._id}`, {
        actor: "student",
        method: "POST",
        body,
      })
    ).status,
    409,
  );
});
test("only the owning tutor can decide an application and accepted applications cannot be cancelled", async () => {
  assert.equal(
    (
      await call(`/dashboard/applicants/${application._id}`, {
        actor: "other",
        method: "PATCH",
        body: { status: "accepted" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(`/dashboard/applicants/${application._id}`, {
        actor: "tutor",
        method: "PATCH",
        body: { status: "accepted" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/applications/${application._id}`, {
        actor: "student",
        method: "DELETE",
      })
    ).status,
    409,
  );
});
test("editing approved content sends it back for review", async () => {
  const r = await call(`/tutor/tuitions/${tuition._id}`, {
    actor: "tutor",
    method: "PATCH",
    body: { ...listing, title: "Updated mathematics class" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.approvalStatus, "pending");
  assert.equal((await call("/tuitions")).data.total, 0);
});
test("profile payload cannot escalate role or plan", async () => {
  const r = await call("/account/profile", {
    actor: "student",
    method: "PATCH",
    body: {
      name: "Updated Student",
      phone: "",
      bio: "A curious learner",
      image: "",
      role: "admin",
      plan: "pro",
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.role, "student");
  assert.equal(r.data.plan, "free");
});
test("unconfigured Stripe cannot claim a payment succeeded", async () => {
  assert.equal(
    (
      await call("/payments/checkout", {
        actor: "student",
        method: "POST",
        body: {},
      })
    ).status,
    503,
  );
});
test("paid session fulfillment is idempotent and rejects price tampering", async () => {
  const service = paymentService({
    config,
    db: database.db,
    guards: { verifyToken: (_req, _res, next) => next() },
  });
  const s = {
    id: "cs_test_fixture",
    payment_status: "paid",
    mode: "payment",
    amount_total: 1000,
    currency: "usd",
    client_reference_id: accounts.student.user.id,
    metadata: { userId: accounts.student.user.id, role: "student" },
    payment_intent: "pi_test_fixture",
    created: Math.floor(Date.now() / 1000),
  };
  await Promise.all([service.fulfill(s), service.fulfill(s)]);
  assert.equal(await database.db.collection("payments").countDocuments(), 1);
  assert.equal(
    (await call("/account/me", { actor: "student" })).data.plan,
    "pro",
  );
  await assert.rejects(
    () => service.fulfill({ ...s, amount_total: 1 }),
    /do not match/,
  );
  await assert.rejects(
    () => service.fulfill({ ...s, payment_status: "unpaid" }),
    /not completed/,
  );
});
test("approved listings respect mode, class and subject filters and pagination", async () => {
  const rows = await database.db.collection("tuitions").find().toArray();
  for (const item of rows) await call(`/admin/tuitions/${item._id}`, {
    actor: "admin", method: "PATCH", body: { approvalStatus: "approved" },
  });
  const first = await call("/tuitions?subject=Mathematics&classLevel=HSC&mode=Online&limit=1&page=1");
  const second = await call("/tuitions?subject=Mathematics&classLevel=HSC&mode=Online&limit=1&page=2");
  assert.equal(first.data.total, 2);
  assert.equal(first.data.pages, 2);
  assert.notEqual(first.data.items[0]._id, second.data.items[0]._id);
  assert.equal((await call("/tuitions?mode=Offline")).data.total, 0);
  assert.equal((await call("/tuitions?classLevel=University")).data.total, 0);
  assert.equal((await call("/tuitions?subject=English")).data.total, 0);
});

test("Pro students receive priority and can cancel only their pending application", async () => {
  const other = (await database.db.collection("tuitions").find().toArray()).find(x => String(x._id) !== tuition._id);
  const result = await call(`/applications/${other._id}`, { actor: "student", method: "POST", body: {
    studentPhone: "+8801000000000", preferredSchedule: "Weekday evenings", studentNote: "Practice algebra",
  } });
  assert.equal(result.status, 201);
  assert.equal(result.data.priority, true);
  assert.equal(result.data.status, "pending");
  assert.equal((await call(`/applications/${result.data._id}`, { actor: "tutor", method: "DELETE" })).status, 403);
  assert.equal((await call(`/applications/${result.data._id}`, { actor: "student", method: "DELETE" })).status, 200);
  assert.equal((await call(`/applications/${result.data._id}`, { actor: "student", method: "DELETE" })).status, 409);
});

test("closing and deleting owned tuition removes it from public browse", async () => {
  assert.equal((await call(`/tutor/tuitions/${tuition._id}/active`, { actor: "tutor", method: "PATCH", body: { isActive: false } })).status, 200);
  assert.equal((await call(`/tuitions/${tuition._id}`)).status, 404);
  assert.equal((await call(`/tutor/tuitions/${tuition._id}/active`, { actor: "tutor", method: "PATCH", body: { isActive: true } })).status, 200);
  assert.equal((await call(`/tuitions/${tuition._id}`)).status, 200);
  assert.equal((await call(`/tutor/tuitions/${tuition._id}`, { actor: "other", method: "DELETE" })).status, 404);
  assert.equal((await call(`/tutor/tuitions/${tuition._id}`, { actor: "tutor", method: "DELETE" })).status, 200);
  assert.equal((await call(`/tuitions/${tuition._id}`)).status, 404);
});

test("Pro tutor can exceed two posts and admin rejection keeps a post private", async () => {
  await database.db.collection("users").updateOne({ email: "tutor@integration.test" }, { $set: { plan: "pro" } });
  for (let i = 0; i < 3; i++) assert.equal((await call("/tutor/tuitions", { actor: "tutor", method: "POST", body: listing })).status, 201);
  const all = await call("/tutor/tuitions", { actor: "tutor" });
  assert.ok(all.data.length > 2);
  const id = all.data[0]._id;
  assert.equal((await call(`/admin/tuitions/${id}`, { actor: "admin", method: "PATCH", body: { approvalStatus: "rejected" } })).status, 200);
  assert.equal((await call(`/tuitions/${id}`)).status, 404);
});

test("admin role updates immediately change permissions and own role stays protected", async () => {
  const id = accounts.other.user.id;
  assert.equal((await call(`/admin/users/${id}`, { actor: "student", method: "PATCH", body: { role: "admin" } })).status, 403);
  assert.equal((await call(`/admin/users/${id}`, { actor: "admin", method: "PATCH", body: { role: "student" } })).status, 200);
  assert.equal((await call("/tutor/tuitions", { actor: "other" })).status, 403);
  assert.equal((await call("/applications", { actor: "other" })).status, 200);
  assert.equal((await call(`/admin/users/${accounts.admin.user.id}`, { actor: "admin", method: "PATCH", body: { role: "student" } })).status, 409);
});

test("logout invalidates the previously issued JWT", async () => {
  assert.equal(
    (
      await call("/auth/sign-out", {
        actor: "student",
        method: "POST",
        body: {},
      })
    ).status,
    200,
  );
  assert.equal((await call("/account/me", { actor: "student" })).status, 401);
});
