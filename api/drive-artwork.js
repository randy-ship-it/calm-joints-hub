// Signed PDF download for the printer, or an admin with CJ_ADMIN_KEY.
const D = require('../lib/drive-orders');

module.exports = async function handler(req, res) {
  const env = process.env;
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end('{"ok":false}');
    return;
  }
  const url = new URL(req.url, 'https://calmjoints.org');
  const orderId = url.searchParams.get('order') || '';
  const pieceId = url.searchParams.get('piece') || '';
  const query = { order: orderId, piece: pieceId, exp: url.searchParams.get('exp'), sig: url.searchParams.get('sig') };
  if (!D.artAuthed(query, env, D.adminAuthed(req, env))) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end('{"ok":false,"message":"That artwork link is not valid."}');
    return;
  }
  try {
    const art = await D.readArtwork(orderId, pieceId, env);
    if (!art) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end('{"ok":false}');
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pieceId}.pdf"`);
    if (req.method === 'HEAD') res.end();
    else res.end(art.buf);
  } catch (err) {
    console.error('[drive] artwork failed', err && err.message);
    res.statusCode = 503;
    res.end('{"ok":false}');
  }
};
