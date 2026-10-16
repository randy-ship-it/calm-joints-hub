// Renders the QR for one doctor clinic code. The code is an internal analytics tag only.
const QRCode = require('qrcode');
const { clinicQrUrl } = require('../lib/intake');

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'https://calmjoints.org');
  const code = String(url.searchParams.get('c') || '');
  if (!/^dc-[a-z0-9-]{1,24}-[a-f0-9]{6}$/.test(code)) {
    res.statusCode = 400; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('Unknown clinic code.'); return;
  }
  const svg = await QRCode.toString(clinicQrUrl(code), { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0B1D16', light: '#FFFFFF' } });
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(svg);
};
