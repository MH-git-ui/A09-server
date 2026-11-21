import { MongoClient } from "mongodb";
import assert from "node:assert/strict";

// Copy-only migration: the old database remains an offline rollback source.
// The running app uses only users, tuitions, applications and payments afterward.
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const db = client.db(process.env.MONGODB_DB);
  const users = db.collection("users");
  await users.createIndex({ email: 1 }, { name: "users_email_1_unique", unique: true,
    partialFilterExpression: { email: { $type: "string" } } });
  for (const index of await users.listIndexes().toArray()) {
    if (index.name !== "users_email_1_unique" && index.unique &&
      Object.keys(index.key).length === 1 && index.key.email === 1 && !index.partialFilterExpression)
      await users.dropIndex(index.name);
  }
  const source = client.db(`${process.env.MONGODB_DB}_auth`);
  for (const model of ["account", "session", "verification"]) {
    let count = 0;
    for await (const record of source.collection(model).find()) {
      const existing = await users.findOne({ _id: record._id });
      assert.ok(!existing || existing.__authModel === model, "Auth ID collided with a user ID");
      await users.updateOne({ _id: record._id }, { $setOnInsert: { ...record, __authModel: model } }, { upsert: true });
      count++;
    }
    console.log(`${model}: preserved ${count} records`);
  }
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(x => x.name).sort();
  assert.deepEqual(names, ["applications", "payments", "tuitions", "users"]);
  console.log("Four physical application collections verified; source backup retained.");
} finally {
  await client.close();
}
