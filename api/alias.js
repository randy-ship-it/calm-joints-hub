// GET /api/alias?name=randy -> 302 /p/<slug>?src=pen
// The public pen URL is /<alias>, rewritten here by middleware. This route is the same lookup.
const { aliasRedirect } = require('../lib/partner-alias');

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'https://calmjoints.org');
  const name = url.searchParams.get('name') || '';
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end('{"ok":false}');
    return;
  }
  try {
    const dest = await aliasRedirect(name, process.env, url.searchParams.get('src'));
    if (!dest) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end('{"ok":false}');
      return;
    }
    res.statusCode = 302;
    res.setHeader('Location', dest.location);
    if (req.method !== 'HEAD') res.end();
    else res.end();
  } catch (err) {
    console.error('[alias] failed', err && err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end('{"ok":false}');
  }
};
