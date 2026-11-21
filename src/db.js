import { MongoClient, ObjectId } from "mongodb";
import { applicationDatabase, authenticationDatabase } from "./auth-storage.js";
export function objectId(value) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value))
    throw Object.assign(new Error("Invalid record ID."), { status: 400 });
  return new ObjectId(value);
}
export async function connectDatabase(config) {
  const client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
    maxIdleTimeMS: 60000,
  });
  await client.connect();
  const rawDb = client.db(config.MONGODB_DB);
  const db = applicationDatabase(rawDb);
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db
      .collection("tuitions")
      .createIndex({ approvalStatus: 1, isActive: 1, createdAt: -1 }),
    db.collection("tuitions").createIndex({ tutorEmail: 1 }),
    db
      .collection("applications")
      .createIndex({ tuitionId: 1, studentEmail: 1 }, { unique: true }),
    db.collection("applications").createIndex({ tutorEmail: 1, status: 1 }),
    db
      .collection("payments")
      .createIndex({ stripeSessionId: 1 }, { unique: true }),
  ]);
  const authDatabase = authenticationDatabase(rawDb);
  return { client, db, authDatabase };
}
