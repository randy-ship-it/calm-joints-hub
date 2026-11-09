'use strict';

const crypto = require('crypto');

const SHEET_ID = '14r3prMc1VYotjJjz43iz_Q0GpQf_T_WJfkruBGIMNxY';
const SHEET_TITLE = 'CJ Squash Wishlist → Scale Cart Handoff (PRIVATE)';
const HUB = 'https://www.scalehealth.ca/calmjoints?src=cjsite&place=home';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const WISHLIST_HEADERS = [
  'wishlist_id', 'submitted_at', 'customer_email', 'code_eligible', 'code_program', 'hub_target',
  'currency', 'retail_subtotal_cents', 'line_count', 'processing_status', 'cart_ready',
  'scale_account_status', 'scale_import_status', 'scale_import_result', 'scale_import_error',
  'scale_imported_at', 'last_error_at', 'notes', 'source_blob_ref', 'created_at', 'updated_at',
];
const LINE_HEADERS = [
  'line_id', 'wishlist_id', 'cj_product_id', 'cj_product_name', 'cj_variant_id', 'cj_variant_name',
  'quantity', 'retail_currency', 'retail_unit_price_cents', 'retail_line_total_cents',
  'wholesale_rate_label', 'wholesale_unit_price_cents', 'scale_product_id', 'scale_variant_id',
  'scale_mapping_status', 'mapping_verified_at', 'processing_status', 'cart_ready',
  'scale_import_status', 'scale_import_result', 'scale_import_error', 'scale_imported_at',
  'last_error_at', 'notes', 'created_at', 'updated_at',
];

function sheetId(env) {
  return String((env && env.CJ_WISHLIST_SHEET_ID) || '').trim();
}

function clientEmail(env) {
  return String((env && env.CJ_WISHLIST_SHEET_CLIENT_EMAIL) || '').trim();
}

function privateKey(env) {
  let key = String((env && env.CJ_WISHLIST_SHEET_PRIVATE_KEY) || '').trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  return key.replace(/\\n/g, '\n');
}

function wiring(env) {
  const missing = [];
  if (!sheetId(env)) missing.push('CJ_WISHLIST_SHEET_ID');
  if (!clientEmail(env)) missing.push('CJ_WISHLIST_SHEET_CLIENT_EMAIL');
  if (!privateKey(env).includes('BEGIN PRIVATE KEY')) missing.push('CJ_WISHLIST_SHEET_PRIVATE_KEY');
  const id = sheetId(env);
  const wrongSheet = Boolean(id) && id !== SHEET_ID;
  return {
    active: missing.length === 0 && !wrongSheet,
    destination_recorded: true,
    sheet_title: SHEET_TITLE,
    sheet_id: SHEET_ID,
    headers_contract: 'read 2026-11-08',
    headers_verified_live: false,
    missing,
    wrong_sheet: wrongSheet,
    blocker: missing.length
      ? 'Sheet sink is off. No server credential is configured, so this sheet is not being written.'
      : (wrongSheet ? 'Sheet sink is off. CJ_WISHLIST_SHEET_ID is not the private handoff sheet.' : ''),
  };
}

