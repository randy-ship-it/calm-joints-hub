'use strict';
// Paid drive-kit orders: reserve a handle, charge in Stripe, then create the partner,
// PDFs, and a print submission. Manual queue is only the fallback.

const crypto = require('crypto');
const KITS = require('../config/drive-kits');
const { quote, catalog } = require('./drive-pricing');
const { renderOrder, decalUrl } = require('./drive-artwork');
const { selectAdapter, report: adapterReport } = require('./fulfilment');
const { createDrivePartner, getPartner, validEmail } = require('./qr-partners');
const { RESERVED_ALIASES, normalizeAlias, validAlias, readAlias } = require('./partner-alias');
const { PROVINCES, rateLimit, clientIp, readRaw } = require('./intake');
const L = require('./partner-ledger');

const STRIPE_ENV = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
const HOLD_MS = 30 * 60 * 1000;

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function blob() { return require('@vercel/blob'); }
function tok(env) { return env.BLOB_READ_WRITE_TOKEN; }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

async function putJson(pathname, obj, env, overwrite) {
  return blob().put(pathname, JSON.stringify(obj), {
    access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: Boolean(overwrite), token: tok(env),
  });
}
async function readJson(pathname, env) {
  try {
    const out = await blob().get(pathname, { access: 'private', token: tok(env) });
    if (!out || !out.stream) return null;
    return JSON.parse(await new Response(out.stream).text());
  } catch { return null; }
}

function stripeMissing(env) {
  return STRIPE_ENV.filter((k) => !String(env[k] || '').trim());
}
function stripeMode(env) {
  const key = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return 'missing';
  if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return 'test';
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return 'live';
  return 'unknown';
}
function live(env) { return String(env.CJ_DRIVE_LIVE || '').trim() === 'true'; }
function driveMode(env) {
  if (String(env.CJ_DRIVE_MODE || '').trim() === 'manual') return 'manual';
  if (live(env)) return 'checkout';
  return 'closed';
}
const PAY_CONFIRM = "We'll email you a secure payment link within 24h; your kit ships after payment.";
const CARD_KEYS = /^(card|card_number|cardnumber|pan|cvc|cvv|cvc2|expiry|expiration|exp|exp_month|exp_year|cc|ccn|number)$/i;

function rejectsCard(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return false;
  return Object.keys(value).some((key) => CARD_KEYS.test(key) || rejectsCard(value[key], depth + 1));
}

function signKey(env) {
  return (env.CJ_ADMIN_KEY || env.INTAKE_WEBHOOK_SECRET || env.FRIDAY_API_KEY || '').trim();
}
function artSig(orderId, piece, exp, env) {
  const key = signKey(env);
  if (!key) return null;
  return crypto.createHmac('sha256', key).update(`drive-art:${orderId}:${piece}:${exp}`).digest('base64url');
}
function artworkPath(orderId, pieceId) { return `drive-orders/${orderId}/${pieceId}.pdf`; }
function orderPath(orderId) { return `drive-orders/${orderId}/order.json`; }
function handlePath(handle) { return `drive-handles/${handle}.json`; }

function publicArtLink(origin, orderId, pieceId, env, days = 30) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const sig = artSig(orderId, pieceId, exp, env);
  if (!sig) return null;
  return `${origin}/api/drive-artwork?order=${encodeURIComponent(orderId)}&piece=${encodeURIComponent(pieceId)}&exp=${exp}&sig=${sig}`;
}

