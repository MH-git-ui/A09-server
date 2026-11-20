import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDatabase } from "../src/db.js";
import { createAuth } from "../src/auth.js";
import { demoAccounts, seedDatabase } from "../scripts/seed-data.js";

test("demo seed creates connected data, usable accounts, and preserves edits on rerun", { timeout: 120000 }, async () => {
  const mongo = await MongoMemoryServer.create();
  let database;
  try {
    const config = {
      NODE_ENV: "test",
      MONGODB_URI: mongo.getUri(),
      MONGODB_DB: "seed_test",
      CLIENT_URL: "http://localhost:3000",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      JWT_SECRET: randomBytes(32).toString("hex"),
    };
    database = await connectDatabase(config);
    const { db } = database;
    const auth = createAuth(config, database);
    const password = randomBytes(20).toString("base64url");
    await seedDatabase({ db, auth, password });
    assert.equal(await db.collection("users").countDocuments(), 5);
    assert.equal(await db.collection("tuitions").countDocuments({ approvalStatus: "approved", isActive: true }), 12);
    assert.equal(await db.collection("applications").countDocuments(), 3);
    assert.equal(await db.collection("payments").countDocuments(), 0);
    for (const account of demoAccounts) {
      const signedIn = await auth.api.signInEmail({ body: { email: account.email, password } });
      assert.equal(signedIn.user.role, account.role);
      assert.ok(signedIn.token);
    }
    const listings = await db.collection("tuitions").find().toArray();
    for (const listing of listings) {
      const tutor = await db.collection("users").findOne({ email: listing.tutorEmail });
      assert.equal(tutor.role, "tutor");
      assert.equal(tutor.tuitionCount, 4);
    }
    const applications = await db.collection("applications").find().toArray();
    assert.deepEqual(applications.map(a => a.status).sort(), ["accepted", "pending", "rejected"]);
    for (const application of applications) {
      const listing = listings.find(t => String(t._id) === application.tuitionId);
      assert.ok(listing);
      assert.equal(application.tutorEmail, listing.tutorEmail);
      assert.equal(application.monthlyFee, listing.monthlyFee);
      assert.ok(await db.collection("users").findOne({ email: application.studentEmail, role: "student" }));
    }
    await db.collection("users").updateOne({ email: demoAccounts[0].email }, { $set: { name: "Preserved admin" } });
    await db.collection("tuitions").updateOne({ seedKey: "demo-0" }, { $set: { title: "Preserved listing" } });
    await seedDatabase({ db, auth, password: randomBytes(20).toString("base64url") });
    assert.equal(await db.collection("users").countDocuments(), 5);
    assert.equal(await db.collection("tuitions").countDocuments(), 12);
    assert.equal(await db.collection("applications").countDocuments(), 3);
    assert.equal((await db.collection("tuitions").findOne({ seedKey: "demo-0" })).title, "Preserved listing");
    const signedIn = await auth.api.signInEmail({ body: { email: demoAccounts[0].email, password } });
    assert.equal(signedIn.user.name, "Preserved admin");
  } finally {
    await database?.client.close();
    await mongo.stop();
  }
});
