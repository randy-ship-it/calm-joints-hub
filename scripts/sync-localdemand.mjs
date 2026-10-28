// Rebuild localdemand/index.html from the live Scale Local Demand page.
// The estimator is not copied. The page keeps calling /localdemand/api/estimate,
// which vercel.json proxies to scale-partner-dash. Do not edit the HTML by hand.
//
// Usage: node scripts/sync-localdemand.mjs
// LOCALDEMAND_SOURCE can be the upstream URL (default) or a local HTML file.
//
// Fails if an expected upstream anchor is missing, or if a banned term
// (hub launch, Fall50, royalty, boost, Scale-owned logos/titles, dollar
// figures, Align, Clairvoyant, "80 locations") survives in the output.
//
// The 50% / Fall50 royalty pill is Align-only. Scale is removing it from
// the live page. It is not a required anchor. stripRoyaltyOffer() removes
// the pill, its popover, the snapshot-dialog monetize checkbox, and any
// Fall50 link whenever that markup is present, including if it reappears.

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'localdemand', 'index.html');
const UPSTREAM = 'https://scale-partner-dash.vercel.app/localdemand';

export const ANCHORS = [
  '<title>Local Demand | ScaleHealth</title>',
  '/localdemand/img/scalehealth-logo.png',
  'alt="Scale Health"',
  'id="bst"',
  'Ambassador Boost',
  'Launch my Scale Health hub',
  'id="alf"',
  'Request login',
  'local ad value could be',
  'id="pcf"',
  "fetch('api/estimate?pc='",
  'id="vb"',
  'const LOGOS=',
  'Email me my local demand snapshot',
  'id="lkb"',
  'Connect your own customers with Scale',
  'Lock early bird slots',
  'How we get our demand',
  'id="lkd"',
  'api/snapshot',
  'api/lead',
  'Plus Jakarta Sans',
  'https://www.scalehealth.ca/',
  'birchreserve.net',
];

