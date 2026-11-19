import { MongoClient, ObjectId } from 'mongodb';
export function objectId(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw Object.assign(new Error('Invalid record ID.'), { status: 400 });
  return new ObjectId(value);
}
export async function connectDatabase(config) {
  const client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(config.MONGODB_DB);
  const authDb = client.db(`${config.MONGODB_DB}_auth`);
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('tuitions').createIndex({ approvalStatus: 1, isActive: 1, createdAt: -1 }),
    db.collection('tuitions').createIndex({ tutorEmail: 1 }),
    db.collection('applications').createIndex({ tuitionId: 1, studentEmail: 1 }, { unique: true }),
    db.collection('applications').createIndex({ tutorEmail: 1, status: 1 }),
    db.collection('payments').createIndex({ stripeSessionId: 1 }, { unique: true }),
  ]);
  // Four BUSINESS collections. BetterAuth account/session/verification records are
  // isolated in a companion auth database; users remain the single source of truth.
  const authDatabase = new Proxy(authDb, { get(target, prop) {
    if (prop === 'collection') return (name, ...args) => (name === 'users' ? db : target).collection(name, ...args);
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return { client, db, authDatabase };
}
