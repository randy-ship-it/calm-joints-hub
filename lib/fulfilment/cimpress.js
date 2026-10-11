'use strict';
// Cimpress Open. Enabled only when all four credentials exist.
// Auth: OAuth2 client credentials at https://oauth.cimpress.io/v2/token
// Order: POST https://partnerapi.cimpressopen.cimpress.io/{PARTNER_IDENTIFIER}/v1/orders
// Status comes back through /api/cimpress-webhook (processing or shipped, plus tracking).

const REQUIRED = ['CIMPRESS_CLIENT_ID', 'CIMPRESS_SECRET', 'CIMPRESS_PARTNER_ID', 'CIMPRESS_VARIANT_ID'];

function missing(env) {
  return REQUIRED.filter((k) => !String(env[k] || '').trim());
}

function ready(env) {
  return missing(env).length === 0;
}

function variantFor(piece, env) {
  const specific = String(env[`CIMPRESS_VARIANT_${String(piece.id || '').toUpperCase()}`] || '').trim();
  return specific || String(env.CIMPRESS_VARIANT_ID || '').trim();
}

function orderBody(order, env) {
  return {
    orderId: order.id,
    purchaseDate: order.paid_at,
    currencyCode: 'CAD',
    items: (order.pieces || []).map((piece) => ({
      itemId: `${order.id}-${piece.id}`,
      variantId: variantFor(piece, env),
      quantity: piece.copies,
      artworkUrl: piece.artwork_url,
      artwork: { url: piece.artwork_url, type: 'pdf' },
    })),
    shippingAddress: {
      name: order.name,
      address1: order.ship.line1,
      address2: order.ship.line2 || '',
      city: order.ship.city,
      state: order.ship.province,
      postalCode: order.ship.postal,
      country: order.ship.country || 'CA',
      phone: order.phone,
      email: order.email,
    },
    salesChannel: 'calmjoints.org',
  };
}

async function accessToken(env, fetchImpl) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: String(env.CIMPRESS_CLIENT_ID).trim(),
    client_secret: String(env.CIMPRESS_SECRET).trim(),
  });
  if (String(env.CIMPRESS_AUDIENCE || '').trim()) body.set('audience', String(env.CIMPRESS_AUDIENCE).trim());
  const res = await fetchImpl('https://oauth.cimpress.io/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    const err = new Error(`Cimpress auth failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json.access_token;
}

async function submit(order, env, ctx = {}) {
  if (!ready(env)) return { ok: false, status: 'unconfigured', error: `Missing ${missing(env).join(', ')}`, fallback: false };
  const fetchImpl = ctx.fetchImpl || fetch;
  const payload = orderBody(order, env);
  try {
    const token = await accessToken(env, fetchImpl);
    const url = `https://partnerapi.cimpressopen.cimpress.io/${encodeURIComponent(String(env.CIMPRESS_PARTNER_ID).trim())}/v1/orders`;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 409) {
      return { ok: true, status: 'submitted', external_id: json.orderId || order.id, duplicate: true };
    }
    if (!res.ok) {
      return { ok: false, status: 'failed', error: `Cimpress order failed (${res.status})`, http_status: res.status, fallback: false };
    }
    return { ok: true, status: 'submitted', external_id: json.orderId || json.id || order.id };
  } catch (err) {
    return { ok: false, status: 'failed', error: err.message || 'Cimpress request failed', fallback: false };
  }
}

module.exports = { id: 'cimpress', automated: true, REQUIRED, missing, ready, variantFor, orderBody, submit };