// Not required. Stripped whenever present so a Scale removal does not break
// the sync, and a later reintroduction does not ship on Calm Joints.
const OFFER_COPY = /fall50|clinichubs-fall50|50%\s*royalty|earn 50%|50% payout|name=["']monetize["']|claim_50|promo_code=["']Fall50["']/i;

const BANNED = [
  [/fall50/i, 'Fall50'],
  [/royalt/i, 'royalty'],
  [/\bboost\b/i, 'boost'],
  [/monetize/i, 'monetize'],
  [/clinichubs/i, 'clinichubs'],
  [/request login/i, 'Request login'],
  [/private_login/i, 'private_login'],
  [/claim_50/i, 'claim_50'],
  [/scalehealth/i, 'ScaleHealth / scalehealth'],
  [/scale-master-icon/i, 'Scale icon'],
  [/local ad value/i, 'local ad value'],
  [/birchreserve/i, 'Birch Reserve host'],
  [/birch reserve/i, 'Birch Reserve'],
  [/api\/lead\b/i, 'api/lead'],
  [/api\/snapshot/i, 'api/snapshot'],
  [/\/boost\b/i, '/boost'],
  [/ambassador/i, 'ambassador'],
  [/early bird/i, 'early bird'],
  [/door\s?hanger/i, 'door hanger'],
  [/email me my/i, 'snapshot email'],
  [/plus jakarta/i, 'Plus Jakarta Sans'],
  [/\/localdemand\/img\//i, 'upstream image'],
  [/\bhubs?\b/i, 'hub'],
  [/clairvoyant/i, 'Clairvoyant'],
  [/80 locations/i, '80 locations'],
  [/\bAlign\b/, 'Align'],
  [/50%\s*royalty|earn 50%|50% payout|>50%</i, 'royalty percent'],
  [/\$\d/, 'dollar figure'],
  [/\bcpm\b/i, 'CPM'],
  [/launch my/i, 'Launch my'],
  [/your own customers/i, 'your own customers'],
  [/get your own/i, 'get your own'],
];

const REQUIRED = [
  'Calm Joints: fulfillment partner for Scale Health, for recovery',
  '/media/calm-joints-wordmark.svg',
  'alt="Calm Joints"',
  'DM Sans',
  "fetch('api/estimate?pc='",
  'id="pcf"',
  'id="cjgo"',
  'source=localdemand',
  'brick-and-mortar physio clinics',
  '/media/logos/dr-hos.svg',
  '/media/logos/garmin.png',
  '/media/logos/therabody.svg',
  'id="map"',
  'id="vb"',
  'id="v20"',
  'Enter a Canadian postal code.',
  'Postal code not found. Try another Canadian postal code.',
  "people around '+P.label;",
  'We could not look that up just now.',
  'https://calmjoints.org/localdemand',
  'https://calmjoints.org/media/cj-og-1200x630.png',
  'Estimates only, not a guarantee.',
];

const OLD_FINE = 'Estimates based on current network traffic and typical health-media CPMs; actual results vary.';
const NEW_FINE = 'Estimates only, not a guarantee. You may see more or less activity in your area. We are learning how brand audience views convert to bookings in real time, and we update these numbers as the data gets more accurate.';

function fail(label) {
  throw new Error(`sync-localdemand: ${label}`);
}

function mustInclude(html, needle, label) {
  if (!html.includes(needle)) fail(`missing anchor (${label})`);
}

function replaceOnce(html, needle, replacement, label) {
  const at = html.indexOf(needle);
  if (at < 0) fail(`missing anchor (${label})`);
  if (html.indexOf(needle, at + needle.length) !== -1) fail(`anchor not unique (${label})`);
  return html.slice(0, at) + replacement + html.slice(at + needle.length);
}

function swapAll(html, from, to, label) {
  if (!html.includes(from)) fail(`missing anchor (${label})`);
  return html.split(from).join(to);
}

function replaceUntil(html, startNeedle, endNeedle, replacement, label) {
  const s = html.indexOf(startNeedle);
  if (s < 0) fail(`missing start anchor (${label})`);
  if (html.indexOf(startNeedle, s + startNeedle.length) !== -1) fail(`start anchor not unique (${label})`);
  const e = html.indexOf(endNeedle, s + startNeedle.length);
  if (e < 0) fail(`missing end anchor (${label})`);
  return html.slice(0, s) + replacement + html.slice(e);
}

function swapBlock(html, startNeedle, endNeedle, replacement, label) {
  const s = html.indexOf(startNeedle);
  if (s < 0) fail(`missing start anchor (${label})`);
  if (html.indexOf(startNeedle, s + startNeedle.length) !== -1) fail(`start anchor not unique (${label})`);
  const e = html.indexOf(endNeedle, s + startNeedle.length);
  if (e < 0) fail(`missing end anchor (${label})`);
  return html.slice(0, s) + replacement + html.slice(e + endNeedle.length);
}

export function assertClean(html) {
  const hits = [];
  for (const [re, name] of BANNED) {
    const m = html.match(re);
    if (m) hits.push(`${name} ("${m[0]}")`);
  }
  if (hits.length) fail('banned terms survived in the output:\n  ' + hits.join('\n  '));
  for (const needle of REQUIRED) mustInclude(html, needle, 'required output: ' + needle);
  const scaleHealth = html.split('Scale Health').length - 1;
  if (scaleHealth !== 1) fail(`expected the Scale Health badge once, found ${scaleHealth}`);
}

export function stripRoyaltyOffer(html) {
  let out = exciseAll(html, '<div class="ofr"', 'div');
  out = exciseAll(out, '<div class="ofp"', 'div');
  for (const tag of ['button', 'a', 'label', 'p', 'li', 'form', 'span']) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), (block) => (OFFER_COPY.test(block) ? '' : block));
  }
  out = out.replace(/<input\b[^>]*name=["']monetize["'][^>]*>/gi, '');
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
    if (block.includes('api/estimate') || block.includes('document.write')) return block;
    return OFFER_COPY.test(block) ? '' : block;
  });
  return out;
}

