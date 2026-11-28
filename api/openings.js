/**
 * GET /api/openings?visit=initial|followup
 * Live Jane openings for the in-site physio calendar. No clinician names, no PII.
 */
const { listOpenings } = require('../lib/guide-availability');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'GET') { send(res, 405, { ok: false, message: 'GET only' }); return; }
  const url = new URL(req.url, 'https://calmjoints.org');
  const visit = url.searchParams.get('visit') === 'followup' ? 'followup' : 'initial';
  try {
    const data = await listOpenings({ kind: visit, days: 14 });
    send(res, 200, data);
  } catch (err) {
    console.error('[openings]', err && err.message);
    send(res, 200, {
      ok: false,
      kind: visit,
      count: 0,
      slots: [],
      days: {},
      booking_page: 'https://calmjoints.janeapp.com/locations/calm-joints/book#/discipline/2/treatment/346',
      message: 'Live availability could not be read right now. You can still open the booking page to pick a time.',
    });
  }
};
