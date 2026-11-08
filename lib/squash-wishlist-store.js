'use strict';

const crypto = require('crypto');
const { send, clientIp, rateLimit } = require('./intake');

const PREFIX = 'cj-wishlists/squash/';
const OFFER_ID = 'squash-insider-unconfirmed';
const OFFER_STATUS = 'eligible_rate_unconfirmed';
const CART_STATUS = 'blocked';
const GATES = {
  hub_products_loaded: false,
  guest_checkout: false,
  corporate_codes: false,
};
const BLOCKER = 'Cart handoff is blocked. These products are not confirmed on the hub, checkout without a membership is not confirmed, and corporate codes are not confirmed. No wholesale amount is stored.';

function retailSnapshot(label) {
  const match = /^(US|CA)\$(\d+)\.(\d{2})$/.exec(String(label || ''));
  if (!match) return null;
  return {
    price_kind: 'retail_listed',
    retail_currency: match[1] === 'US' ? 'USD' : 'CAD',
    retail_amount_cents: Number(match[2]) * 100 + Number(match[3]),
    retail_label: label,
    wholesale_amount_cents: null,
    wholesale_status: 'unconfirmed',
  };
}

function recordId(email, lines) {
  const body = [
    OFFER_ID,
    email,
    lines.map((line) => line.product_id + ':' + line.quantity).sort().join(','),
  ].join('\n');
  return crypto.createHash('sha256').update(body).digest('hex');
}

function buildRecord({ email, lines, now }) {
  const id = recordId(email, lines);
  return {
    id,
    created_at: now,
    source: 'squash-insider',
    email,
    offer_id: OFFER_ID,
    offer_status: OFFER_STATUS,
    cart_status: CART_STATUS,
    gates: GATES,
    email_status: 'pending',
    lines,
  };
}

