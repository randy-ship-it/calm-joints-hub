const http = require('http');
const fs = require('fs');
const path = require('path');
const newsletter = require('../api/newsletter');
const apply = require('../api/apply');
const question = require('../api/question');
const intake = require('../api/intake');
const careers = require('../api/careers');
const qrPartner = require('../api/qr-partner');
const qrLead = require('../api/qr-lead');
const partnerEvents = require('../api/partner-events');
const partnerPortal = require('../api/partner-portal');
const adminPartner = require('../api/admin-partner');
const aliasApi = require('../api/alias');
const driveCheckout = require('../api/drive-checkout');
const driveWebhook = require('../api/drive-webhook');
const driveArtwork = require('../api/drive-artwork');
const adminDecals = require('../api/admin-decals');
const cimpressWebhook = require('../api/cimpress-webhook');
const printfulWebhook = require('../api/printful-webhook');
const { aliasRedirect } = require('../lib/partner-alias');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/api/newsletter') return newsletter(req, res);
  if (url.pathname === '/api/apply') return apply(req, res);
  if (url.pathname === '/api/clinic') return require('../api/clinic')(req, res);
  if (url.pathname === '/api/clinic-qr') return require('../api/clinic-qr')(req, res);
  if (url.pathname === '/api/question') return question(req, res);
  if (url.pathname === '/api/intake') return intake(req, res);
  if (url.pathname === '/api/careers') return careers(req, res);
  if (url.pathname === '/api/qr-partner') return qrPartner(req, res);
  if (url.pathname === '/api/qr-lead') return qrLead(req, res);
  if (url.pathname === '/api/partner-events') return partnerEvents(req, res);
  if (url.pathname === '/api/partner-portal') return partnerPortal(req, res);
  if (url.pathname === '/api/admin-partner') return adminPartner(req, res);
  if (url.pathname === '/api/alias') return aliasApi(req, res);
  if (url.pathname === '/api/drive-checkout') return driveCheckout(req, res);
  if (url.pathname === '/api/drive-webhook') return driveWebhook(req, res);
  if (url.pathname === '/api/drive-artwork') return driveArtwork(req, res);
  if (url.pathname === '/api/admin-decals') return adminDecals(req, res);
  if (url.pathname === '/api/cimpress-webhook') return cimpressWebhook(req, res);
  if (url.pathname === '/api/printful-webhook') return printfulWebhook(req, res);
  if (url.pathname.startsWith('/p/')) { req.url = '/p.html?slug=' + url.pathname.slice(3); }

  let rel = decodeURIComponent(url.pathname);
  if (/^\/me\/[a-z0-9-]{2,32}\/?$/i.test(url.pathname)) rel = '/me.html';
  if (rel === '/' || rel.endsWith('/')) rel = '/index.html';
  else if (!path.extname(rel)) rel += '.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root) || file.startsWith(path.join(root, 'data')) || file.includes(`${path.sep}node_modules${path.sep}`)) {
    res.writeHead(403);
    res.end('no');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      const seg = url.pathname.split('/').filter(Boolean);
      if (req.method === 'GET' && seg.length === 1) {
        aliasRedirect(seg[0], process.env, url.searchParams.get('src')).then((dest) => {
          if (!dest) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(302, { Location: dest.location, 'Cache-Control': 'no-store' });
          res.end();
        }).catch(() => { res.writeHead(404); res.end('Not found'); });
        return;
      }
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' };
    if (rel === '/drive.html' || rel === '/me.html' || rel.startsWith('/admin/')) headers['X-Robots-Tag'] = 'noindex, nofollow';
    res.writeHead(200, headers);
    res.end(buf);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Calm Joints dev http://127.0.0.1:${port}`);
});
