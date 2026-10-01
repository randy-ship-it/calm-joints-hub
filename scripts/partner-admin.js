#!/usr/bin/env node
// Team tools for the partner ledger. Needs INTAKE_WEBHOOK_SECRET in the environment.
//   node scripts/partner-admin.js setup <slug> invited|ready      payout-setup status (after the Plooto invite / once they finish)
//   node scripts/partner-admin.js payout <slug> <amount> [ref]     record a payout you sent
//   node scripts/partner-admin.js booking <slug> <ref> [scalehub]  record a booking by hand (e.g. from a Jane confirmation)
//   node scripts/partner-admin.js visit <slug> <ref> <net> [scalehub]
//   node scripts/partner-admin.js reminders                        run payout-setup reminders now
'use strict';
const [cmd, slug, a, b] = process.argv.slice(2);
const url = process.env.PARTNER_EVENTS_URL || 'https://calmjoints.org/api/partner-events';
const secret = process.env.INTAKE_WEBHOOK_SECRET;
if (!secret) { console.error('Set INTAKE_WEBHOOK_SECRET first.'); process.exit(2); }
const today = new Date().toISOString().slice(0, 10);
const bodies = {
  setup: () => ({ action: 'payout_setup', slug, status: a }),
  payout: () => ({ type: 'payout', slug, amount: a, ref: b || `payout:${slug}:${today}:${a}` }),
  booking: () => ({ type: 'booking', slug, ref: a, product: b === 'scalehub' ? 'scalehub' : 'cj', source: 'manual' }),
  visit: () => ({ type: 'visit', slug, ref: a, net: b, product: process.argv[6] === 'scalehub' ? 'scalehub' : 'cj', source: 'manual' }),
};
(async () => {
  if (cmd === 'reminders') { const r = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } }); console.log(r.status, await r.text()); return; }
  if (!bodies[cmd] || !slug) { console.error('Usage: see the top of scripts/partner-admin.js'); process.exit(2); }
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: JSON.stringify(bodies[cmd]()) });
  console.log(r.status, await r.text());
})().catch((e) => { console.error(e.message); process.exit(1); });
