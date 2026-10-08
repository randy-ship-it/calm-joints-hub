// Builds chat-glen.html and chat-gwen.html from chat.html: same page, guide pre-selected, and a
// guide-specific link preview (og/twitter title, text, image). Served for /chat?guide=glen|gwen
// (vercel.json rewrite on the query) and the short links /glen and /gwen.
// Run: node scripts/build-guide-pages.js   (scripts/test-share.js fails if the pages are stale)
const fs = require('fs');
const path = require('path');

const GUIDES = {
  glen: { name: 'Glen', him: 'him', img: 'og-glen.jpg' },
  gwen: { name: 'Gwen', him: 'her', img: 'og-gwen.jpg' },
};
const OG_V = 2;

function build(src, key) {
  const g = GUIDES[key];
  const title = `Hurting? Ask ${g.name}, free 24/7`;
  const desc = `${g.name} is Calm Joints’ recovery concierge. Tell ${g.him} what hurts and get clear next steps, any time. No app needed.`;
  const img = `https://calmjoints.org/media/${g.img}?v=${OG_V}`;
  const alt = `${g.name}, Calm Joints’ recovery concierge: Hurting? Ask ${g.name}, free 24/7`;
  const url = `https://calmjoints.org/chat?guide=${key}`;
  const set = (s, re, val) => { if (!re.test(s)) throw new Error('chat.html is missing ' + re); return s.replace(re, val); };
  let s = src;
  s = set(s, /<title>[^<]*<\/title>/, `<title>${title} | Calm Joints</title>`);
  s = set(s, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`);
  s = set(s, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${desc}">`);
  s = set(s, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${img}">`);
  s = set(s, /<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${alt}">`);
  s = set(s, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${title}">`);
  s = set(s, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${desc}">`);
  s = set(s, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${img}">`);
  s = set(s, /<meta name="twitter:image:alt" content="[^"]*">/, `<meta name="twitter:image:alt" content="${alt}">`);
  s = set(s, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  s = set(s, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${desc}">`);
  s = set(s, /<script src="\/config\.js/, `<script>window.CJ_PAGE_GUIDE = '${key}';</script>\n<script src="/config.js`);
  return set(s, /^<!doctype html>\n/i, '<!doctype html>\n<!-- Built from chat.html by scripts/build-guide-pages.js. Edit chat.html, then rebuild. -->\n');
}

function buildAll(root = path.join(__dirname, '..')) {
  const src = fs.readFileSync(path.join(root, 'chat.html'), 'utf8');
  const out = {};
  for (const k of Object.keys(GUIDES)) out[`chat-${k}.html`] = build(src, k);
  return out;
}
if (require.main === module) {
  for (const [f, s] of Object.entries(buildAll())) { fs.writeFileSync(path.join(__dirname, '..', f), s); console.log('wrote', f); }
}
module.exports = { build, buildAll, GUIDES };
