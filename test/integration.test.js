import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDatabase } from '../src/db.js';
import { createAuth } from '../src/auth.js';
import { createApp } from '../src/app.js';
import { paymentService } from '../src/payments.js';
let mongo, database, server, base, auth, config;
const accounts = {};
const password = 'Integration-Password-123!';
async function call(path, { actor, method = 'GET', body, token, cookie } = {}) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { Origin: config.CLIENT_URL, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(actor || cookie ? { Cookie: cookie ?? accounts[actor].cookie } : {}), ...(actor || token ? { Authorization: `Bearer ${token ?? accounts[actor].token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); return { status: response.status, data, headers: response.headers };
}
before(async () => {
  mongo = await MongoMemoryServer.create();
  config = { NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), MONGODB_DB: `test_${randomBytes(5).toString('hex')}`, CLIENT_URL: 'http://localhost:3000', BETTER_AUTH_URL: 'http://localhost:3000', BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), JWT_SECRET: randomBytes(32).toString('hex') };
  database = await connectDatabase(config); auth = createAuth(config, database);
  server = await new Promise(resolve => { const s = createApp({ clientUrl: config.CLIENT_URL, config, db: database.db, auth }).listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [name, role] of [['student', 'student'], ['tutor', 'tutor'], ['other', 'tutor'], ['admin', 'student']]) {
    const signup = await call('/auth/sign-up/email', { method: 'POST', body: { name: `Test ${name}`, email: `${name}@integration.test`, password, role } });
    assert.equal(signup.status, 200, JSON.stringify(signup.data));
    const cookie = signup.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
    if (name === 'admin') await database.db.collection('users').updateOne({ email: 'admin@integration.test' }, { $set: { role: 'admin' } });
    const session = await call('/token', { cookie }); assert.equal(session.status, 200, JSON.stringify(session.data));
    accounts[name] = { cookie, token: session.data.token, user: session.data.user };
  }
}, { timeout: 120000 });
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await database?.client.close(); await mongo?.stop(); });

test('public signup rejects admin privilege escalation', async () => { const r = await call('/auth/sign-up/email', { method: 'POST', body: { name: 'Bad Role', email: 'bad@integration.test', password, role: 'admin' } }); assert.equal(r.status, 400); });
test('unauthenticated and wrong-role requests are rejected', async () => { assert.equal((await call('/admin/users')).status, 401); assert.equal((await call('/admin/users', { actor: 'student' })).status, 403); assert.equal((await call('/tutor/tuitions', { actor: 'student' })).status, 403); });
test('public update-user cannot modify the account role', async () => { await call('/auth/update-user', { actor: 'student', method: 'POST', body: { role: 'tutor', name: 'Test Student' } }); const r = await call('/account/me', { actor: 'student' }); assert.equal(r.data.role, 'student'); });
test('business database contains exactly the four specified collections', async () => { const names = (await database.db.listCollections().toArray()).map(c => c.name).sort(); assert.deepEqual(names, ['applications', 'payments', 'tuitions', 'users']); });

let tuition;
const listing = { title: 'A thoughtful mathematics class', subject: 'Mathematics', classLevel: 'HSC', mode: 'Online', location: 'Google Meet', monthlyFee: 2000, daysPerWeek: 3, schedule: 'Sunday and Tuesday evenings', description: 'Practical explanations, regular exercises and individual support for mathematics students.', bannerImage: 'https://example.com/banner.jpg' };
test('free tutor limit remains correct during concurrent creation', async () => { const results = await Promise.all(Array.from({ length: 3 }, () => call('/tutor/tuitions', { actor: 'tutor', method: 'POST', body: listing }))); assert.equal(results.filter(r => r.status === 201).length, 2); assert.equal(results.filter(r => r.status === 403).length, 1); tuition = results.find(r => r.status === 201).data; });
test('pending listings stay private and ownership is enforced', async () => { const browse = await call('/tuitions'); assert.equal(browse.data.total, 0); assert.equal((await call(`/tuitions/${tuition._id}`)).status, 404); assert.equal((await call(`/tutor/tuitions/${tuition._id}`, { actor: 'other', method: 'PATCH', body: listing })).status, 404); });
test('admin approval enables searchable paginated public listings', async () => { assert.equal((await call(`/admin/tuitions/${tuition._id}`, { actor: 'admin', method: 'PATCH', body: { approvalStatus: 'approved' } })).status, 200); const r = await call('/tuitions?search=mathematics&mode=Online&classLevel=HSC&limit=1'); assert.equal(r.data.total, 1); assert.equal(r.data.items[0]._id, tuition._id); assert.equal((await call('/tuitions?search=%5B')).data.total, 0); });
let application;
test('students can apply once and tutors cannot apply', async () => { const body = { studentPhone: '+8801700000000', preferredSchedule: 'Evenings', studentNote: 'I need some extra practice.' }; assert.equal((await call(`/applications/${tuition._id}`, { actor: 'tutor', method: 'POST', body })).status, 403); const r = await call(`/applications/${tuition._id}`, { actor: 'student', method: 'POST', body }); assert.equal(r.status, 201); application = r.data; assert.equal((await call(`/applications/${tuition._id}`, { actor: 'student', method: 'POST', body })).status, 409); });
test('only the owning tutor can decide an application and accepted applications cannot be cancelled', async () => { assert.equal((await call(`/dashboard/applicants/${application._id}`, { actor: 'other', method: 'PATCH', body: { status: 'accepted' } })).status, 409); assert.equal((await call(`/dashboard/applicants/${application._id}`, { actor: 'tutor', method: 'PATCH', body: { status: 'accepted' } })).status, 200); assert.equal((await call(`/applications/${application._id}`, { actor: 'student', method: 'DELETE' })).status, 409); });
test('editing approved content sends it back for review', async () => { const r = await call(`/tutor/tuitions/${tuition._id}`, { actor: 'tutor', method: 'PATCH', body: { ...listing, title: 'Updated mathematics class' } }); assert.equal(r.status, 200); assert.equal(r.data.approvalStatus, 'pending'); assert.equal((await call('/tuitions')).data.total, 0); });
test('profile payload cannot escalate role or plan', async () => { const r = await call('/account/profile', { actor: 'student', method: 'PATCH', body: { name: 'Updated Student', phone: '', bio: 'A curious learner', image: '', role: 'admin', plan: 'pro' } }); assert.equal(r.status, 200); assert.equal(r.data.role, 'student'); assert.equal(r.data.plan, 'free'); });
test('unconfigured Stripe cannot claim a payment succeeded', async () => { assert.equal((await call('/payments/checkout', { actor: 'student', method: 'POST', body: {} })).status, 503); });
test('paid session fulfillment is idempotent and rejects price tampering', async () => {
  const service = paymentService({ config, db: database.db, guards: { verifyToken: (_req, _res, next) => next() } });
  const s = { id: 'cs_test_fixture', payment_status: 'paid', mode: 'payment', amount_total: 1000, currency: 'usd', client_reference_id: accounts.student.user.id, metadata: { userId: accounts.student.user.id, role: 'student' }, payment_intent: 'pi_test_fixture', created: Math.floor(Date.now() / 1000) };
  await Promise.all([service.fulfill(s), service.fulfill(s)]);
  assert.equal(await database.db.collection('payments').countDocuments(), 1);
  assert.equal((await call('/account/me', { actor: 'student' })).data.plan, 'pro');
  await assert.rejects(() => service.fulfill({ ...s, amount_total: 1 }), /do not match/);
  await assert.rejects(() => service.fulfill({ ...s, payment_status: 'unpaid' }), /not completed/);
});
test('logout invalidates the previously issued JWT', async () => { assert.equal((await call('/auth/sign-out', { actor: 'student', method: 'POST', body: {} })).status, 200); assert.equal((await call('/account/me', { actor: 'student' })).status, 401); });
