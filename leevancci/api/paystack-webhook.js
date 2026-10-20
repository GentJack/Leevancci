// POST /api/paystack-webhook
// In Paystack Dashboard > Settings > API Keys & Webhooks, set the webhook URL to
//   https://YOUR-DOMAIN/api/paystack-webhook
// This is the safety net: it marks orders paid even if the customer closes the tab after paying.
const { env, confirmReference, readRaw, crypto } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const e = env();
  if (!e.ok) return res.status(500).end();
  try {
    const raw = await readRaw(req);
    const sig = String(req.headers['x-paystack-signature'] || '');
    const expected = crypto.createHmac('sha512', e.paystack).update(raw).digest('hex');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).end();

    const event = JSON.parse(raw.toString());
    if (event.event === 'charge.success' && event.data && event.data.reference) {
      const result = await confirmReference(event.data.reference);
      if (!result.ok) console.warn('webhook: could not confirm', event.data.reference, result);
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('paystack-webhook', err);
    return res.status(500).end(); // Paystack will retry
  }
};
// We need the untouched body to check the signature.
module.exports.config = { api: { bodyParser: false } };
