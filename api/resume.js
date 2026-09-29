// Signed resume download for the team. Links are minted by lib/intake.js and
// handed to Friday; the file itself lives in a private Vercel Blob store.
const { Readable } = require('stream');
const nodeCrypto = require('crypto');
const { resumeSig } = require('../lib/intake');

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && nodeCrypto.timingSafeEqual(x, y);
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'https://calmjoints.org');
  const f = url.searchParams.get('f') || '';
  const s = url.searchParams.get('s') || '';
  const expected = /^resumes\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(f) ? resumeSig(f, process.env) : null;
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!expected || !same(expected, s)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  try {
    const { get } = require('@vercel/blob');
    const out = await get(f, { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!out || !out.stream) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const name = f.split('/').pop();
    res.statusCode = 200;
    res.setHeader('Content-Type', out.blob.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    Readable.fromWeb(out.stream).pipe(res);
  } catch (err) {
    console.error('[resume] fetch failed', err && err.message);
    res.statusCode = 502;
    res.end('Could not load that file right now.');
  }
};