function validate(body) {
  const partner_type = ['ambassador', 'rideshare', 'business', 'other'].includes(body.partner_type) ? body.partner_type : '';
  const kits = ['incar'];
  if (body.exterior === true || body.exterior === 'true' || body.exterior === 'on' || body.exterior === '1') kits.push('exterior');
  const name = clean(body.name, 80);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 40);
  const handle = normalizeAlias(body.handle);
  const ship = {
    line1: clean(body.line1 || body.address1, 120),
    line2: clean(body.line2 || body.address2, 120),
    city: clean(body.city, 80),
    province: clean(body.province, 2).toUpperCase(),
    postal: clean(body.postal || body.postal_code, 10).toUpperCase().replace(/\s+/g, ' '),
    country: 'CA',
  };
  const errors = [];
  if (!partner_type) errors.push('Choose a partner type.');
  if (!name || name.length < 2) errors.push('What is your name?');
  if (!validEmail(email)) errors.push('That email doesn’t look quite right.');
  if (phone.replace(/\D/g, '').length < 10) errors.push('Add a phone number for the shipment.');
  if (!validAlias(handle)) errors.push('Handles are lowercase letters, numbers, and hyphens.');
  else if (RESERVED_ALIASES.has(handle)) errors.push('That handle is already used by the site.');
  if (!ship.line1 || ship.line1.length < 4) errors.push('Add a street address.');
  if (!ship.city || ship.city.length < 2) errors.push('Add a city.');
  if (!PROVINCES[ship.province]) errors.push('Choose a province.');
  if (!/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/.test(ship.postal)) errors.push('That postal code doesn’t look quite right.');
  return { errors, value: { partner_type, kits, name, email, phone, handle, ship } };
}

async function handleTaken(handle, env, now = Date.now()) {
  if (await readAlias(handle, env)) return 'alias';
  if (await getPartner(`drv-${handle}`, env)) return 'partner';
  const hold = await readJson(handlePath(handle), env);
  if (!hold) return null;
  if (hold.status === 'paid') return 'order';
  if (hold.status === 'awaiting payment') return 'hold';
  if (hold.status === 'pending' && Date.parse(hold.hold_until) > now) return 'hold';
  await blob().del(handlePath(handle), { token: tok(env) }).catch(() => null);
  return null;
}

