import jwt from 'jsonwebtoken';
import { fromNodeHeaders } from 'better-auth/node';
import { objectId } from './db.js';
import { fail, publicUser } from './validation.js';

export function security({ config, db, auth }) {
  async function session(req) {
    const current = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!current) fail(401, 'Please sign in to continue.');
    return current;
  }
  async function issueToken(req, res) {
    const current = await session(req);
    const user = await db.collection('users').findOne({ _id: objectId(current.user.id) });
    if (!user) fail(401, 'Account no longer exists.');
    const token = jwt.sign({ sid: current.session.id }, config.JWT_SECRET, { subject: current.user.id, expiresIn: '15m', issuer: 'mentorlagbe', audience: 'mentorlagbe-api', algorithm: 'HS256' });
    res.set('Cache-Control', 'no-store').json({ token, user: publicUser(user) });
  }
  async function verifyToken(req, _res, next) {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) fail(401, 'Authentication required.');
    let payload;
    try { payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'mentorlagbe', audience: 'mentorlagbe-api' }); }
    catch { fail(401, 'Your session expired. Please sign in again.'); }
    // Bind JWT to a live BetterAuth session so logout revokes API access immediately.
    const current = await session(req);
    if (current.user.id !== payload.sub || current.session.id !== payload.sid) fail(401, 'Session does not match this token.');
    req.user = await db.collection('users').findOne({ _id: objectId(payload.sub) });
    if (!req.user) fail(401, 'Account no longer exists.');
    next();
  }
  const role = expected => (req, _res, next) => { if (req.user.role !== expected) fail(403, `This action requires a ${expected} account.`); next(); };
  return { issueToken, verifyToken, verifyStudent: role('student'), verifyTutor: role('tutor'), verifyAdmin: role('admin') };
}
