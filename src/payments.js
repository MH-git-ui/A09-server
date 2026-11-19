import Stripe from 'stripe';
import { Router } from 'express';
import { objectId } from './db.js';
import { fail } from './validation.js';

export function paymentService({ config, db, guards, stripe: injectedStripe }) {
  const stripe = injectedStripe ?? (config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null);
  function requireStripe() { if (!stripe) fail(503, 'Payments are not configured yet. Please try again later.'); return stripe; }
  async function fulfill(session) {
    if (session.payment_status !== 'paid') fail(409, 'Payment has not completed.');
    const { userId, role } = session.metadata ?? {};
    const expected = role === 'tutor' ? 1500 : role === 'student' ? 1000 : 0;
    if (!expected || session.mode !== 'payment' || session.amount_total !== expected || session.currency !== 'usd' || session.client_reference_id !== userId) fail(400, 'Payment details do not match the selected plan.');
    const user = await db.collection('users').findOne({ _id: objectId(userId) });
    if (!user) fail(404, 'Payment account not found.');
    const payment = { userEmail: user.email, userName: user.name, userRole: role, planName: `Pro ${role}`, amount: expected / 100, currency: 'usd', transactionId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id, stripeSessionId: session.id, paymentStatus: 'paid', paidAt: new Date(session.created * 1000) };
    // Unique session index makes repeated webhook/return-page verification safe.
    try { await db.collection('payments').updateOne({ stripeSessionId: session.id }, { $setOnInsert: payment }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
    // Always retry this update, even if the transaction already exists.
    await db.collection('users').updateOne({ _id: user._id }, { $set: { plan: 'pro' } });
    return payment;
  }
  async function webhook(req, res) {
    if (!config.STRIPE_WEBHOOK_SECRET) fail(503, 'Webhook is not configured.');
    let event;
    try { event = requireStripe().webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.STRIPE_WEBHOOK_SECRET); }
    catch { fail(400, 'Invalid webhook signature.'); }
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && event.data.object.payment_status === 'paid') await fulfill(event.data.object);
    res.json({ received: true });
  }
  const router = Router();
  router.use(guards.verifyToken);
  router.post('/checkout', async (req, res) => {
    if (!['student', 'tutor'].includes(req.user.role)) fail(403, 'Pro plans are for students and tutors.');
    if (req.user.plan === 'pro') fail(409, 'You already have a Pro plan.');
    const role = req.user.role;
    const session = await requireStripe().checkout.sessions.create({ mode: 'payment', client_reference_id: String(req.user._id), customer_email: req.user.email, metadata: { userId: String(req.user._id), role }, line_items: [{ price_data: { currency: 'usd', unit_amount: role === 'tutor' ? 1500 : 1000, product_data: { name: `MentorLagbe Pro ${role}` } }, quantity: 1 }], success_url: `${config.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${config.CLIENT_URL}/payment/cancel` });
    res.json({ url: session.url });
  });
  router.post('/verify', async (req, res) => {
    if (typeof req.body.sessionId !== 'string' || !/^cs_[a-zA-Z0-9_]+$/.test(req.body.sessionId)) fail(400, 'Invalid checkout session.');
    const session = await requireStripe().checkout.sessions.retrieve(req.body.sessionId);
    if (session.client_reference_id !== String(req.user._id)) fail(403, 'This payment belongs to another account.');
    res.json(await fulfill(session));
  });
  return { router, webhook, fulfill };
}
