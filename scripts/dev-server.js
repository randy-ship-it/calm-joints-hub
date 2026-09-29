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

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/api/newsletter') return newsletter(req, res);
  if (url.pathname === '/api/apply') return apply(req, res);
  if (url.pathname === '/api/question') return question(req, res);
  if (url.pathname === '/api/intake') return intake(req, res);
  if (url.pathname === '/api/careers') return careers(req, res);
  if (url.pathname === '/api/qr-partner') return qrPartner(req, res);
  if (url.pathname === '/api/qr-lead') return qrLead(req, res);
  if (url.pathname.startsWith('/p/')) { req.url = '/p.html?slug=' + url.pathname.slice(3); }

  let rel = decodeURIComponent(url.pathname);
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
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Calm Joints dev http://127.0.0.1:${port}`);
});
