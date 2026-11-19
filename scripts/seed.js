import { readConfig } from '../src/config.js';
import { connectDatabase } from '../src/db.js';
import { createAuth } from '../src/auth.js';
import { seedDatabase } from './seed-data.js';
const config = readConfig();
const database = await connectDatabase(config);
try { await seedDatabase({ db: database.db, auth: createAuth(config, database), password: process.env.SEED_PASSWORD }); console.log('Demo accounts, 12 tuitions and applications seeded. Existing records preserved.'); }
finally { await database.client.close(); }