function newOrderId() {
  return `drv_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

function pricingView(q) {
  return {
    currency: q.currency,
    price: q.price,
    price_cents: q.price_cents,
    print_cost: q.print_cost,
    ship_cost: q.ship_cost,
    hst_handling: q.hst_handling,
    stripe_fee: q.stripe_fee,
    loaded: q.loaded,
    margin_amount: q.margin_amount,
    margin_pct: q.margin_pct,
  };
}

async function reserve(value, env, ctx = {}) {
  const taken = await handleTaken(value.handle, env, ctx.now ? new Date(ctx.now).getTime() : Date.now());
  if (taken) return { status: 409, json: { ok: false, message: 'That handle is already taken. Try another.' } };
  const priced = quote(value.kits);
  const now = ctx.now || new Date();
  const status = ctx.status || 'pending';
  const order = {
    id: newOrderId(),
    status,
    handle: value.handle,
    partner_type: value.partner_type,
    kits: value.kits,
    name: value.name,
    email: value.email,
    phone: value.phone,
    ship: value.ship,
    pricing: pricingView(priced),
    pieces: [],
    fulfilment: null,
    partner_slug: null,
    stripe_session_id: null,
    created_at: now.toISOString(),
    hold_until: status === 'awaiting payment' ? null : new Date(now.getTime() + HOLD_MS).toISOString(),
    paid_at: null,
    channel: status === 'awaiting payment' ? 'manual' : 'checkout',
  };
  try {
    await putJson(handlePath(order.handle), { handle: order.handle, order_id: order.id, status, hold_until: order.hold_until }, env, false);
  } catch (err) {
    if (/already exists|overwrite/i.test(String(err && err.message))) return { status: 409, json: { ok: false, message: 'That handle is already taken. Try another.' } };
    throw err;
  }
  await putJson(orderPath(order.id), order, env, false);
  return { status: 200, order };
}

function productName(order) {
  return order.kits.includes('exterior') ? 'Calm Joints rideshare kit + exterior decals' : 'Calm Joints rideshare in-car kit';
}

function stripeClient(env, ctx) {
  if (ctx.stripe) return ctx.stripe;
  const Stripe = require('stripe');
  return new Stripe(String(env.STRIPE_SECRET_KEY).trim(), { apiVersion: '2026-09-30.endive' });
}

async function createCheckout(body, env, ctx = {}) {
  if (rejectsCard(body)) return { status: 400, json: { ok: false, message: 'Card numbers are not accepted on this form.' } };
  if (!live(env)) {
    return { status: 403, json: { ok: false, live: false, message: 'Ordering is closed.' } };
  }
  const missing = stripeMissing(env);
  if (missing.length) {
    return { status: 503, json: { ok: false, message: 'Checkout is not configured.', missing } };
  }
  const mode = stripeMode(env);
  if (mode === 'live' && String(env.CJ_DRIVE_ALLOW_LIVE_STRIPE || '').trim() !== 'true') {
    return { status: 503, json: { ok: false, message: 'Live Stripe keys are blocked until CJ_DRIVE_ALLOW_LIVE_STRIPE is set.', stripe_mode: mode } };
  }
  if (mode !== 'test' && mode !== 'live') {
    return { status: 503, json: { ok: false, message: 'STRIPE_SECRET_KEY must be a test key (sk_test_ or rk_test_) or an explicitly allowed live key.', stripe_mode: mode } };
  }
  if (!ctx.skipRateLimit && !rateLimit(`drive:${ctx.ip || 'unknown'}`, { limit: 20 })) {
    return { status: 429, json: { ok: false, message: 'Easy there. Try again in a few minutes.' } };
  }
  if (!tok(env)) return { status: 503, json: { ok: false, message: 'Order storage is not ready.', missing: ['BLOB_READ_WRITE_TOKEN'] } };
  const parsed = validate(body || {});
  if (parsed.errors.length) return { status: 400, json: { ok: false, message: parsed.errors[0], errors: parsed.errors } };
  const reserved = await reserve(parsed.value, env, ctx);
  if (reserved.status !== 200) return reserved;
  const order = reserved.order;
  const origin = (ctx.origin || 'https://calmjoints.org').replace(/\/$/, '');
  const letters = crypto.randomBytes(6).toString('base64url').replace(/[^a-z]/gi, '').slice(0, 8).padEnd(8, 'a');
  try {
    const stripe = stripeClient(env, ctx);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: order.email,
      client_reference_id: order.id,
      metadata: { order_id: order.id, handle: order.handle },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'cad',
          unit_amount: order.pricing.price_cents,
          product_data: {
            name: productName(order),
            description: order.kits.includes('exterior')
              ? 'Headrest cards, seat-pocket card, two side decals, and a rear-windshield decal.'
              : 'Two headrest cards and one seat-pocket card.',
          },
        },
      }],
      success_url: `${origin}/drive?paid=1&order=${encodeURIComponent(order.id)}`,
      cancel_url: `${origin}/drive?canceled=1&order=${encodeURIComponent(order.id)}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      integration_identifier: `cjdrive${letters}`,
    }, { idempotencyKey: order.id });
    order.stripe_session_id = session.id;
    await putJson(orderPath(order.id), order, env, true);
    return { status: 200, json: { ok: true, url: session.url, order_id: order.id } };
  } catch (err) {
    await blob().del(handlePath(order.handle), { token: tok(env) }).catch(() => null);
    order.status = 'failed';
    order.error = 'stripe';
    await putJson(orderPath(order.id), order, env, true).catch(() => null);
    console.error('[drive] stripe session failed', err && err.message);
    return { status: 502, json: { ok: false, message: 'Checkout could not start. Nothing was charged.' } };
  }
}

function paymentLinkFor(order, env) {
  const raw = order.kits.includes('exterior') ? env.STRIPE_PAYMENT_LINK_FULL : env.STRIPE_PAYMENT_LINK_INCAR;
  const base = String(raw || '').trim();
  if (!base) return null;
  let url;
  try { url = new URL(base); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'buy.stripe.com') return null;
  url.searchParams.set('prefilled_email', order.email);
  url.searchParams.set('client_reference_id', order.id);
  return url.toString();
}

