const { readRaw, send, clientIp } = require('../lib/intake');
const { handleInsider } = require('../lib/squash-insider');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method' });
  let body = {};
  try {
    const raw = await readRaw(req);
    if (raw.length > 4000) return send(res, 413, { ok: false, error: 'size' });
    body = raw ? JSON.parse(raw) : {};
  } catch (err) {
    return send(res, 400, { ok: false, error: 'json' });
  }
  const result = await handleInsider({
    body,
    ip: clientIp(req),
    env: process.env,
    fetchImpl: global.fetch,
  });
  return send(res, result.status, result.json);
};
