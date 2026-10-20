// Serves the storefront shell for every page, with correct SEO / link-preview tags filled in
// (absolute URLs, product title + photo + price). The page itself is still the same single-page app.
// WhatsApp, Instagram, Facebook and Google read these tags without running JavaScript.
const fs = require('fs');
const path = require('path');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NAME = 'Leevancci';
const STATIC = {
  '/shop': ['Shop', 'Shop performance luxury shoes, bags, apparel and accessories.'],
  '/about': ['About', 'Leevancci is performance luxury: shoes, bags, apparel and accessories made to look sharp and move with you.'],
  '/contact': ['Contact', 'Questions about an order, sizing or delivery? Get in touch with Leevancci.'],
  '/shipping-returns': ['Shipping & returns', 'Delivery times, costs and our 7-day returns policy.'],
  '/privacy': ['Privacy policy', 'How Leevancci collects, uses and protects your personal information.'],
  '/terms': ['Terms of sale', 'The terms that apply when you buy from Leevancci.'],
};
const NOINDEX = ['/checkout', '/account', '/admin', '/login', '/signup', '/forgot', '/reset', '/order'];

function readShell() {
  for (const p of [path.join(process.cwd(), 'shell.html'), path.join(__dirname, '..', 'shell.html')]) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { /* try next */ }
  }
  throw new Error('shell.html not found');
}
const money = (c) => { const n = (c || 0) / 100; return 'R' + n.toFixed(n % 1 ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };

async function findProduct(slug) {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !slug) return null;
  try {
    const r = await fetch(`${url}/rest/v1/products?select=name,description,image,price_cents&is_active=eq.true&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  let html;
  try { html = readShell(); } catch (e) { return res.status(500).send('Site is being deployed. Please refresh in a moment.'); }
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https');
    const origin = `${proto}://${host}`;
    let pathname = '/';
    try { pathname = new URL(req.url, origin).pathname; } catch (e) { /* keep "/" */ }
    if (pathname.startsWith('/api/')) pathname = '/';
    pathname = pathname.replace(/\/+$/, '') || '/';

    let title = `${NAME} | Performance Luxury`;
    let desc = 'Performance luxury shoes, bags, apparel and accessories. Delivered across South Africa, secure checkout in rand with Paystack.';
    let image = `${origin}/images/og.jpg`;
    let ogType = 'website';
    let robots = NOINDEX.some((p) => pathname === p || pathname.startsWith(p + '/'));

    if (STATIC[pathname]) { title = `${STATIC[pathname][0]} | ${NAME}`; desc = STATIC[pathname][1]; }
    const m = pathname.match(/^\/product\/([^/]+)$/);
    if (m) {
      const p = await findProduct(decodeURIComponent(m[1]));
      if (p) {
        title = `${p.name} | ${NAME}`;
        desc = `${(p.description || '').slice(0, 140)} ${money(p.price_cents)}`.trim();
        if (p.image) image = /^https?:/.test(p.image) ? p.image : `${origin}/images/${p.image}`;
        ogType = 'product';
      }
    }
    const rep = (re, to) => { html = html.replace(re, to); };
    rep(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
    rep(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
    rep(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
    rep(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
    rep(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(image)}">`);
    rep(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${ogType}">`);
    rep(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(origin + (pathname === '/' ? '/' : pathname))}">` + (robots ? '\n<meta name="robots" content="noindex,nofollow">' : ''));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).send(html);
  } catch (e) {
    console.error('page', e);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html); // never take the shop down over a meta tag
  }
};
