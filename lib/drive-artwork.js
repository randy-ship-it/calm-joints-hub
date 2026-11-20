'use strict';
// Print-ready PDFs at exact trim size (vector QR, embedded logo).
// Page size is the trim size. POD printers scale the file to the blank, so crop marks stay off the page.
// qr_in is the full printed symbol, quiet zone included, and must stay >= qr_min_in.

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const KITS = require('../config/drive-kits');

const LOGO_PATH = path.join(__dirname, '..', 'media', 'calm-joints-signature-logo.png');
const INK = rgb(0x0b / 255, 0x1d / 255, 0x16 / 255);
const GREEN = rgb(0x15 / 255, 0x80 / 255, 0x3d / 255);
const QUIET = 4;

function codeUrl(handle, src) {
  const track = src === 'hanger' ? 'hanger' : 'decal';
  return `https://calmjoints.org/${handle}?src=${track}`;
}

function decalUrl(handle) {
  return codeUrl(handle, 'decal');
}

function piecesFor(kitIds) {
  const list = kitIds || [];
  const ids = list.includes('hanger') && !list.includes('incar')
    ? ['hanger']
    : ['incar'].concat(list.includes('exterior') ? ['exterior'] : []);
  const pieces = [];
  for (const id of ids) {
    for (const piece of KITS.kits[id].pieces) pieces.push({ ...piece, kit: id, src: piece.src || 'decal' });
  }
  return pieces;
}

function drawQr(page, url, cx, cy, sizePt) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const total = n + QUIET * 2;
  const mod = sizePt / total;
  const left = cx - sizePt / 2;
  const bottom = cy - sizePt / 2;
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (!qr.modules.get(r, c)) continue;
      const x = left + (c + QUIET) * mod;
      const y = bottom + (n - 1 - r + QUIET) * mod;
      page.drawRectangle({ x, y, width: mod + 0.35, height: mod + 0.35, color: INK });
    }
  }
  return sizePt / 72;
}

async function loadLogo(override) {
  if (override) return override;
  return fs.readFileSync(LOGO_PATH);
}

function drawFace(page, spec, ctx, assets, face) {
  const { w, h, font, bold, logo } = assets;
  const url = codeUrl(ctx.handle, spec.src || 'decal');
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });

  const margin = 0.18 * 72;
  const hook = (Number(spec.hook_in) || 0) * 72;
  const logoH = Math.min(0.36 * 72, h * 0.09);
  const logoW = Math.min(logoH * (logo.width / logo.height), w - margin * 2);
  const logoX = (w - logoW) / 2;
  const logoY = h - Math.max(margin, hook) - logoH;
  page.drawImage(logo, { x: logoX, y: logoY, width: logoW, height: logoH });
  page.drawRectangle({ x: w * 0.28, y: logoY - 8, width: w * 0.44, height: 2, color: GREEN });

  const host = `calmjoints.org/${ctx.handle}`;
  const urlSize = spec.width_in >= 7 ? 14 : (spec.width_in <= 4 ? 8 : 9);
  const urlW = bold.widthOfTextAtSize(host, urlSize);
  const urlY = margin;
  page.drawText(host, { x: (w - urlW) / 2, y: urlY, size: urlSize, font: bold, color: INK });

  const topLimit = logoY - 12;
  const bottomLimit = urlY + urlSize + 14;
  const avail = topLimit - bottomLimit;
  const target = spec.qr_in * 72;
  const sizePt = Math.min(target, avail, w - margin * 2);
  const drawnIn = drawQr(page, url, w / 2, bottomLimit + avail / 2, sizePt);
  const min = spec.qr_min_in || 0;
  if (min && drawnIn + 0.01 < min) {
    throw new Error(`${spec.id} QR is ${drawnIn.toFixed(2)}in, under the ${min}in minimum.`);
  }

  const label = spec.id === 'rear' ? 'Rear windshield' : spec.id === 'side' ? 'Side' : (face || '');
  if (label) {
    const lw = font.widthOfTextAtSize(label, 7);
    page.drawText(label, { x: (w - lw) / 2, y: urlY + urlSize + 3, size: 7, font, color: GREEN });
  }
  return drawnIn;
}

async function renderPiece(spec, ctx) {
  const w = spec.width_in * 72;
  const h = spec.height_in * 72;
  const doc = await PDFDocument.create();
  const url = codeUrl(ctx.handle, spec.src || 'decal');
  doc.setTitle(`Calm Joints ${spec.name}`);
  doc.setAuthor('Calm Joints');
  doc.setSubject(`${url} ${spec.width_in}x${spec.height_in}in`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(await loadLogo(ctx.logo));
  const sides = Math.max(1, Number(spec.sides) || 1);
  const assets = { w, h, font, bold, logo };
  let drawnIn = 0;
  for (let i = 0; i < sides; i += 1) {
    const page = doc.addPage([w, h]);
    const face = sides > 1 ? (i === 0 ? 'Front' : 'Back') : '';
    drawnIn = drawFace(page, spec, ctx, assets, face);
  }
  return { pdf: Buffer.from(await doc.save()), qr_in: Math.round(drawnIn * 100) / 100, sides, url };
}

async function renderOrder(order, ctx = {}) {
  const pieces = piecesFor(order.kits);
  const out = [];
  for (const spec of pieces) {
    const rendered = await renderPiece(spec, { handle: order.handle, logo: ctx.logo });
    out.push({
      id: spec.id,
      kit: spec.kit,
      name: spec.name,
      copies: spec.copies,
      width_in: spec.width_in,
      height_in: spec.height_in,
      qr_in: rendered.qr_in,
      qr_min_in: spec.qr_min_in || null,
      sides: rendered.sides,
      src: spec.src || 'decal',
      url: rendered.url,
      printful_env: spec.printful_env,
      printful_fit: spec.printful_fit,
      pdf: rendered.pdf,
    });
  }
  return out;
}

module.exports = { codeUrl, decalUrl, piecesFor, renderPiece, renderOrder, LOGO_PATH };
