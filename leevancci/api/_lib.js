// Shared helpers for the Vercel serverless functions.
// Environment variables (set in Vercel > Project > Settings > Environment Variables):
//   PAYSTACK_SECRET_KEY        sk_test_... / sk_live_...
//   SUPABASE_URL               https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  service_role key (SECRET - never put it in the browser)

const crypto = require('crypto');

function env() {
  const e = {
    paystack: process.env.PAYSTACK_SECRET_KEY,
    url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  e.ok = !!(e.paystack && e.url && e.key);
  return e;
}

async function supabaseRpc(fn, args) {
  const e = env();
  const r = await fetch(`${e.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: e.key, Authorization: `Bearer ${e.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`Supabase ${fn} failed (${r.status}): ${text}`);
  return data;
}

// Asks Paystack whether a reference was really paid, then marks the order paid in the database.
async function confirmReference(reference) {
  const e = env();
  const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${e.paystack}` },
  });
  const j = await r.json();
  if (!r.ok || !j.status) return { ok: false, error: j.message || 'verify_failed' };
  const t = j.data;
  if (t.status !== 'success') return { ok: false, error: 'not_successful', status: t.status };
  if (t.currency !== 'ZAR') return { ok: false, error: 'wrong_currency' };
  const res = await supabaseRpc('mark_order_paid', {
    p_reference: reference,
    p_paystack_ref: String(t.id || reference),
    p_amount_cents: t.amount,
  });
  return res;
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = { env, supabaseRpc, confirmReference, readRaw, crypto };