function exciseAll(html, startNeedle, tag) {
  let out = html;
  for (let n = 0; n < 8; n += 1) {
    const s = out.indexOf(startNeedle);
    if (s < 0) return out;
    const open = `<${tag}`;
    const close = `</${tag}>`;
    const gt = out.indexOf('>', s);
    if (gt < 0) fail('offer markup was not closed (' + startNeedle + ')');
    let depth = 1;
    let i = gt + 1;
    while (depth > 0) {
      const nextOpen = out.toLowerCase().indexOf(open, i);
      const nextClose = out.toLowerCase().indexOf(close, i);
      if (nextClose < 0) fail('offer markup had no closing tag (' + startNeedle + ')');
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + open.length;
      } else {
        depth -= 1;
        i = nextClose + close.length;
      }
    }
    out = out.slice(0, s) + out.slice(i);
  }
  return out;
}

export function transform(html) {
  if (typeof html !== 'string' || html.length < 1000) fail('upstream HTML was empty or too short');
  for (const needle of ANCHORS) mustInclude(html, needle, needle.slice(0, 80));

  let out = stripRoyaltyOffer(html);
  out = replaceOnce(out, '<html lang="en">', '<html lang="en-CA">', 'lang');
  out = replaceUntil(out, '<link rel="icon" href="/localdemand/img/sh/favicon.ico?v=2"', '<link rel="preconnect"', `${HEAD}\n`, 'head icons, title, Open Graph');
  out = replaceOnce(
    out,
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
    'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap',
    'font stylesheet',
  );
  out = replaceOnce(out, "'Plus Jakarta Sans'", '"DM Sans"', 'font family');

  out = swapAll(out, '#1C875C', '#15803D', 'brand green');
  out = swapAll(out, '#166C4A', '#116A32', 'brand green dark');
  out = swapAll(out, '#0D1426', '#0B1D16', 'ink');
  out = swapAll(out, '#5B6B80', '#4B5E54', 'mute');
  out = swapAll(out, '#E4E8EE', '#E6ECE8', 'line');
  out = swapAll(out, '#F6F8FA', '#F5F8F6', 'background');
  out = swapAll(out, '#E8F4EE', '#EAF7EF', 'selected tile');
  out = swapAll(out, '#BFE3D0', '#CDEBD6', 'selected tile border');
  out = replaceOnce(out, '</style>', `${EXTRA_CSS}</style>`, 'closing style tag');

  out = replaceOnce(out, NAV_OLD, NAV_NEW, 'nav logo');
  out = replaceUntil(out, '<h1>Local health', '<form class="sb" id="pcf">', HERO, 'hero, snapshot, royalty, demand explainer');
  out = swapBlock(out, '<a class="bst" id="bst"', '</a>', '', 'Ambassador Boost');
  out = swapBlock(out, '<section class="steps"', '</section>', CTA, 'step 1 and step 2 hub cards');
  out = swapBlock(out, '<section class="card alr"', '</section>', '', 'request login alerts');
  out = swapBlock(out, '<dialog id="lkd"', '</dialog>', '', 'snapshot dialog');
  out = applyFinePrint(out);

  const logosAt = out.indexOf('const LOGOS=');
  const logosEnd = out.indexOf(".join('');", logosAt);
  if (logosAt < 0 || logosEnd < 0) fail('missing anchor (logo grid script)');
  out = out.slice(0, logosAt) + LOGOS_JS + out.slice(logosEnd + ".join('');".length);

  out = replaceOnce(out, 'function show(){const r=', 'function show(){cjLink();const r=', 'show()');
  out = replaceOnce(out, SUB_OLD, "$('sub').textContent=fmt(P.est[r].pop)+' people around '+P.label;", 'ad-value dollars');
  out = replaceOnce(out, SUBMIT_OLD, SUBMIT_NEW, 'estimate submit and boost link');
  out = dropTailScripts(out);
  out = stripRoyaltyOffer(out);

  if (!out.startsWith('<!doctype html>')) fail('doctype missing after transform');
  out = '<!-- Generated by scripts/sync-localdemand.mjs from https://scale-partner-dash.vercel.app/localdemand. Do not edit by hand. -->\n' + out;
  if (!out.endsWith('\n')) out += '\n';
  assertClean(out);
  return out;
}

