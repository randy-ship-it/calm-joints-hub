#!/usr/bin/env node
// Monthly partner payout: match a Jane billing export to emails captured on /p/<slug>.
// Share = 25% of net billing, where net = billed amount minus physiotherapist pay.
// Jane's export columns vary, so every column name is a flag.
//
//   node scripts/partner-payout.js --billing jane.csv --from-blob --month 2026-10 \
//     --email-col "Patient Email" --amount-col "Total" --date-col "Date" \
//     (--labour-col "Practitioner Pay" | --labour-pct 60 | --labour-flat 60) [--share 25] [--out payout.csv]
//
//   --leads leads.csv  instead of --from-blob: a CSV with slug,email,at columns.
//   --card-pct 2.9     optional card fee taken off before the split.
//   --statements dir   also writes one email-ready statement per partner (no patient names or
//                      emails, only visit dates and amounts) plus payouts-summary.csv with the
//                      payout route: "email + BMO EFT" under --auto-threshold (default $1,000
//                      billed that month), "auto (Plooto)" at or above it.
//   --post             also send each matched visit to the partner ledger (calmjoints.org/api/partner-events,
//                      Bearer $INTAKE_WEBHOOK_SECRET) so partner dashboards and nudges update. Safe to re-run:
//                      each visit has a stable ref, so repeats are ignored. --ref-col "Invoice #" if Jane has one;
//                      --product scalehub for co-branded hub billing. --post-url to override the endpoint.
// A patient is credited to the FIRST partner that captured their email, and only for
// visits billed on or after that capture date.
'use strict';
const fs = require('fs');

