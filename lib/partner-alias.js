'use strict';
// Short pen links: /randy -> /p/amb-randyg-cj?src=pen
// The alias is stored beside the partner record. The redirect keeps the visit
// on that partner (src=pen) so /sales and the ledger attribute it.

const PAGE_ALIASES = [
  'about', 'admin', 'alias', 'ambassadors', 'app', 'apply', 'assets', 'blog', 'book', 'careers',
  'cdn', 'chat', 'chat-glen', 'chat-gwen', 'contact', 'data', 'favicon', 'fonts', 'glen', 'guide',
  'gwen', 'health', 'images', 'index', 'intake', 'login', 'mail', 'newsletter', 'p', 'partner',
  'partner-terms', 'partners', 'privacy', 'question', 'report', 'resume', 'robots', 'sales',
  'share', 'sitemap', 'sms', 'static', 'status', 'team', 'terms', 'www',
];
const PREFIXES = ['api', 'js', 'css', 'media', 'blog', 'lib', 'scripts', 'data', '_next'];
const RESERVED_ALIASES = new Set([...PAGE_ALIASES, ...PREFIXES]);

function matcherSource() {
  const skip = [...PREFIXES.map((n) => `${n}/`), ...PREFIXES.map((n) => `${n}$`), ...PAGE_ALIASES.map((n) => `${n}$`)];
  return `/((?!${skip.join('|')})[a-z0-9-]{2,32})`;
}
const ALIAS_MATCHER = matcherSource();
const ALIAS_MATCHERS = [ALIAS_MATCHER, `${ALIAS_MATCHER}/`];

function normalizeAlias(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/^\/+|\/+$/g, '');
}
function validAlias(s) {
  return typeof s === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/.test(s);
}

function blob() { return require('@vercel/blob'); }

async function readAlias(alias, env) {
  if (!validAlias(alias)) return null;
  try {
    const out = await blob().get(`qr-aliases/${alias}.json`, { access: 'private', token: env.BLOB_READ_WRITE_TOKEN });
    if (!out || !out.stream) return null;
    return JSON.parse(await new Response(out.stream).text());
  } catch { return null; }
}

async function aliasRedirect(name, env) {
  const alias = normalizeAlias(name);
  if (!validAlias(alias) || RESERVED_ALIASES.has(alias)) return null;
  const rec = await readAlias(alias, env);
  const slug = rec && rec.slug;
  if (!slug || !/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(slug)) return null;
  let partner = null;
  try {
    const out = await blob().get(`qr-partners/${slug}/partner.json`, { access: 'private', token: env.BLOB_READ_WRITE_TOKEN });
    if (out && out.stream) partner = JSON.parse(await new Response(out.stream).text());
  } catch { partner = null; }
  if (!partner || partner.status === 'deleted') return null;
  return { alias, slug, src: 'pen', location: `/p/${slug}?src=pen` };
}

module.exports = { PAGE_ALIASES, PREFIXES, RESERVED_ALIASES, ALIAS_MATCHER, ALIAS_MATCHERS, normalizeAlias, validAlias, readAlias, aliasRedirect };