// Scale is replacing the CPM disclaimer with NEW_FINE. Accept either sentence.
export function applyFinePrint(html) {
  let out = html;
  if (out.includes(OLD_FINE)) {
    out = out.split(OLD_FINE).join(out.includes(NEW_FINE) ? '' : NEW_FINE);
  }
  out = out.replace(/<p class="fine">\s*<\/p>/g, '');
  if (!out.includes(NEW_FINE)) fail('fine print missing: expected the old CPM sentence or the new estimates sentence');
  if (out.includes(OLD_FINE)) fail('fine print still contains the old CPM sentence');
  return out;
}

function dropTailScripts(html) {
  const start = html.indexOf('<script>(function(){var w=document.getElementById("dmd")');
  if (start < 0) fail('missing anchor (offer, snapshot, and lead scripts)');
  const body = html.lastIndexOf('</body>');
  if (body < start) fail('missing </body>');
  const end = html.lastIndexOf('</script>', body);
  if (end < start) fail('missing closing script before </body>');
  return html.slice(0, start) + html.slice(end + '</script>'.length);
}

const HEAD = `<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/media/calm-joints-mark.svg" type="image/svg+xml"><link rel="icon" type="image/png" sizes="32x32" href="/media/favicon-32.png"><link rel="apple-touch-icon" href="/media/apple-touch-icon.png"><meta name="theme-color" content="#15803D"><title>Local recovery demand | Calm Joints</title><meta name="description" content="See monthly recovery demand near a Canadian postal code. Calm Joints partners with brick-and-mortar physio clinics for in-person care."><link rel="canonical" href="https://calmjoints.org/localdemand"><meta property="og:title" content="Local recovery demand | Calm Joints"><meta property="og:description" content="See monthly recovery demand near a Canadian postal code. Calm Joints partners with brick-and-mortar physio clinics for in-person care."><meta property="og:url" content="https://calmjoints.org/localdemand"><meta property="og:image" content="https://calmjoints.org/media/cj-og-1200x630.png"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="Local recovery demand | Calm Joints"><meta name="twitter:image" content="https://calmjoints.org/media/cj-og-1200x630.png">`;

const EXTRA_CSS = `
.nav .in{height:auto;min-height:60px;justify-content:space-between;gap:12px 16px;padding-top:10px;padding-bottom:10px;flex-wrap:wrap}
.nav img{height:36px;width:auto}
.cj-badge{margin:0;max-width:36rem;font-size:12.5px;font-weight:600;line-height:1.35;color:#116A32;background:#EAF7EF;border:1px solid #CDEBD6;border-radius:999px;padding:6px 12px}
.cj-note{font-weight:500;font-size:15px;color:var(--mute);max-width:640px}
#cj-partner{margin-top:0}
p.fine{max-width:40rem;margin:0 auto;line-height:1.45}
@media(max-width:600px){.cj-badge{font-size:12px;border-radius:14px;text-align:left}}
`;

const NAV_OLD = '<header class="nav"><div class="in"><a href="https://www.scalehealth.ca/" target="_blank" rel="noopener"><img src="/localdemand/img/scalehealth-logo.png" alt="Scale Health" width="115" height="22"></a></div></header>';
const NAV_NEW = '<header class="nav"><div class="in"><a href="/" aria-label="Calm Joints home"><img src="/media/calm-joints-wordmark.svg" alt="Calm Joints" width="154" height="36"></a><p class="cj-badge">Calm Joints: fulfillment partner for Scale Health, for recovery</p></div></header>';

const HERO = `<h1>Local recovery demand</h1><p class="lead">See how many people near a Canadian postal code are looking at recovery care each month.</p>`;

