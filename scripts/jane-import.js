// Feed a Jane report (CSV export) into the Calm Joints sales ledger so every payment shows on /sales and in Friday
// with its source. Partner shares are not set from this file (profit needs physio pay); billed amounts only.
// Patients are matched to a QR partner by email; anything unmatched is kept under --channel.
//   node scripts/jane-import.js report.csv --channel brand:drho            dry run: shows what it would send
//   node scripts/jane-import.js report.csv --channel cj-direct --send      posts to /api/partner-events
// Needs INTAKE_WEBHOOK_SECRET for --send. Re-running the same file is safe (each row's id is only counted once).
const fs = require('fs');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const channel = opt('channel') || 'direct';
const send = args.includes('--send');
const site = opt('site') || 'https://calmjoints.org';
if (!file) { console.error('Usage: node scripts/jane-import.js <report.csv> --channel <brand:drho|cj-direct> [--send]'); process.exit(1); }

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
const [head, ...body] = parseCsv(fs.readFileSync(file, 'utf8'));
const find = (...names) => head.findIndex((h) => names.some((n) => h.trim().toLowerCase().includes(n)));
const col = { email: find('email'), ref: find('invoice', 'appointment id', 'receipt', 'id'), amount: find('total', 'amount', 'paid', 'price'), date: find('date', 'start') };
const missing = Object.entries(col).filter(([, i]) => i < 0).map(([k]) => k);
if (missing.length) { console.error(`Couldn't find column(s): ${missing.join(', ')}. Headers were: ${head.join(' | ')}`); process.exit(1); }
console.log(`Using columns: email="${head[col.email]}", id="${head[col.ref]}", amount="${head[col.amount]}", date="${head[col.date]}"`);

const events = body.map((r) => ({
  type: 'visit', patient_email: (r[col.email] || '').trim(), ref: `jane:${channel}:${(r[col.ref] || '').trim()}`,
  billed: r[col.amount], at: r[col.date] ? new Date(r[col.date]).toISOString() : undefined, channel, source: 'jane',
})).filter((e) => e.ref.split(':').pop());
console.log(`${events.length} payments from ${file} (channel ${channel})`);
if (!send) { console.log(events.slice(0, 5)); console.log('Dry run. Add --send to record them.'); process.exit(0); }
(async () => {
  const key = (process.env.INTAKE_WEBHOOK_SECRET || '').trim();
  if (!key) { console.error('INTAKE_WEBHOOK_SECRET is not set.'); process.exit(1); }
  for (let i = 0; i < events.length; i += 100) {
    const res = await fetch(`${site}/api/partner-events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ events: events.slice(i, i + 100) }) });
    const j = await res.json().catch(() => ({}));
    const rs = j.results || [];
    console.log(`batch ${i / 100 + 1}: ${res.status}, partner ${rs.filter((x) => x.slug && !x.duplicate).length}, other channel ${rs.filter((x) => x.attributed === false).length}, already in ${rs.filter((x) => x.duplicate).length}`);
  }
})();
