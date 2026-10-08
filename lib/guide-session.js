// Signed guide sessions (2026-10-08, PHANTOM-CALL-DETECTION-PLAN step 4).
// The browser asks us for a short-lived ElevenLabs signed URL instead of opening the public agent directly.
// Gates, all 0 tokens: same-site Origin/Referer, optional Cloudflare Turnstile, per-IP caps.
// Once the site always sends signed sessions, turn on enable_auth on Glen and Gwen (ElevenLabs Security tab)
// so scripts that only know the agent ID (and a forged Origin header) can't open sessions at all.
const { clientIp, rateLimit } = require('./intake');

const DEFAULT_AGENTS = { glen: 'agent_8401m48tn2g5ehwsa0p84e8pnaf8', gwen: 'agent_8701m49rk5stf07avtka9ef8nvs0' };
const HOSTS = ['calmjoints.org', 'www.calmjoints.org'];
const LIMITS = { burst: 6, burstMs: 10 * 60 * 1000, day: 30, dayMs: 24 * 60 * 60 * 1000 };

function agents(env) {
  return {
    glen: (env.CJ_GLEN_AGENT_ID || DEFAULT_AGENTS.glen).trim(),
    gwen: (env.CJ_GWEN_AGENT_ID || DEFAULT_AGENTS.gwen).trim(),
  };
}

function allowedHost(req, env) {
  const extra = String(env.CJ_GUIDE_EXTRA_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean);
  const ok = HOSTS.concat(extra);
  for (const h of [req.headers.origin, req.headers.referer]) {
    if (!h) continue;
    try { return ok.includes(new URL(h).hostname); } catch { return false; }
  }
  return false;
}

async function turnstileOk(token, ip, env, fetchImpl) {
  const secret = (env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) return true; // not configured yet: other gates still apply
  if (!token) return false;
  try {
    const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: String(token).slice(0, 2048), remoteip: ip }).toString(),
    });
    const j = await r.json();
    return !!(j && j.success);
  } catch (e) {
    return false;
  }
}

// req: Node request; params: URLSearchParams of the query. Returns { status, json }.
async function guideSession(req, params, env, fetchImpl = fetch, opts = {}) {
  if (!allowedHost(req, env)) return { status: 403, json: { ok: false } };
  const key = String(params.get('guide') || 'glen').toLowerCase();
  const agentId = agents(env)[key];
  if (!agentId) return { status: 400, json: { ok: false } };
  const ip = clientIp(req);
  const store = opts.store;
  if (!rateLimit(`gs:${ip}`, { limit: LIMITS.burst, windowMs: LIMITS.burstMs, store })
      || !rateLimit(`gsd:${ip}`, { limit: LIMITS.day, windowMs: LIMITS.dayMs, store })) {
    return { status: 429, json: { ok: false, message: 'The guide is busy for you right now. Try again in a few minutes, or book a visit.' } };
  }
  const tsToken = req.headers['x-cj-turnstile'] || params.get('ts') || '';
  if (!(await turnstileOk(tsToken, ip, env, fetchImpl))) return { status: 403, json: { ok: false, message: 'Quick check failed. Refresh the page and try again.' } };
  const xi = (env.ELEVENLABS_API_KEY || '').trim();
  if (!xi) return { status: 503, json: { ok: false } };
  try {
    const r = await fetchImpl(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, { headers: { 'xi-api-key': xi } });
    if (!r.ok) return { status: 503, json: { ok: false } };
    const j = await r.json();
    if (!j || !j.signed_url) return { status: 503, json: { ok: false } };
    return { status: 200, json: { ok: true, signedUrl: j.signed_url } };
  } catch (e) {
    return { status: 503, json: { ok: false } };
  }
}

module.exports = { guideSession, agents, allowedHost, LIMITS };