async function createManualOrder(body, env, ctx = {}) {
  if (rejectsCard(body)) return { status: 400, json: { ok: false, message: 'Card numbers are not accepted on this form.' } };
  if (driveMode(env) !== 'manual') return { status: 403, json: { ok: false, live: false, mode: driveMode(env), message: 'Ordering is closed.' } };
  if (!ctx.skipRateLimit && !rateLimit(`drive:${ctx.ip || 'unknown'}`, { limit: 20 })) {
    return { status: 429, json: { ok: false, message: 'Easy there. Try again in a few minutes.' } };
  }
  if (!tok(env)) return { status: 503, json: { ok: false, message: 'Order storage is not ready.', missing: ['BLOB_READ_WRITE_TOKEN'] } };
  const parsed = validate(body || {});
  if (parsed.errors.length) return { status: 400, json: { ok: false, message: parsed.errors[0], errors: parsed.errors } };
  const reserved = await reserve(parsed.value, env, { ...ctx, status: 'awaiting payment' });
  if (reserved.status !== 200) return reserved;
  const order = reserved.order;
  const fetchImpl = ctx.fetchImpl || fetch;
  const origin = (ctx.origin || 'https://calmjoints.org').replace(/\/$/, '');
  const link = paymentLinkFor(order, env);
  const team = String(env.CJ_ALERT_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ship = [order.ship.line1, order.ship.line2, `${order.ship.city} ${order.ship.province} ${order.ship.postal}`, 'Canada'].filter(Boolean).join(', ');
  const price = `$${Number(order.pricing.price).toFixed(2)} CAD`;
  const teamMail = mailShell(`Drive kit awaiting payment: /${order.handle}`, [
    `${order.name} requested ${productName(order)} (${price}). Status: awaiting payment.`,
    `Ship to ${ship}. Phone ${order.phone}. Email ${order.email}.`,
    `Handle /${order.handle}. Order ${order.id}.`,
    PAY_CONFIRM,
  ], [{ label: 'Open the queue', url: `${origin}/admin/decals` }]);
  const who = mailShell('We have your Calm Joints kit order', [
    `Hi ${order.name.split(' ')[0] || 'there'},`,
    PAY_CONFIRM,
    `${productName(order)} is ${price}. Your code will be calmjoints.org/${order.handle}.`,
  ], link ? [{ label: 'Pay securely', url: link }] : []);
  await Promise.all([
    sendMail(team, teamMail, env, fetchImpl),
    sendMail([order.email], who, env, fetchImpl),
  ]);
  order.confirmation_sent_at = new Date().toISOString();
  await saveOrder(order, env);
  return {
    status: 200,
    json: {
      ok: true,
      order_id: order.id,
      status: 'awaiting payment',
      message: PAY_CONFIRM,
      url: link,
    },
  };
}

function originFrom(req) {
  const host = req && (req.headers['x-forwarded-host'] || req.headers.host);
  if (!host) return 'https://calmjoints.org';
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${String(host).split(',')[0].trim()}`;
}

async function readOrder(id, env) {
  if (!/^drv_[a-z0-9_]+$/i.test(String(id || ''))) return null;
  return readJson(orderPath(id), env);
}

function rank(status) {
  return { failed: 0, pending: 0, paid: 1, queued: 2, draft: 2, submitted: 2, ordered: 3, processing: 3, shipped: 4 }[status] || 0;
}

async function saveOrder(order, env) {
  order.updated_at = new Date().toISOString();
  await putJson(orderPath(order.id), order, env, true);
  return order;
}

function mailShell(subject, lines, links) {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const body = lines.map((l) => `<p style="margin:8px 0;color:#0B1D16">${esc(l)}</p>`).join('');
  const extras = (links || []).map((l) => `<p style="margin:8px 0"><a href="${esc(l.url)}">${esc(l.label)}</a></p>`).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;max-width:560px">${body}${extras}</div>`;
  const text = `${subject}\n\n${lines.join('\n\n')}${(links || []).map((l) => `\n${l.label}: ${l.url}`).join('')}`;
  return { subject, html, text };
}

async function sendMail(to, mail, env, fetchImpl) {
  const key = (env.CJ_RESEND_API_KEY || '').trim();
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!key || !list.length) return { ok: false, skipped: true };
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: (env.CJ_PARTNER_FROM || env.CJ_ALERT_FROM || 'Calm Joints <alerts@scalehealth.ca>').trim(),
        to: list,
        reply_to: 'info@calmjoints.org',
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error('[drive] mail failed', err && err.message);
    return { ok: false };
  }
}