function args(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2), n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) o[k] = true; else { o[k] = n; i++; }
  }
  return o;
}

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.replace(/^\uFEFF/, '').trim());
  return rows.filter((r) => r.some((v) => v.trim() !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

function money(v) { const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; }
function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function day(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }

async function leadsFromBlob(token) {
  const { list, get } = require('@vercel/blob');
  const out = []; let cursor;
  do {
    const page = await list({ prefix: 'qr-leads/', cursor, token, limit: 1000 });
    for (const b of page.blobs) {
      if (!/\/email\//.test(b.pathname)) continue;
      const r = await get(b.pathname, { access: 'private', token });
      if (r && r.stream) out.push(JSON.parse(await new Response(r.stream).text()));
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

function firstTouch(leads) {
  const m = new Map();
  for (const l of leads) {
    const e = String(l.email || '').toLowerCase().trim(); const at = day(l.at);
    if (!e || !l.slug || !at) continue;
    const prev = m.get(e);
    if (!prev || at < prev.at) m.set(e, { slug: l.slug, at });
  }
  return m;
}

function statements(totals, lines, o, partners) {
  const dir = o.statements; fs.mkdirSync(dir, { recursive: true });
  const threshold = o['auto-threshold'] ? parseFloat(o['auto-threshold']) : 1000;
  const month = o.month || 'this period';
  const summary = [['slug', 'venue', 'contact_email', 'visits', 'billed', 'net', 'partner_share', 'route'].join(',')];
  for (const t of totals) {
    const p = partners[t.slug] || {};
    const venue = p.venue || t.slug;
    const route = t.billed >= threshold ? 'auto (Plooto)' : 'email + BMO EFT';
    summary.push([t.slug, venue, (p.contact && p.contact.email) || '', t.visits, t.billed, t.net, t.partner_share, route].map(csvCell).join(','));
    const rows = lines.filter((l) => l.slug === t.slug).map((l, i) => `| ${i + 1} | ${l.date} | $${l.billed.toFixed(2)} | $${l.net.toFixed(2)} | $${l.partner_share.toFixed(2)} |`).join('\n');
    const body = `Subject: Calm Joints partnership statement, ${month} (${venue})\n\nHi${p.contact && p.contact.name ? ' ' + p.contact.name.split(' ')[0] : ''},\n\nHere is your Calm Joints partnership statement for ${month}. It covers visits booked through your code. For privacy, it shows no patient names or contact details.\n\n| # | Visit date | Billed | Net after physio pay | Your share |\n|---|---|---|---|---|\n${rows}\n\nVisits: ${t.visits}\nBilled: $${t.billed.toFixed(2)}\nNet: $${t.net.toFixed(2)}\nYour location's share: $${t.partner_share.toFixed(2)}\n\nYour running balance is always in your partner dashboard at https://calmjoints.org/partner. We pay it out by direct deposit once more than $500 is owed to you; smaller balances carry forward. Reply to this email with any questions.\n\nThis is a commercial partnership between your location and Calm Joints (Clairvoyant Holdings Inc.), not a referral fee. Both sides share in the proceeds and the commercial risks.\n\nCalm Joints\ninfo@calmjoints.org\n`;
    fs.writeFileSync(require('path').join(dir, `${t.slug}-${o.month || 'statement'}.md`), body);
  }
  fs.writeFileSync(require('path').join(dir, 'payouts-summary.csv'), summary.join('\n') + '\n');
}

function compute(billing, touch, o) {
  const share = (o.share ? parseFloat(o.share) : 25) / 100;
  const ec = o['email-col'] || 'Email', ac = o['amount-col'] || 'Amount', dc = o['date-col'] || 'Date';
  const lines = [], totals = {};
  for (const r of billing) {
    const email = String(r[ec] || '').toLowerCase().trim();
    const t = touch.get(email); if (!t) continue;
    const when = day(r[dc]);
    if (o.month && (!when || when.toISOString().slice(0, 7) !== o.month)) continue;
    if (when && when < new Date(t.at.toISOString().slice(0, 10))) continue;
    const billed = money(r[ac]);
    const labour = o['labour-col'] ? money(r[o['labour-col']]) : o['labour-pct'] ? billed * parseFloat(o['labour-pct']) / 100 : money(o['labour-flat']);
    const fee = o['card-pct'] ? billed * parseFloat(o['card-pct']) / 100 : 0;
    const net = Math.max(0, billed - labour - fee);
    const pay = Math.round(net * share * 100) / 100;
    const ref = o['ref-col'] && r[o['ref-col']] ? `jane:${r[o['ref-col']]}` : `jane:${require('crypto').createHash('sha256').update([email, r[dc] || '', billed, JSON.stringify(r)].join('|')).digest('hex').slice(0, 20)}`;
    lines.push({ ref, slug: t.slug, email, date: r[dc] || '', billed, labour: Math.round(labour * 100) / 100, net: Math.round(net * 100) / 100, partner_share: pay });
    const T = totals[t.slug] || (totals[t.slug] = { slug: t.slug, visits: 0, billed: 0, net: 0, partner_share: 0 });
    T.visits++; T.billed += billed; T.net += net; T.partner_share += pay;
  }
  return { lines, totals: Object.values(totals).map((t) => ({ ...t, billed: +t.billed.toFixed(2), net: +t.net.toFixed(2), partner_share: +t.partner_share.toFixed(2) })) };
}

async function main() {
  const o = args(process.argv);
  if (!o.billing || (!o.leads && !o['from-blob'])) {
    console.error('Usage: partner-payout.js --billing jane.csv (--leads leads.csv | --from-blob) [--month YYYY-MM] [--email-col] [--amount-col] [--date-col] [--labour-col | --labour-pct | --labour-flat] [--share 25] [--out file.csv]');
    process.exit(2);
  }
  if (!o['labour-col'] && !o['labour-pct'] && !o['labour-flat']) console.warn('Warning: no physio pay given, so net = full billed amount.');
  const billing = parseCsv(fs.readFileSync(o.billing, 'utf8'));
  const leads = o.leads ? parseCsv(fs.readFileSync(o.leads, 'utf8')) : await leadsFromBlob(process.env.BLOB_READ_WRITE_TOKEN);
  const { lines, totals } = compute(billing, firstTouch(leads), o);
  const cols = ['slug', 'email', 'date', 'billed', 'labour', 'net', 'partner_share'];
  const csv = [cols.join(','), ...lines.map((l) => cols.map((c) => csvCell(l[c])).join(','))].join('\n') + '\n';
  if (o.out) fs.writeFileSync(o.out, csv); else process.stdout.write(csv);
  console.error(`\n${billing.length} billing rows, ${leads.length} captured leads, ${lines.length} matched visits`);
  for (const t of totals) console.error(`  ${t.slug}: ${t.visits} visits, billed $${t.billed}, net $${t.net}, partner $${t.partner_share}`);
  if (o.post) {
    const url = o['post-url'] || 'https://calmjoints.org/api/partner-events';
    const secret = process.env.INTAKE_WEBHOOK_SECRET;
    if (!secret) throw new Error('--post needs INTAKE_WEBHOOK_SECRET in the environment');
    const events = lines.map((l) => ({ type: 'visit', slug: l.slug, ref: l.ref, billed: l.billed, net: l.net, share: l.partner_share, at: day(l.date) ? day(l.date).toISOString() : undefined, product: o.product || 'cj', source: 'jane-export' }));
    for (let i = 0; i < events.length; i += 100) {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: JSON.stringify({ events: events.slice(i, i + 100) }) });
      const j = await res.json().catch(() => ({}));
      const dup = (j.results || []).filter((x) => x.duplicate).length;
      console.error(`Posted ${Math.min(100, events.length - i)} visits to the ledger: HTTP ${res.status}, ${dup} already recorded`);
    }
  }
  if (o.statements) {
    const partners = {};
    if (o['from-blob']) {
      const { getPartner } = require('../lib/qr-partners.js');
      for (const t of totals) partners[t.slug] = await getPartner(t.slug, process.env).catch(() => null) || {};
    }
    statements(totals, lines, o, partners);
    console.error(`Statements written to ${o.statements}`);
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { parseCsv, firstTouch, compute, statements };
