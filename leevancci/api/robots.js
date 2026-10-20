// GET /robots.txt (rewritten here in vercel.json) so the sitemap link uses your real domain automatically.
module.exports = (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600');
  res.status(200).send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nDisallow: /account\nDisallow: /api/\n\nSitemap: https://${host}/sitemap.xml\n`);
};