async function attachArtwork(order, env, ctx) {
  const origin = ctx.origin || 'https://calmjoints.org';
  const rendered = await renderOrder(order, ctx);
  order.pieces = [];
  for (const piece of rendered) {
    const pathname = artworkPath(order.id, piece.id);
    await blob().put(pathname, piece.pdf, {
      access: 'private', contentType: 'application/pdf', addRandomSuffix: false, allowOverwrite: true, token: tok(env),
    });
    order.pieces.push({
      id: piece.id,
      kit: piece.kit,
      name: piece.name,
      copies: piece.copies,
      width_in: piece.width_in,
      height_in: piece.height_in,
      qr_in: piece.qr_in,
      pdf_path: pathname,
      printful_env: piece.printful_env,
      artwork_url: publicArtLink(origin, order.id, piece.id, env),
    });
  }
}

async function fulfilPaid(session, env, ctx = {}) {
  const orderId = (session.metadata && session.metadata.order_id) || session.client_reference_id;
  const order = await readOrder(orderId, env);
  if (!order) return { ok: false, missing: true };
  if (order.partner_slug && order.emailed_at && order.fulfilment && order.fulfilment.status && order.fulfilment.status !== 'failed') {
    return { ok: true, duplicate: true, order };
  }
  const fetchImpl = ctx.fetchImpl || fetch;
  if (!order.partner_slug) {
    const created = await createDrivePartner({
      partner_type: order.partner_type,
      alias: order.handle,
      name: order.name,
      email: order.email,
      phone: order.phone,
    }, env, ctx);
    if (created.status === 409) {
      const existing = await getPartner(`drv-${order.handle}`, env);
      const same = existing && existing.contact && existing.contact.email === order.email;
      if (!same) {
        order.status = 'failed';
        order.error = created.json && created.json.message;
        await saveOrder(order, env);
        return { ok: false, order, error: order.error };
      }
      order.partner_slug = existing.slug;
      order.partner = existing;
    } else if (created.status !== 200) {
      order.status = 'failed';
      order.error = created.json && created.json.message;
      await saveOrder(order, env);
      return { ok: false, order, error: order.error };
    } else {
      order.partner_slug = created.json.partner.slug;
      order.partner = created.json.partner;
      order.friday = created.json.friday;
    }
    await saveOrder(order, env);
  }
  if (!order.pieces || !order.pieces.length) await attachArtwork(order, env, ctx);
  if (!order.paid_at) order.paid_at = new Date().toISOString();
  order.status = 'paid';
  order.stripe_session_id = session.id || order.stripe_session_id;
  await putJson(handlePath(order.handle), { handle: order.handle, order_id: order.id, status: 'paid', slug: order.partner_slug }, env, true);

  if (!order.fulfilment || order.fulfilment.status === 'failed' || !order.fulfilment.status) {
    const adapter = selectAdapter(env, order);
    const result = await adapter.submit(order, env, { fetchImpl });
    order.fulfilment = {
      adapter: adapter.id,
      automated: Boolean(adapter.automated && result.ok),
      status: result.status,
      external_id: result.external_id || null,
      tracking: result.tracking || null,
      error: result.error || null,
      note: result.note || null,
      at: new Date().toISOString(),
    };
    order.status = result.status || order.status;
  }
  await saveOrder(order, env);

  if (!order.emailed_at) {
    const origin = ctx.origin || 'https://calmjoints.org';
    const partner = order.partner || { slug: order.partner_slug, alias: order.handle, contact: { name: order.name, email: order.email }, terms: {} };
    const token = L.makeToken(order.partner_slug, env);
    const dash = `${origin}/me/${order.handle}?t=${encodeURIComponent(token)}`;
    const artLinks = order.pieces.map((p) => ({ label: `${p.name} PDF (${p.copies})`, url: p.artwork_url || `${origin}/admin/decals` }));
    const team = String(env.CJ_ALERT_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const ship = [order.ship.line1, order.ship.line2, `${order.ship.city} ${order.ship.province} ${order.ship.postal}`, 'Canada'].filter(Boolean).join(', ');
    const margin = order.pricing;
    const teamMail = mailShell(`Drive kit paid: /${order.handle}`, [
      `${order.name} paid $${Number(margin.price).toFixed(2)} CAD for ${productName(order)}.`,
      `Ship to ${ship}. Phone ${order.phone}. Email ${order.email}.`,
      `Partner ${order.partner_slug}. Code ${decalUrl(order.handle)}.`,
      `Margin $${Number(margin.margin_amount).toFixed(2)} on print $${Number(margin.print_cost).toFixed(2)} + ship $${Number(margin.ship_cost).toFixed(2)} + Stripe $${Number(margin.stripe_fee).toFixed(2)} + HST handling $${Number(margin.hst_handling).toFixed(2)}.`,
      order.fulfilment.adapter === 'manual'
        ? 'Printer: manual queue. Vistaprint has no ordering API. Download the PDFs and place the order by hand.'
        : `Printer: ${order.fulfilment.adapter} (${order.fulfilment.status}${order.fulfilment.external_id ? ` ${order.fulfilment.external_id}` : ''}).`,
      order.fulfilment.error ? `Printer error: ${order.fulfilment.error}` : '',
    ].filter(Boolean), artLinks.concat([{ label: 'Open the queue', url: `${origin}/admin/decals` }]));
    const share = (order.partner && order.partner.terms && order.partner.terms.share) || '';
    const pending = order.partner && order.partner.terms && order.partner.terms.pending_randy;
    const who = mailShell('Your Calm Joints code is ready', [
      `Hi ${order.name.split(' ')[0] || 'there'},`,
      `Your code is ${decalUrl(order.handle)}. Scans and bookings through it are tracked to you.`,
      share ? `Your share is ${share}.${pending ? ' PENDING RANDY DECISION: that 10% figure is not final.' : ''}` : '',
      'Commission is paid monthly once $500 is owed. Smaller balances carry forward.',
      'Your kit goes to print from the address you gave us. We never ask for bank details by email.',
    ].filter(Boolean), [{ label: 'Open my dashboard', url: dash }]);
    await Promise.all([
      sendMail(team, teamMail, env, fetchImpl),
      sendMail([order.email], who, env, fetchImpl),
    ]);
    order.emailed_at = new Date().toISOString();
    order.dashboard_path = `/me/${order.handle}`;
    await saveOrder(order, env);
  }
  return { ok: true, order };
}

async function markFailed(session, env) {
  const orderId = (session.metadata && session.metadata.order_id) || session.client_reference_id;
  const order = await readOrder(orderId, env);
  if (!order || order.partner_slug || order.status === 'shipped') return { ok: true };
  order.status = 'failed';
  order.error = 'payment_failed';
  await saveOrder(order, env);
  const hold = await readJson(handlePath(order.handle), env);
  if (hold && hold.order_id === order.id && hold.status === 'pending') {
    await blob().del(handlePath(order.handle), { token: tok(env) }).catch(() => null);
  }
  return { ok: true, order };
}

async function handleStripeEvent(event, env, ctx = {}) {
  const session = (event && event.data && event.data.object) || {};
  if (event.type === 'checkout.session.completed') {
    if (session.payment_status !== 'paid') return { status: 200, json: { ok: true, fulfilled: false } };
    const out = await fulfilPaid(session, env, ctx);
    if (!out.ok && !out.missing) return { status: 500, json: { ok: false, message: out.error || 'Fulfilment failed.' } };
    return { status: 200, json: { ok: true, duplicate: Boolean(out.duplicate), missing: Boolean(out.missing) } };
  }
  if (event.type === 'checkout.session.async_payment_succeeded') {
    if (session.payment_status && session.payment_status !== 'paid') return { status: 200, json: { ok: true, fulfilled: false } };
    const out = await fulfilPaid(session, env, ctx);
    if (!out.ok && !out.missing) return { status: 500, json: { ok: false, message: out.error || 'Fulfilment failed.' } };
    return { status: 200, json: { ok: true, duplicate: Boolean(out.duplicate) } };
  }
  if (event.type === 'checkout.session.async_payment_failed') {
    await markFailed(session, env);
    return { status: 200, json: { ok: true } };
  }
  if (event.type === 'checkout.session.expired') {
    await releaseExpired(session, env);
    return { status: 200, json: { ok: true } };
  }
  return { status: 200, json: { ok: true, ignored: true } };
}

async function releaseExpired(session, env) {
  const orderId = (session.metadata && session.metadata.order_id) || session.client_reference_id;
  const order = await readOrder(orderId, env);
  if (!order || order.status !== 'pending') return { ok: true };
  order.status = 'expired';
  await saveOrder(order, env);
  const hold = await readJson(handlePath(order.handle), env);
  if (hold && hold.order_id === order.id && hold.status === 'pending') {
    await blob().del(handlePath(order.handle), { token: tok(env) }).catch(() => null);
  }
  return { ok: true, order };
}

async function listOrders(env) {
  const blobs = await L.listAll('drive-orders/', env);
  const orders = [];
  for (const b of blobs) {
    if (!String(b.pathname).endsWith('/order.json')) continue;
    const order = await readJson(b.pathname, env);
    if (order && (order.paid_at || order.status === 'awaiting payment')) orders.push(order);
  }
  orders.sort((a, b) => {
    const waiting = (x) => (x.status === 'awaiting payment' ? 1 : 0);
    if (waiting(a) !== waiting(b)) return waiting(b) - waiting(a);
    const ta = a.paid_at || a.created_at || '';
    const tb = b.paid_at || b.created_at || '';
    return ta < tb ? 1 : -1;
  });
  return orders.map(publicOrder);
}

function publicOrder(order) {
  const p = order.pricing || {};
  return {
    id: order.id,
    status: order.status,
    channel: order.channel || null,
    created_at: order.created_at,
    handle: order.handle,
    partner_slug: order.partner_slug,
    partner_type: order.partner_type,
    name: order.name,
    email: order.email,
    phone: order.phone,
    ship: order.ship,
    kits: order.kits,
    decal_url: decalUrl(order.handle),
    paid_at: order.paid_at,
    price: p.price,
    print_cost: p.print_cost,
    ship_cost: p.ship_cost,
    hst_handling: p.hst_handling,
    stripe_fee: p.stripe_fee,
    loaded: p.loaded,
    margin_amount: p.margin_amount,
    margin_pct: p.margin_pct,
    currency: p.currency || 'CAD',
    pieces: (order.pieces || []).map((piece) => ({
      id: piece.id, name: piece.name, copies: piece.copies, qr_in: piece.qr_in, width_in: piece.width_in, height_in: piece.height_in, artwork_url: piece.artwork_url || null,
    })),
    fulfilment: order.fulfilment || null,
  };
}

async function markPaid(id, env, ctx = {}) {
  const order = await readOrder(id, env);
  if (!order) return { status: 404, json: { ok: false, message: 'No order with that id.' } };
  if (order.paid_at && order.partner_slug) return { status: 200, json: { ok: true, duplicate: true, order: publicOrder(order) } };
  if (order.status !== 'awaiting payment') return { status: 409, json: { ok: false, message: 'That order is not awaiting payment.' } };
  const out = await fulfilPaid({
    id: `manual_${order.id}`,
    payment_status: 'paid',
    metadata: { order_id: order.id },
    client_reference_id: order.id,
  }, env, ctx);
  if (!out.ok) return { status: 500, json: { ok: false, message: out.error || 'Could not mark that order paid.' } };
  return { status: 200, json: { ok: true, order: publicOrder(out.order) } };
}

async function markOrdered(id, body, env) {
  const order = await readOrder(id, env);
  if (!order || !order.paid_at) return { status: 404, json: { ok: false, message: 'No paid order with that id.' } };
  const tracking = clean(body.tracking, 80);
  const next = tracking ? 'shipped' : 'ordered';
  if (rank(next) < rank(order.fulfilment && order.fulfilment.status)) {
    return { status: 409, json: { ok: false, message: 'That order is already further along.' } };
  }
  order.fulfilment = {
    ...(order.fulfilment || { adapter: 'manual' }),
    status: next,
    tracking: tracking || (order.fulfilment && order.fulfilment.tracking) || null,
    ordered_at: (order.fulfilment && order.fulfilment.ordered_at) || new Date().toISOString(),
    note: order.fulfilment && order.fulfilment.adapter === 'manual' ? 'Marked ordered by hand.' : (order.fulfilment && order.fulfilment.note),
  };
  order.status = next;
  await saveOrder(order, env);
  return { status: 200, json: { ok: true, order: publicOrder(order) } };
}

async function applyPrinterStatus(orderId, patch, env) {
  const order = await readOrder(orderId, env);
  if (!order) return null;
  const next = String(patch.status || '').toLowerCase();
  if (!['processing', 'shipped'].includes(next)) return order;
  const current = order.fulfilment && order.fulfilment.status;
  if (rank(next) < rank(current)) return order;
  order.fulfilment = {
    ...(order.fulfilment || {}),
    status: next,
    tracking: patch.tracking || (order.fulfilment && order.fulfilment.tracking) || null,
    carrier: patch.carrier || (order.fulfilment && order.fulfilment.carrier) || null,
    updated_at: new Date().toISOString(),
  };
  order.status = next;
  await saveOrder(order, env);
  return order;
}

function artAuthed(query, env, admin) {
  if (admin) return true;
  const exp = Number(query.exp);
  const piece = String(query.piece || '');
  const orderId = String(query.order || '');
  const sig = String(query.sig || '');
  if (!exp || exp * 1000 < Date.now()) return false;
  const want = artSig(orderId, piece, exp, env);
  if (!want || want.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

async function readArtwork(orderId, pieceId, env) {
  const order = await readOrder(orderId, env);
  if (!order) return null;
  const piece = (order.pieces || []).find((p) => p.id === pieceId);
  if (!piece || !piece.pdf_path) return null;
  const out = await blob().get(piece.pdf_path, { access: 'private', token: tok(env) });
  if (!out || !out.stream) return null;
  const buf = Buffer.from(await new Response(out.stream).arrayBuffer());
  return { order, piece, buf };
}

function secretMatch(given, expected) {
  if (!given || !expected) return false;
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

async function rawBuffer(req) {
  if (req && Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (req && typeof req.rawBody === 'string') return Buffer.from(req.rawBody);
  if (req && Buffer.isBuffer(req.body)) return req.body;
  if (req && typeof req.body === 'string') return Buffer.from(req.body);
  return Buffer.from(await readRaw(req));
}

function printerAuthed(req, raw, env, secretName, headerName) {
  const secret = String(env[secretName] || '').trim();
  if (!secret) return { ok: false, status: 503, json: { ok: false, message: 'Printer status webhook is not configured.', missing: [secretName] } };
  const bearer = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '').trim();
  const sig = String((req.headers && (req.headers[headerName] || req.headers[String(headerName).toLowerCase()])) || '');
  if (bearer && secretMatch(bearer, secret)) return { ok: true };
  if (sig) {
    const want = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const got = sig.replace(/^sha256=/i, '').trim();
    if (got && secretMatch(got, want)) return { ok: true };
  }
  return { ok: false, status: 401, json: { ok: false, message: 'Wrong signature.' } };
}

function adminAuthed(req, env) {
  const key = (env.CJ_ADMIN_KEY || '').trim();
  const h = String((req.headers && (req.headers.authorization || req.headers['x-cj-admin-key'])) || '').replace(/^Bearer\s+/i, '').trim();
  if (!key || !h) return false;
  const a = crypto.createHash('sha256').update(h).digest();
  const b = crypto.createHash('sha256').update(key).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  STRIPE_ENV,
  KITS,
  catalog,
  quote,
  validate,
  handleTaken,
  live,
  driveMode,
  PAY_CONFIRM,
  rejectsCard,
  paymentLinkFor,
  stripeMissing,
  stripeMode,
  createCheckout,
  createManualOrder,
  fulfilPaid,
  handleStripeEvent,
  markFailed,
  releaseExpired,
  listOrders,
  markPaid,
  markOrdered,
  applyPrinterStatus,
  readOrder,
  readArtwork,
  artAuthed,
  adminAuthed,
  printerAuthed,
  rawBuffer,
  secretMatch,
  adapterReport,
  originFrom,
  clientIp,
  publicArtLink,
  decalUrl,
  round2,
};
