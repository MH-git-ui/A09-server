import { Router } from 'express';
import { objectId } from '../db.js';
import { fail, publicUser } from '../validation.js';
export function adminRoutes({ db, guards }) {
  const router = Router();
  router.use(guards.verifyToken, guards.verifyAdmin);
  router.get('/users', async (_req, res) => res.json((await db.collection('users').find().sort({ createdAt: -1 }).toArray()).map(publicUser)));
  router.patch('/users/:id', async (req, res) => {
    if (!['student', 'tutor', 'admin'].includes(req.body.role)) fail(400, 'Invalid role.');
    if (req.params.id === String(req.user._id)) fail(409, 'You cannot change your own administrator role.');
    const id = objectId(req.params.id);
    const target = await db.collection('users').findOne({ _id: id });
    if (!target) fail(404, 'User not found.');
    await db.collection('users').updateOne({ _id: id }, { $set: { role: req.body.role } });
    if (target.role === 'tutor' && req.body.role !== 'tutor') await db.collection('tuitions').updateMany({ tutorEmail: target.email }, { $set: { isActive: false } });
    res.json({ success: true });
  });
  router.get('/tuitions', async (_req, res) => res.json(await db.collection('tuitions').find().sort({ createdAt: -1 }).toArray()));
  router.patch('/tuitions/:id', async (req, res) => {
    if (!['approved', 'rejected'].includes(req.body.approvalStatus)) fail(400, 'Choose approved or rejected.');
    const item = await db.collection('tuitions').findOneAndUpdate({ _id: objectId(req.params.id) }, { $set: { approvalStatus: req.body.approvalStatus, moderatedAt: new Date() } }, { returnDocument: 'after' });
    if (!item) fail(404, 'Tuition not found.');
    res.json(item);
  });
  router.get('/transactions', async (_req, res) => res.json(await db.collection('payments').find().sort({ paidAt: -1 }).toArray()));
  return router;
}