function cell(value) {
  const text = value == null ? '' : String(value);
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

function lineId(wishlistId, productId) {
  return wishlistId + ':' + productId;
}

function moneySummary(lines) {
  const currencies = [...new Set(lines.map((line) => line.retail_currency))];
  if (currencies.length !== 1) return { currency: 'mixed', retail_subtotal_cents: '' };
  const total = lines.reduce((sum, line) => sum + (Number(line.retail_amount_cents) || 0) * (Number(line.quantity) || 0), 0);
  return { currency: currencies[0], retail_subtotal_cents: String(total) };
}

function wishlistRow(record, now) {
  const summary = moneySummary(record.lines || []);
  return [
    record.id,
    record.created_at,
    record.email,
    'true',
    'squash-insider',
    HUB,
    summary.currency,
    summary.retail_subtotal_cents,
    String((record.lines || []).length),
    'queued_not_cart_ready',
    'false',
    '', '', '', '', '', '',
    'Sport: ' + (record.sport || 'squash') + '. Eligible for the insider rate. No wholesale amount is set. Not an account or a cart.',
    'cj-wishlists/squash/' + record.id + '.json',
    record.created_at,
    now,
  ].map(cell);
}

function lineRow(record, line, now) {
  const qty = Number(line.quantity) || 0;
  const unit = Number(line.retail_amount_cents) || 0;
  return [
    lineId(record.id, line.product_id),
    record.id,
    line.product_id,
    line.name,
    '',
    line.variant_status === 'unspecified' ? (line.variant_note || 'unspecified') : (line.variant_note || ''),
    String(qty),
    line.retail_currency,
    String(unit),
    String(unit * qty),
    'unconfirmed',
    '',
    '', '',
    'unmapped',
    '',
    'queued_not_cart_ready',
    'false',
    '', '', '', '', '',
    'Retail reference only.',
    record.created_at,
    now,
  ].map(cell);
}

function sameHeaders(actual, expected) {
  const row = (actual && actual[0]) || [];
  if (row.length !== expected.length) return false;
  return expected.every((name, index) => String(row[index] || '').trim() === name);
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: clientEmail(env),
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claim);
  const signature = signer.sign(privateKey(env)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return header + '.' + claim + '.' + signature;
}

async function accessToken(env, fetchImpl) {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signJwt(env),
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json && json.access_token ? json.access_token : null;
}

function sheetsUrl(range, query) {
  const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/' + encodeURIComponent(range);
  return query ? base + '?' + query : base;
}

async function readRange(token, range, fetchImpl) {
  const res = await fetchImpl(sheetsUrl(range), { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) return { ok: false };
  const json = await res.json();
  return { ok: true, values: json.values || [] };
}

async function writeRange(token, range, values, fetchImpl) {
  const res = await fetchImpl(sheetsUrl(range, 'valueInputOption=RAW'), {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  return res.ok;
}

async function appendRows(token, range, values, fetchImpl) {
  const res = await fetchImpl(sheetsUrl(range) + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  return res.ok;
}

async function upsert(token, tab, idColumnValues, rowsById, width, fetchImpl) {
  const existing = new Map();
  idColumnValues.forEach((row, index) => {
    const id = row && row[0] ? String(row[0]) : '';
    if (index === 0 || !id) return;
    if (!existing.has(id)) existing.set(id, index + 1);
  });
  const append = [];
  for (const [id, row] of rowsById) {
    const at = existing.get(id);
    if (at) {
      const wrote = await writeRange(token, tab + '!A' + at + ':' + columnName(width) + at, [row], fetchImpl);
      if (!wrote) return false;
    } else {
      append.push(row);
    }
  }
  if (!append.length) return true;
  return appendRows(token, tab + '!A1', append, fetchImpl);
}

function columnName(width) {
  let n = width;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

async function syncWishlist(env, record, fetchImpl) {
  const state = wiring(env);
  if (!state.active) return { ok: false, status: 'unconfigured', error: state.blocker };
  const fetchFn = fetchImpl || global.fetch;
  try {
    const token = await accessToken(env, fetchFn);
    if (!token) return { ok: false, status: 'failed', error: 'Google token was not issued.' };
    const wishHead = await readRange(token, 'wishlists!1:1', fetchFn);
    const lineHead = await readRange(token, 'lines!1:1', fetchFn);
    if (!wishHead.ok || !lineHead.ok) return { ok: false, status: 'failed', error: 'Sheet headers could not be read.' };
    if (!sameHeaders(wishHead.values, WISHLIST_HEADERS) || !sameHeaders(lineHead.values, LINE_HEADERS)) {
      return { ok: false, status: 'header_mismatch', error: 'Sheet headers do not match the 2026-11-08 contract. Nothing was written.' };
    }
    const now = new Date().toISOString();
    const wishIds = await readRange(token, 'wishlists!A:A', fetchFn);
    const lineIds = await readRange(token, 'lines!A:A', fetchFn);
    if (!wishIds.ok || !lineIds.ok) return { ok: false, status: 'failed', error: 'Sheet ids could not be read.' };
    const wishOk = await upsert(token, 'wishlists', wishIds.values, new Map([[record.id, wishlistRow(record, now)]]), WISHLIST_HEADERS.length, fetchFn);
    const lineMap = new Map((record.lines || []).map((line) => [lineId(record.id, line.product_id), lineRow(record, line, now)]));
    const lineOk = wishOk && await upsert(token, 'lines', lineIds.values, lineMap, LINE_HEADERS.length, fetchFn);
    if (!wishOk || !lineOk) return { ok: false, status: 'failed', error: 'Sheet update did not complete.' };
    return { ok: true, status: 'synced', error: '' };
  } catch (err) {
    console.error('[wishlist] sheet sync failed', err && err.message);
    return { ok: false, status: 'failed', error: 'Sheet update failed.' };
  }
}

module.exports = {
  SHEET_ID,
  WISHLIST_HEADERS,
  LINE_HEADERS,
  wiring,
  cell,
  lineId,
  wishlistRow,
  lineRow,
  sameHeaders,
  syncWishlist,
};