const CTA = `<section class="card cta" id="cj-partner"><p>We want to partner with brick-and-mortar physio clinics to help with our in-person needs.</p><p class="cj-note">A growing network of a few hundred therapists across Canada and the US, plus a referral network of trusted locations.</p><div class="bs"><a class="btn" id="cjgo" href="/partners?source=localdemand&amp;radius=20#inquire">Talk with us about your clinic</a></div></section>`;

const LOGOS_JS = `const LOGOS=[['/media/logos/dr-hos.svg',"DR-HO'S"],['/media/logos/garmin.png','Garmin'],['/media/logos/therabody.svg','Therabody'],['/media/logos/renpho.png','RENPHO'],['/media/logos/genuine-health.svg','Genuine Health'],['/media/logos/airwaav.svg','AIRWAAV'],['/media/logos/manduka.png','Manduka'],['/media/logos/bedjet.png','BedJet']];
$('lt').innerHTML=LOGOS.map(([f,a])=>\`<div title="\${a}"><img src="\${f}" alt="\${a}"></div>\`).join('');`;

const SUB_OLD = "{const v=P.est[r].views,m=x=>'$'+(x>=1e6?(x/1e6).toFixed(1)+'M':x>=1e3?Math.round(x/1e3)+'K':Math.round(x));$('sub').textContent=fmt(P.est[r].pop)+' people around '+P.label+' \\u00b7 local ad value could be '+m(v*3/1000)+'\\u2013'+m(v*15/1000)+'/mo (est.)'}";

const SUBMIT_OLD = "$('pcf').onsubmit=async e=>{e.preventDefault();const v=$('pc').value.trim();if(!v)return;$('sub').textContent='Calculating\\u2026';try{const r=await fetch('api/estimate?pc='+encodeURIComponent(v));if(!r.ok)throw 0;const j=await r.json();P={label:j.point.label||v,est:j.est,ll:[j.point.lat,j.point.lon]};$('bst').href='/localdemand/boost?pc='+encodeURIComponent(v);show()}catch(_){$('sub').textContent='Postal code not found. Try another Canadian postal code.'}};";

const SUBMIT_NEW = `function cjLink(){const a=$('cjgo');if(!a)return;const q=new URLSearchParams();q.set('source','localdemand');const v=$('pc').value.trim();if(v)q.set('pc',v);q.set('radius',$('rad').value);a.href='/partners?'+q.toString()+'#inquire'}
$('pc').addEventListener('input',cjLink);
$('pcf').onsubmit=async e=>{e.preventDefault();cjLink();const v=$('pc').value.trim();if(!v){$('sub').textContent='Enter a Canadian postal code.';return}$('sub').textContent='Calculating…';try{const r=await fetch('api/estimate?pc='+encodeURIComponent(v));if(r.status===404){$('sub').textContent='Postal code not found. Try another Canadian postal code.';return}if(!r.ok)throw 0;const j=await r.json();if(!j||!j.est||!j.point)throw 0;P={label:j.point.label||v,est:j.est,ll:[j.point.lat,j.point.lon]};show()}catch(_){$('sub').textContent='We could not look that up just now. Please try again in a moment.'}};`;

async function readSource() {
  const src = process.env.LOCALDEMAND_SOURCE || UPSTREAM;
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { headers: { accept: 'text/html', 'user-agent': 'calm-joints-sync/1.0 (calmjoints.org)' } });
    if (!res.ok) fail(`upstream fetch ${src} returned ${res.status}`);
    const text = await res.text();
    if (!text.includes('<title>Local Demand | ScaleHealth</title>')) {
      fail('upstream did not serve the Local Demand page (wrong host, or a bot challenge)');
    }
    return text;
  }
  return fs.readFileSync(src, 'utf8');
}

async function main() {
  const html = await readSource();
  const out = transform(html);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  console.log(`wrote ${path.relative(root, OUT)} (${out.length} bytes) from ${process.env.LOCALDEMAND_SOURCE || UPSTREAM}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
