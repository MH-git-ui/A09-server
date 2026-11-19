import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { connectDatabase } from '../src/db.js';
import { createAuth } from '../src/auth.js';
import { seedDatabase } from './seed-data.js';

if (process.env.NODE_ENV === 'production') throw new Error('Local development runner must not run in production.');
await mkdir('.local/mongo', { recursive: true });
let local;
try { local = JSON.parse(await readFile('.local/config.json', 'utf8')); }
catch { local = { authSecret: randomBytes(32).toString('hex'), jwtSecret: randomBytes(32).toString('hex'), password: randomBytes(18).toString('base64url') }; await writeFile('.local/config.json', JSON.stringify(local, null, 2)); }
const mongo = await MongoMemoryServer.create({ instance: { dbPath: new URL('../.local/mongo', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), storageEngine: 'wiredTiger' } });
const config = readConfig({ ...process.env, MONGODB_URI: mongo.getUri(), BETTER_AUTH_SECRET: local.authSecret, JWT_SECRET: local.jwtSecret });
const database = await connectDatabase(config);
const auth = createAuth(config, database);
await seedDatabase({ db: database.db, auth, password: local.password });
const server = createApp({ clientUrl: config.CLIENT_URL, config, db: database.db, auth }).listen(config.PORT, () => console.log(`Local API ready: http://localhost:${config.PORT}. Demo password is in ignored .local/config.json.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(async () => { await database.client.close(); await mongo.stop(); process.exit(0); }));
