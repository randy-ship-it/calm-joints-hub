'use strict';
// Printful Orders API v2. This is the self-serve automated printer.
// Cards: 8×10 poster (headrest) and 4×6 postcard (seat pocket).
// Decals: 5×5 kiss-cut vinyl (side and rear windshield). Printful single stickers stop at 5×5 in,
// so the exterior art is drawn at that size. A wider windshield banner is not in this catalog.
//
// Enabled when PRINTFUL_API_TOKEN and a catalog variant id for every piece on the order are set.
// Optional: PRINTFUL_STORE_ID (X-PF-Store-Id), PRINTFUL_PLACEMENT, PRINTFUL_TECHNIQUE.
// Create leaves a draft. Confirm is a second call, which is what actually sends it to print.

const TOKEN = 'PRINTFUL_API_TOKEN';

function variantEnv(piece) {
  return piece.printful_env || `PRINTFUL_VARIANT_${String(piece.id || '').toUpperCase()}`;
}

function missing(env, pieces) {
  const list = pieces || [
    { printful_env: 'PRINTFUL_VARIANT_HEADREST' },
    { printful_env: 'PRINTFUL_VARIANT_POCKET' },
    { printful_env: 'PRINTFUL_VARIANT_SIDE' },
    { printful_env: 'PRINTFUL_VARIANT_REAR' },
  ];
  const out = [];
  if (!String(env[TOKEN] || '').trim()) out.push(TOKEN);
  for (const piece of list) {
    const key = variantEnv(piece);
    if (!String(env[key] || '').trim()) out.push(key);
  }
  return [...new Set(out)];
}

function ready(env, order) {
  const pieces = order && order.pieces ? order.pieces : null;
  return missing(env, pieces).length === 0;
}

function orderBody(order, env) {
  const placement = String(env.PRINTFUL_PLACEMENT || 'default').trim();
  const technique = String(env.PRINTFUL_TECHNIQUE || 'digital').trim();
  return {
    external_id: order.id,
    shipping: 'STANDARD',
    recipient: {
      name: order.name,
      address1: order.ship.line1,
      address2: order.ship.line2 || '',
      city: order.ship.city,
      state_code: order.ship.province,
      country_code: order.ship.country || 'CA',
      zip: order.ship.postal.replace(/\s+/g, ''),
      phone: order.phone,
      email: order.email,
    },
    order_items: order.pieces.map((piece) => ({
      source: 'catalog',
      catalog_variant_id: Number(env[variantEnv(piece)]),
      external_id: `${order.id}_${piece.id}`,
      quantity: piece.copies,
      name: piece.name,
      placements: [{
        placement,
        technique,
        print_area_type: 'simple',
        layers: [{ type: 'file', url: piece.artwork_url }],
      }],
    })),
  };
}

function headers(env) {
  const h = {
    Authorization: `Bearer ${String(env[TOKEN]).trim()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (String(env.PRINTFUL_STORE_ID || '').trim()) h['X-PF-Store-Id'] = String(env.PRINTFUL_STORE_ID).trim();
  return h;
}

async function submit(order, env, ctx = {}) {
  if (!ready(env, order)) {
    return { ok: false, status: 'unconfigured', error: `Missing ${missing(env, order.pieces).join(', ')}`, fallback: false };
  }
  const fetchImpl = ctx.fetchImpl || fetch;
  const payload = orderBody(order, env);
  try {
    const created = await fetchImpl('https://api.printful.com/v2/orders', {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify(payload),
    });
    const createdJson = await created.json().catch(() => ({}));
    if (!created.ok) {
      return { ok: false, status: 'failed', error: `Printful create failed (${created.status})`, http_status: created.status, fallback: false };
    }
    const id = createdJson && createdJson.data && createdJson.data.id;
    if (!id) return { ok: false, status: 'failed', error: 'Printful create returned no order id', fallback: false, draft: true };
    const confirmed = await fetchImpl(`https://api.printful.com/v2/orders/${id}/confirm`, {
      method: 'POST',
      headers: headers(env),
    });
    const confirmedJson = await confirmed.json().catch(() => ({}));
    if (!confirmed.ok) {
      return {
        ok: false,
        status: 'draft',
        external_id: String(id),
        error: `Printful draft ${id} was created but confirm failed (${confirmed.status}). Check Printful before placing another order.`,
        fallback: false,
      };
    }
    const status = (confirmedJson.data && confirmedJson.data.status) || 'pending';
    return { ok: true, status: status === 'draft' ? 'submitted' : 'submitted', external_id: String(id), printful_status: status };
  } catch (err) {
    return { ok: false, status: 'failed', error: err.message || 'Printful request failed', fallback: false };
  }
}

module.exports = {
  id: 'printful',
  automated: true,
  fits: 'In-car cards (8×10 poster, 4×6 postcard), 5×5 vinyl stickers for the side and rear windshield, and door hangers when PRINTFUL_VARIANT_HANGER is set. Not a wide windshield banner.',
  TOKEN,
  missing,
  ready,
  orderBody,
  submit,
};
