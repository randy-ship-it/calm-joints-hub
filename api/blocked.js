// Public 404 for repo paths that must not be served (lib, scripts, manifests, docs).
module.exports = function handler(req, res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end('Not found');
};