function blobClient(env) {
  if (env && env.wishlistBlob) return env.wishlistBlob;
  if (!env || !String(env.BLOB_READ_WRITE_TOKEN || '').trim()) return null;
  const blob = require('@vercel/blob');
  const token = env.BLOB_READ_WRITE_TOKEN;
  return {
    async get(path) {
      try {
        const out = await blob.get(path, { access: 'private', token });
        if (!out || !out.stream) return null;
        return JSON.parse(await new Response(out.stream).text());
      } catch (err) {
        return null;
      }
    },
    async put(path, obj, overwrite) {
      await blob.put(path, JSON.stringify(obj), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: Boolean(overwrite),
        token,
      });
    },
    async list(prefix) {
      const out = [];
      let cursor;
      do {
        const page = await blob.list({ prefix, cursor, token, limit: 1000 });
        out.push(...(page.blobs || []).map((item) => item.pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return out;
    },
  };
}

function pathFor(id) {
  return PREFIX + id + '.json';
}

async function saveWishlist(env, record) {
  const client = blobClient(env);
  if (!client) return { ok: false, persistence: 'unconfigured' };
  const path = pathFor(record.id);
  try {
    const existing = await client.get(path);
    if (existing) return { ok: true, persistence: 'stored', duplicate: true, record: existing };
    await client.put(path, record, false);
    return { ok: true, persistence: 'stored', duplicate: false, record };
  } catch (err) {
    try {
      const again = await client.get(path);
      if (again) return { ok: true, persistence: 'stored', duplicate: true, record: again };
    } catch (readErr) {
      console.error('[wishlist] read after write failed');
    }
    console.error('[wishlist] store failed', err && err.message);
    return { ok: false, persistence: 'failed' };
  }
}

async function markEmail(env, id, emailStatus) {
  const client = blobClient(env);
  if (!client || !id) return { ok: false };
  const path = pathFor(id);
  try {
    const record = await client.get(path);
    if (!record) return { ok: false };
    record.email_status = emailStatus;
    await client.put(path, record, true);
    return { ok: true, record };
  } catch (err) {
    console.error('[wishlist] email status not updated', err && err.message);
    return { ok: false };
  }
}

function interestOf(records) {
  const byId = new Map();
  records.forEach((record) => {
    (record.lines || []).forEach((line) => {
      const row = byId.get(line.product_id) || {
        product_id: line.product_id,
        name: line.name,
        wishlist_count: 0,
        quantity_total: 0,
        retail_label: line.retail_label,
        retail_currency: line.retail_currency,
        wholesale_status: 'unconfirmed',
        mapping_status: line.mapping_status || 'unmapped',
        scale_sku: line.scale_sku || null,
      };
      row.wishlist_count += 1;
      row.quantity_total += Number(line.quantity) || 0;
      byId.set(line.product_id, row);
    });
  });
  return [...byId.values()].sort((a, b) => b.quantity_total - a.quantity_total || a.product_id.localeCompare(b.product_id));
}

async function loadRecords(env) {
  const client = blobClient(env);
  if (!client) return { ok: false, persistence: 'unconfigured', records: [] };
  const paths = await client.list(PREFIX);
  const records = [];
  for (const path of paths) {
    const record = await client.get(path);
    if (record) records.push(record);
  }
  records.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return { ok: true, persistence: 'stored', records };
}

function authed(req, env) {
  const key = String((env && env.CJ_ADMIN_KEY) || '').trim();
  const header = String((req.headers && (req.headers.authorization || req.headers['x-cj-admin-key'])) || '').replace(/^Bearer\s+/i, '').trim();
  if (!key || !header) return false;
  const given = crypto.createHash('sha256').update(header).digest();
  const want = crypto.createHash('sha256').update(key).digest();
  return crypto.timingSafeEqual(given, want);
}

function csvEscape(value) {
  const text = String(value == null ? '' : value);
  if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function toCsv(records) {
  const header = ['created_at', 'wishlist_id', 'email', 'product_id', 'name', 'quantity', 'retail_currency', 'retail_amount_cents', 'retail_label', 'wholesale_status', 'mapping_status', 'scale_sku', 'catalog_href', 'cart_status', 'offer_id'];
  const rows = [header.join(',')];
  records.forEach((record) => {
    (record.lines || []).forEach((line) => {
      rows.push([
        record.created_at,
        record.id,
        record.email,
        line.product_id,
        line.name,
        line.quantity,
        line.retail_currency,
        line.retail_amount_cents,
        line.retail_label,
        line.wholesale_status,
        line.mapping_status,
        line.scale_sku,
        line.catalog_href,
        record.cart_status,
        record.offer_id,
      ].map(csvEscape).join(','));
    });
  });
  return rows.join('\n') + '\n';
}

async function handleWishlistAdmin(req, res, env) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method' });
  if (!authed(req, env || {})) return send(res, 401, { ok: false, error: 'auth' });
  if (!rateLimit('squash-wishlist-admin:' + (clientIp(req) || 'unknown'), { limit: 30, windowMs: 10 * 60 * 1000 })) {
    return send(res, 429, { ok: false, error: 'rate' });
  }
  const loaded = await loadRecords(env || {});
  if (!loaded.ok) {
    return send(res, 503, {
      ok: false,
      persistence: loaded.persistence,
      cart_conversion: CART_STATUS,
      gates: GATES,
      blocker: 'Wishlist storage is off because BLOB_READ_WRITE_TOKEN is not available to this process. The squash form can still send email. No Neon database is configured, and sql/squash-wishlist.sql has not been applied.',
    });
  }
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.searchParams.get('format') === 'csv') {
    const body = toCsv(loaded.records);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="squash-wishlists.csv"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    res.end(body);
    return null;
  }
  return send(res, 200, {
    ok: true,
    storage: 'vercel-blob-private',
    cart_conversion: CART_STATUS,
    gates: GATES,
    blocker: BLOCKER,
    interest: interestOf(loaded.records),
    wishlists: loaded.records,
  });
}

module.exports = {
  PREFIX,
  OFFER_ID,
  GATES,
  CART_STATUS,
  retailSnapshot,
  buildRecord,
  saveWishlist,
  markEmail,
  interestOf,
  loadRecords,
  handleWishlistAdmin,
  toCsv,
};
