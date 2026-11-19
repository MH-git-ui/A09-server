import { Router } from 'express';
import { objectId } from '../db.js';
import { applicationSchema, parse, fail } from '../validation.js';
export function applicationRoutes({ db, guards }) {
  const router = Router();
  router.use(guards.verifyToken, guards.verifyStudent);
  router.get('/', async (req, res) => res.json(await db.collection('applications').find({ studentEmail: req.user.email }).sort({ appliedAt: -1 }).toArray()));
  router.post('/:tuitionId', async (req, res) => {
    const data = parse(applicationSchema, req.body);
    const tuition = await db.collection('tuitions').findOne({ _id: objectId(req.params.tuitionId), approvalStatus: 'approved', isActive: true });
    if (!tuition) fail(404, 'This tuition is no longer accepting applications.');
    const application = { ...data, tuitionId: String(tuition._id), tuitionTitle: tuition.title, subject: tuition.subject, monthlyFee: tuition.monthlyFee, tutorEmail: tuition.tutorEmail, tutorName: tuition.tutorName, studentEmail: req.user.email, studentName: req.user.name, priority: req.user.plan === 'pro', status: 'pending', appliedAt: new Date() };
    try { const result = await db.collection('applications').insertOne(application); res.status(201).json({ ...application, _id: result.insertedId }); }
    catch (error) { if (error.code === 11000) fail(409, 'You have already applied for this tuition.'); throw error; }
  });
  router.delete('/:id', async (req, res) => {
    const result = await db.collection('applications').deleteOne({ _id: objectId(req.params.id), studentEmail: req.user.email, status: 'pending' });
    if (!result.deletedCount) fail(409, 'Only your pending applications can be cancelled.');
    res.json({ success: true });
  });
  return router;
}
