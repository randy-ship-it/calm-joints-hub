// Builds the /partners carousel scenes as HTML, then rasterizes them with headless Chrome.
// Output: media/partners/scenes/<name>.webp (2400x1600). Run: node scripts/build-partner-scenes.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const qrcode = require('../js/qrcode.js');
const root = path.join(__dirname, '..');
const tmp = path.join(__dirname, 'art');
const out = path.join(root, 'media/partners/scenes');
fs.mkdirSync(out, { recursive: true });
const WORD = fs.readFileSync(path.join(root, 'media/calm-joints-wordmark.svg'), 'utf8');

function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg viewBox="-3 -3 ${n + 6} ${n + 6}" shape-rendering="crispEdges"><rect x="-3" y="-3" width="${n + 6}" height="${n + 6}" fill="#fff"/><path d="${d}" fill="#0B1D16"/></svg>`;
}
const QR = qrSvg('https://calmjoints.org/partners');

const ICONS = {
  puck: '<ellipse cx="12" cy="10" rx="8" ry="3.2"/><path d="M4 10v4c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-4"/>',
  paddle: '<rect x="5" y="3" width="10" height="12" rx="5"/><path d="M10 15v6"/><circle cx="18.5" cy="17.5" r="2"/>',
  shoe: '<path d="M3 16v-5l4-2 3 3h3l6 2a2 2 0 0 1 2 2v1H3z"/><path d="M3 19h18"/>',
  flag: '<path d="M6 21V3"/><path d="M6 4h11l-3 4 3 4H6"/>',
  bar: '<path d="M2 12h20"/><rect x="4" y="7" width="3" height="10" rx="1"/><rect x="17" y="7" width="3" height="10" rx="1"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19l8-8"/>',
  hand: '<path d="M7 11V5a1.5 1.5 0 0 1 3 0v5M10 10V4a1.5 1.5 0 0 1 3 0v6M13 10V5a1.5 1.5 0 0 1 3 0v7M16 12V8a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-3-5a1.5 1.5 0 0 1 2.5-1.5L7 14"/>',
  hammer: '<path d="M14 6l4 4M4 20l9-9M11 4l6 6 2-2-6-6z"/>',
  bib: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 12h8M8 9h2M14 9h2"/>',
  snow: '<path d="M12 2v20M4 7l16 10M20 7L4 17"/>',
  store: '<path d="M3 9l2-5h14l2 5M3 9h18v11H3zM9 20v-6h6v6"/>',
};

function badge(color, icon) {
  return `<div class="yl"><span class="yl-i" style="background:${color}"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg></span><span class="yl-t">YOUR<br>LOGO</span></div>`;
}
function logos(b) { return `<div class="lr"><div class="cj">${WORD}</div><span class="x">×</span>${b}</div>`; }

function sign(kind, o) {
  const b = badge(o.color, o.icon);
  if (kind === 'banner') return `<div class="sign banner" style="${o.style}"><div class="bl">${logos(b)}<h3>${o.h1}<br><em>Scan to see a physio.</em></h3><p>Video visits with a registered physiotherapist · calmjoints.org</p></div><div class="qr">${QR}</div></div>`;
  if (kind === 'tent') return `<div class="tent" style="${o.style}"><div class="sign poster">${logos(b)}<div class="qr">${QR}</div><h3>${o.h1}</h3><p>Scan to book a video physio</p></div><div class="easel"></div></div>`;
  return `<div class="sign poster" style="${o.style}">${logos(b)}<div class="qr">${QR}</div><h3>${o.h1}</h3><p>Scan to book a video visit with a registered physio</p></div>`;
}

const CSS = `
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:900px;overflow:hidden;font-family:"DM Sans",sans-serif;-webkit-font-smoothing:antialiased}
.scene{position:relative;width:1200px;height:900px;overflow:hidden}
.bg{position:absolute;inset:-30px;filter:blur(var(--blur,5px)) saturate(1.05)}
.vig{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(0,0,0,.28) 100%);pointer-events:none}
.sign{position:absolute;background:#fff;border-radius:14px;box-shadow:0 2px 0 rgba(255,255,255,.6) inset,0 40px 80px -30px rgba(0,0,0,.45),0 10px 24px -12px rgba(0,0,0,.3);color:#0B1D16}
.poster{width:var(--w,300px);padding:calc(var(--w,300px)*.075);display:flex;flex-direction:column;align-items:center;text-align:center;aspect-ratio:3/4}
.lr{display:flex;align-items:center;justify-content:center;gap:.5em;width:100%;font-size:calc(var(--w,300px)*.05)}
.cj{height:2.9em;flex:0 0 auto}.cj svg{height:100%;width:auto;display:block}
.x{color:#9AA8A0;font-weight:600;font-size:1.25em}
.yl{display:flex;align-items:center;gap:.4em}
.yl-i{width:2.6em;height:2.6em;border-radius:.7em;display:grid;place-items:center}
.yl-i svg{width:62%;height:62%}
.yl-t{font-weight:700;font-size:.78em;line-height:1.02;letter-spacing:.06em;text-align:left;color:#0B1D16}
.poster .qr{width:74%;margin:7% 0 5%}
.qr svg{display:block;width:100%;height:auto}
.poster h3{font-size:calc(var(--w,300px)*.074);line-height:1.1;letter-spacing:-.02em;font-weight:700}
.poster p{margin-top:.5em;font-size:calc(var(--w,300px)*.038);color:#4B5E54;font-weight:500}
.banner{width:var(--w,600px);aspect-ratio:2/1;display:flex;align-items:center;gap:5%;padding:calc(var(--w,600px)*.045) calc(var(--w,600px)*.05);border-radius:10px}
.banner .bl{flex:1;display:flex;flex-direction:column;gap:calc(var(--w,600px)*.03)}
.banner .lr{justify-content:flex-start;font-size:calc(var(--w,600px)*.026)}
.banner h3{font-size:calc(var(--w,600px)*.058);line-height:1.08;letter-spacing:-.02em}
.banner h3 em{font-style:normal;color:#15803D}
.banner p{font-size:calc(var(--w,600px)*.022);color:#4B5E54;font-weight:500}
.banner .qr{width:40%;flex:0 0 auto}
.tent{position:absolute;width:var(--w,200px)}
.tent .sign{position:relative;width:100%;border-radius:10px}
.tent .easel{height:calc(var(--w,200px)*.08);margin:0 6%;background:linear-gradient(#d9dfdb,#b9c2bd);border-radius:0 0 6px 6px;box-shadow:0 14px 22px -10px rgba(0,0,0,.5)}
.grom::before,.grom::after{content:"";position:absolute;top:10px;width:10px;height:10px;border-radius:50%;background:#cfd6d2;box-shadow:inset 0 1px 2px rgba(0,0,0,.4)}
.grom::before{left:10px}.grom::after{right:10px}
.tag{position:absolute;left:28px;top:26px;background:rgba(255,255,255,.92);backdrop-filter:blur(6px);padding:9px 16px;border-radius:999px;font-weight:700;font-size:17px;color:#0B1D16;box-shadow:0 6px 18px -8px rgba(0,0,0,.35)}
.tag i{font-style:normal;color:#15803D;margin-right:6px}
`;

// Clean mockups: one sign per venue on a tinted field with a faint material pattern. No fake photos.
const PAT = {
  boards: 'linear-gradient(transparent 0 86%,#F2C300 86% 91%,transparent 91%)',
  fence: 'repeating-linear-gradient(45deg,rgba(255,255,255,.14) 0 2px,transparent 2px 26px),repeating-linear-gradient(-45deg,rgba(255,255,255,.14) 0 2px,transparent 2px 26px)',
  wood: 'repeating-linear-gradient(90deg,rgba(0,0,0,.08) 0 3px,transparent 3px 150px)',
  tile: 'repeating-linear-gradient(90deg,transparent 0 78px,rgba(0,0,0,.06) 78px 80px),repeating-linear-gradient(transparent 0 78px,rgba(0,0,0,.06) 78px 80px)',
  shelf: 'repeating-linear-gradient(transparent 0 176px,rgba(0,0,0,.07) 176px 184px)',
  lanes: 'repeating-linear-gradient(90deg,transparent 0 196px,rgba(255,255,255,.16) 196px 204px)',
};
const scenes = [
  { name: 'hockey-rink', field: 'linear-gradient(160deg,#EAF2F8,#D5E4EF)', pat: PAT.boards,
    fg: sign('banner', { h1: 'Sore after the game?', color: '#C8102E', icon: 'puck', style: '--w:860px;left:170px;top:235px;border-radius:8px' }) },
  { name: 'tennis-courts', field: 'linear-gradient(160deg,#2F6DA3,#24568A)', pat: PAT.fence,
    fg: sign('banner', { h1: 'Sore after a match?', color: '#E0701B', icon: 'paddle', style: '--w:860px;left:170px;top:235px;border-radius:8px' }) },
  { name: 'private-club', field: 'linear-gradient(160deg,#2F5D3A,#1F4229)', pat: PAT.wood,
    fg: sign('poster', { h1: 'Back or shoulder sore?', color: '#1E5B34', icon: 'flag', style: '--w:500px;left:350px;top:117px' }) },
  { name: 'gym-change-room', field: 'linear-gradient(160deg,#E9EDEF,#D4DBDF)', pat: PAT.tile,
    fg: sign('poster', { h1: 'Sore after your workout?', color: '#111111', icon: 'bar', style: '--w:500px;left:350px;top:117px' }) },
  { name: 'sports-store', field: 'linear-gradient(160deg,#F4EDE3,#E6D9C6)', pat: PAT.shelf,
    fg: sign('tent', { h1: 'Sore from the season?', color: '#1F4E79', icon: 'store', style: '--w:450px;left:375px;top:95px' }) },
  { name: 'race-day', field: 'linear-gradient(160deg,#15803D,#0E5F2D)', pat: PAT.lanes,
    fg: sign('banner', { h1: 'Sore after the race?', color: '#15803D', icon: 'bib', style: '--w:860px;left:170px;top:235px;border-radius:8px' }) },
];

const chrome = process.env.CHROME || 'google-chrome';
for (const s of scenes) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="scene" style="background:${s.field}"><div style="position:absolute;inset:0;background:${s.pat}"></div>${s.fg}</div></body></html>`;
  const f = path.join(tmp, `${s.name}.html`); fs.writeFileSync(f, html);
  const png = path.join(tmp, `${s.name}.png`);
  execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--screenshot=${png}`, '--window-size=1200,900', '--virtual-time-budget=2000', 'file://' + f], { stdio: 'ignore' });
  execFileSync('python3', ['-c', `from PIL import Image;im=Image.open('${png}').convert('RGB');im.save('${path.join(out, s.name + '.webp')}','WEBP',quality=84,method=6);im.resize((1200,900),Image.LANCZOS).save('${path.join(out, s.name + '.jpg')}','JPEG',quality=85,optimize=True,progressive=True)`]);
  console.log('built', s.name);
}
fs.writeFileSync(path.join(tmp, 'scenes.json'), JSON.stringify(scenes.map(s => ({ name: s.name, tag: s.tag })), null, 1));
