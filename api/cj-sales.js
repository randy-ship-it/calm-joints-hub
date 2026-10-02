// Internal Calm Joints sales feed: every sale with its source (QR partner + sign code, brand, or direct),
// plus QR scans per partner. Used by /sales, and readable by Friday and Scale admin.
// Auth: Bearer CJ_ADMIN_KEY.
const crypto = require('crypto');
const L = require('../lib/partner-ledger');
const { getPartner } = require('../lib/qr-partners');
const { send } = require('../lib/intake');

function authed(req, env) {
  const k = (env.CJ_ADMIN_KEY || '').trim();
  const h = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!k || !h) return false;
  const a = crypto.createHash('sha256').update(h).digest(), b = crypto.createHash('sha256').update(k).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  const env = process.env;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { send(res, 405, { ok: false }); return; }
  if (!authed(req, env)) { send(res, 401, { ok: false, message: 'Wrong key.' }); return; }
  try {
    const slugs = [...new Set((await L.listAll('qr-partners/', env)).filter((b) => b.pathname.endsWith('/partner.json')).map((b) => b.pathname.split('/')[1]))];
    const sales = [];
    const partners = [];
    for (const slug of slugs) {
      const p = await getPartner(slug, env); if (!p) continue;
      const { s, ev } = await L.summary(slug, env);
      let billed = 0;
      for (const e of ev) {
        if (e.type !== 'booking' && e.type !== 'visit') continue;
        if (e.type === 'visit') billed += e.billed || 0;
        sales.push({ at: e.at, type: e.type, billed: e.billed || null, product: e.product || 'cj', channel: 'qr_partner', via: p.venue, slug, code: e.code || null });
      }
      partners.push({ slug, venue: p.venue, city: p.city || null, created_at: p.created_at, downloads: s.downloads, scans: s.scans, emails: s.emails, booking_clicks: s.booking_clicks, bookings: s.bookings, visits: s.visits, billed: Math.round(billed * 100) / 100, by_code: s.by_code });
    }
    for (const b of await L.listAll('cj-sales/direct/', env)) {
      const e = await L.readJson(b.pathname, env); if (!e) continue;
      sales.push({ at: e.at, type: e.type, billed: e.billed || null, product: e.product || 'cj', channel: e.channel || 'direct', via: e.channel || 'direct', slug: null, code: null });
    }
    sales.sort((a, b) => (a.at < b.at ? 1 : -1));
    const paid = sales.filter((x) => x.type === 'visit');
    const by_channel = {};
    for (const x of sales) { const k = x.channel; by_channel[k] = by_channel[k] || { bookings: 0, visits: 0, billed: 0 }; by_channel[k][x.type === 'visit' ? 'visits' : 'bookings']++; by_channel[k].billed = Math.round((by_channel[k].billed + (x.type === 'visit' ? x.billed || 0 : 0)) * 100) / 100; }
    partners.sort((a, b) => b.scans - a.scans);
    send(res, 200, {
      ok: true, as_of: new Date().toISOString(),
      totals: { sales: paid.length, bookings: sales.length - paid.length, billed: Math.round(paid.reduce((n, x) => n + (x.billed || 0), 0) * 100) / 100, partners: partners.length, scans: partners.reduce((n, x) => n + x.scans, 0), downloads: partners.reduce((n, x) => n + x.downloads, 0) },
      latest_sale: sales[0] || null, by_channel, partners, recent: sales.slice(0, 50),
    });
  } catch (err) { console.error('[cj-sales] failed', err && err.message); send(res, 503, { ok: false, message: 'Sales feed is busy. Try again in a minute.' }); }
};
