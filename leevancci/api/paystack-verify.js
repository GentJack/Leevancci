// POST /api/paystack-verify   body: { "reference": "LV-XXXXXXXX" }
// Called by the browser right after the Paystack popup succeeds.
// We never trust the browser: we ask Paystack directly and compare the amount to the order in the database.
const { env, confirmReference, readRaw } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!env().ok) return res.status(500).json({ ok: false, error: 'server_not_configured' });
  try {
    let body = req.body;
    if (!body || typeof body !== 'object') {
      try { body = JSON.parse((await readRaw(req)).toString() || '{}'); } catch { body = {}; }
    }
    const reference = String(body.reference || '');
    if (!/^LV-[A-Z0-9]{6,20}$/.test(reference)) return res.status(400).json({ ok: false, error: 'bad_reference' });
    const result = await confirmReference(reference);
    return res.status(result.ok ? 200 : 402).json(result);
  } catch (err) {
    console.error('paystack-verify', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
