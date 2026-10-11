'use strict';
// Manual one-shot. Uses CJ_ADMIN_KEY already on Vercel (the value is
// not readable from the API) to call the live admin endpoint, then prints the
// /sales row for amb-randyg-cj. Never prints the key.
const SLUG = 'amb-randyg-cj';

async function main() {
  if (process.env.VERCEL_ENV !== 'production') {
    console.log('[seed] skip', process.env.VERCEL_ENV || 'local');
    return;
  }
  const key = (process.env.CJ_ADMIN_KEY || '').trim();
  if (!key) {
    console.log('[seed] skip, CJ_ADMIN_KEY unset');
    return;
  }
  const auth = { Authorization: `Bearer ${key}` };
  const created = await fetch('https://calmjoints.org/api/admin-partner', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: SLUG, name: 'Randy Gilling', email: 'randy@silverbirchgrowth.com', alias: 'randy' }),
  });
  const createdBody = await created.json().catch(() => ({}));
  const view = createdBody.partner || {};
  console.log('[seed] create', created.status, JSON.stringify({
    ok: createdBody.ok,
    message: createdBody.message || null,
    friday: createdBody.friday || null,
    emailed: createdBody.emailed === undefined ? null : createdBody.emailed,
    slug: view.slug || null,
    alias: view.alias || null,
    contact_type: view.contact_type || null,
    share: view.terms && view.terms.share || null,
    qr_url: view.qr_url || null,
    alias_url: view.alias_url || null,
    pen_url: view.pen_url || null,
  }));
  if (created.status !== 200 && created.status !== 409) process.exitCode = 1;
  const salesRes = await fetch('https://calmjoints.org/api/cj-sales', { headers: auth });
  const sales = await salesRes.json().catch(() => ({}));
  const row = (sales.partners || []).find((p) => p.slug === SLUG) || null;
  console.log('[seed] sales', salesRes.status, JSON.stringify(row ? {
    slug: row.slug,
    kind: row.kind,
    contact_type: row.contact_type,
    alias: row.alias,
    scans: row.scans,
    by_src: row.by_src,
    totals_scans: sales.totals && sales.totals.scans,
  } : { missing: true }));
}

main().catch((err) => {
  console.error('[seed] failed', err && err.message);
  process.exit(1);
});
