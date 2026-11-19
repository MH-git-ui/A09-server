import { Router } from 'express';
import { objectId } from '../db.js';
import { fail } from '../validation.js';
export function dashboardRoutes({ db, guards }) {
  const router = Router();
  router.use(guards.verifyToken);
  router.get('/overview', async (req, res) => {
    const u = req.user;
    if (u.role === 'student') {
      const match = { studentEmail: u.email };
      const [total, accepted, pending] = await Promise.all([db.collection('applications').countDocuments(match), db.collection('applications').countDocuments({ ...match, status: 'accepted' }), db.collection('applications').countDocuments({ ...match, status: 'pending' })]);
      return res.json({ 'Applied tuitions': total, 'Accepted applications': accepted, 'Pending applications': pending, 'Current plan': u.plan });
    }
    if (u.role === 'tutor') {
      const match = { tutorEmail: u.email };
      const [total, active, applicants] = await Promise.all([db.collection('tuitions').countDocuments(match), db.collection('tuitions').countDocuments({ ...match, approvalStatus: 'approved', isActive: true }), db.collection('applications').countDocuments(match)]);
      return res.json({ 'Tuitions posted': total, 'Active approved tuitions': active, 'Applicants received': applicants, 'Current plan': u.plan });
    }
    const [users, tutors, pending, approved, revenue] = await Promise.all([db.collection('users').countDocuments(), db.collection('users').countDocuments({ role: 'tutor' }), db.collection('tuitions').countDocuments({ approvalStatus: 'pending' }), db.collection('tuitions').countDocuments({ approvalStatus: 'approved' }), db.collection('payments').aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]).toArray()]);
    res.json({ 'Total users': users, 'Total tutors': tutors, 'Pending tuitions': pending, 'Approved tuitions': approved, 'Stripe revenue (USD)': revenue[0]?.total ?? 0 });
  });
  router.get('/applicants', guards.verifyTutor, async (req, res) => res.json(await db.collection('applications').find({ tutorEmail: req.user.email }).sort({ priority: -1, appliedAt: -1 }).toArray()));
  router.patch('/applicants/:id', guards.verifyTutor, async (req, res) => {
    if (!['accepted', 'rejected'].includes(req.body.status)) fail(400, 'Choose accepted or rejected.');
    const item = await db.collection('applications').findOneAndUpdate({ _id: objectId(req.params.id), tutorEmail: req.user.email, status: 'pending' }, { $set: { status: req.body.status } }, { returnDocument: 'after' });
    if (!item) fail(409, 'Application is missing or has already been decided.');
    res.json(item);
  });
  return router;
}
