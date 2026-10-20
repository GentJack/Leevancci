// GET /sitemap.xml  (rewritten to this function in vercel.json)
// Lists the static pages plus every active product, so Google can find them.
module.exports = async (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `https://${host}`;
  const pages = ['/', '/shop', '/about', '/contact', '/shipping-returns', '/privacy', '/terms'];
  let products = [];
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && anon) {
    try {
      const r = await fetch(`${url}/rest/v1/products?select=slug,created_at&is_active=eq.true`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      });
      if (r.ok) products = await r.json();
    } catch (e) { /* fall back to static pages */ }
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const urls = pages.map((p) => `<url><loc>${esc(origin + p)}</loc></url>`)
    .concat(products.filter((p) => p.slug).map((p) => `<url><loc>${esc(origin + '/product/' + p.slug)}</loc></url>`));
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
};
