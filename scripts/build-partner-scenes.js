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
html,body{width:1200px;height:800px;overflow:hidden;font-family:"DM Sans",sans-serif;-webkit-font-smoothing:antialiased}
.scene{position:relative;width:1200px;height:800px;overflow:hidden}
.bg{position:absolute;inset:-30px;filter:blur(var(--blur,5px)) saturate(1.05)}
.vig{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(0,0,0,.28) 100%);pointer-events:none}
.sign{position:absolute;background:#fff;border-radius:14px;box-shadow:0 2px 0 rgba(255,255,255,.6) inset,0 30px 60px -18px rgba(0,0,0,.45),0 8px 18px -8px rgba(0,0,0,.3);color:#0B1D16}
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

const scenes = [
  { name: 'hockey-rink', tag: 'Hockey rinks', bg: `
    <div style="position:absolute;inset:0;background:linear-gradient(#0E1A2B 0,#1B2C44 38%,#2C4261 52%)"></div>
    <div style="position:absolute;left:0;right:0;top:40px;height:300px;background:repeating-linear-gradient(90deg,#26395A 0 34px,#1A2A43 34px 44px),linear-gradient(#0000,#0000);opacity:.8;mask:repeating-linear-gradient(#000 0 26px,#0000 26px 40px)"></div>
    <div style="position:absolute;left:0;right:0;top:330px;height:120px;background:linear-gradient(rgba(210,230,245,.28),rgba(210,230,245,.08))"></div>
    <div style="position:absolute;left:0;right:0;top:450px;height:210px;background:linear-gradient(#FBFCFD,#E8EEF2)"></div>
    <div style="position:absolute;left:0;right:0;top:444px;height:12px;background:#E9ECEF"></div>
    <div style="position:absolute;left:0;right:0;top:640px;height:22px;background:#F2C300"></div>
    <div style="position:absolute;left:0;right:0;top:662px;bottom:0;background:linear-gradient(#EAF4FA,#D6E8F3)"></div>
    <div style="position:absolute;left:0;right:0;top:720px;height:10px;background:#C8102E;opacity:.75"></div>`,
    fg: sign('banner', { h1: 'Sore after the game?', color: '#C8102E', icon: 'puck', style: '--w:600px;left:300px;top:444px;border-radius:4px' }) },
  { name: 'sports-store', tag: 'Sporting goods stores', bg: `
    <div style="position:absolute;inset:0;background:linear-gradient(#F3EEE6,#E7DFD2)"></div>
    ${[0, 1, 2, 3].map(r => `<div style="position:absolute;left:0;right:0;top:${70 + r * 120}px;height:14px;background:#C9B79B"></div>` + Array.from({ length: 14 }, (_, c) => `<div style="position:absolute;left:${20 + c * 86}px;top:${10 + r * 120}px;width:70px;height:60px;border-radius:6px;background:${['#1F4E79', '#D94F30', '#2E7D5B', '#F2B134', '#6B4E9B', '#111', '#E8E3DA'][(r * 5 + c) % 7]}"></div>`).join('')).join('')}
    <div style="position:absolute;left:0;right:0;top:560px;bottom:0;background:linear-gradient(#5A4632,#3E2F21)"></div>
    <div style="position:absolute;left:0;right:0;top:548px;height:16px;background:#7A6247"></div>`,
    blur: '7px',
    fg: sign('tent', { h1: 'Sore from the season?', color: '#1F4E79', icon: 'store', style: '--w:230px;left:485px;top:195px' }) },
  { name: 'pickleball-club', tag: 'Pickleball and tennis clubs', bg: `
    <div style="position:absolute;inset:0;background:linear-gradient(#9FD3F2,#DDF0FA 60%)"></div>
    <div style="position:absolute;left:0;right:0;top:300px;height:120px;background:linear-gradient(#5E8F4E,#4B7A3E)"></div>
    <div style="position:absolute;left:0;right:0;top:420px;bottom:0;background:#2F6DA3"></div>
    <div style="position:absolute;left:120px;right:120px;top:520px;bottom:-40px;background:#3F8C5C;border:6px solid #fff"></div>
    <div style="position:absolute;left:0;right:0;top:120px;height:330px;background:repeating-linear-gradient(45deg,rgba(40,48,44,.45) 0 2px,transparent 2px 22px),repeating-linear-gradient(-45deg,rgba(40,48,44,.45) 0 2px,transparent 2px 22px)"></div>
    <div style="position:absolute;left:0;right:0;top:112px;height:10px;background:#3A413D"></div>`,
    blur: '3px',
    fg: `<div class="grom" style="position:absolute;left:0;top:0"></div>` + sign('banner', { h1: 'Sore after a match?', color: '#E0701B', icon: 'paddle', style: '--w:620px;left:290px;top:150px' }) },
  { name: 'running-store', tag: 'Running and bike shops', bg: `
    <div style="position:absolute;inset:0;background:#EDEFF1"></div>
    ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 12 }, (_, c) => `<div style="position:absolute;left:${c * 104}px;top:${40 + r * 110}px;width:80px;height:34px;border-radius:30px 10px 6px 6px;background:${['#FF5A36', '#2A6FDB', '#1C1C1C', '#F4F4F4', '#18B38A', '#FFC93C'][(r * 7 + c) % 6]}"></div><div style="position:absolute;left:${c * 104 - 10}px;top:${78 + r * 110}px;width:100px;height:6px;background:#C4CAD0"></div>`).join('')).join('')}
    <div style="position:absolute;left:0;right:0;top:600px;bottom:0;background:linear-gradient(#9C7C5C,#7D6147)"></div>`,
    blur: '7px',
    fg: sign('poster', { h1: 'Shins, knees or hips sore?', color: '#FF5A36', icon: 'shoe', style: '--w:330px;left:435px;top:110px' }) },
  { name: 'crossfit-box', tag: 'CrossFit and strength gyms', bg: `
    <div style="position:absolute;inset:0;background:linear-gradient(#3B3F44,#2A2D31)"></div>
    <div style="position:absolute;left:0;right:0;top:60px;height:22px;background:#1A1C1F"></div>
    ${Array.from({ length: 7 }, (_, i) => `<div style="position:absolute;left:${40 + i * 180}px;top:60px;width:20px;height:560px;background:#16181B"></div>`).join('')}
    <div style="position:absolute;left:0;right:0;top:600px;bottom:0;background:#141517"></div>
    ${Array.from({ length: 6 }, (_, i) => `<div style="position:absolute;left:${90 + i * 190}px;top:640px;width:90px;height:90px;border-radius:50%;background:#0B0C0D;border:10px solid #2B2E33"></div>`).join('')}`,
    blur: '5px',
    fg: sign('banner', { h1: 'Tweaked something?', color: '#111111', icon: 'bar', style: '--w:640px;left:280px;top:190px' }) },
  { name: 'pilates-studio', tag: 'Pilates, yoga and barre studios', bg: `
    <div style="position:absolute;inset:0;background:linear-gradient(#F1E9DF,#E8DCCD)"></div>
    <div style="position:absolute;left:760px;top:90px;width:330px;height:500px;border-radius:165px 165px 8px 8px;background:linear-gradient(135deg,#E3ECEA,#C9D8D5);box-shadow:inset 0 0 0 10px #D8C8B4"></div>
    <div style="position:absolute;left:90px;top:360px;width:140px;height:240px;border-radius:70px 70px 10px 10px;background:#6E8B5E;opacity:.85"></div>
    <div style="position:absolute;left:0;right:0;top:600px;bottom:0;background:linear-gradient(#C8A987,#B08F6E)"></div>
    <div style="position:absolute;left:200px;top:640px;width:760px;height:40px;border-radius:10px;background:#5F7F72"></div>`,
    blur: '6px',
    fg: sign('poster', { h1: 'Sore back or hips?', color: '#6E8B5E', icon: 'leaf', style: '--w:320px;left:400px;top:120px' }) },
  { name: 'golf-club', tag: 'Golf clubs and pro shops', bg: `
    <div style="position:absolute;inset:0;background:linear-gradient(#5B3F2A,#3F2B1C)"></div>
    ${Array.from({ length: 10 }, (_, i) => `<div style="position:absolute;left:${i * 124}px;top:0;width:118px;height:620px;background:linear-gradient(#7A5539,#5E402A);box-shadow:inset 0 0 0 3px #4A3222"><div style="position:absolute;left:14px;right:14px;top:30px;height:6px;background:#3A281B;border-radius:3px"></div><div style="position:absolute;left:14px;right:14px;top:44px;height:6px;background:#3A281B;border-radius:3px"></div><div style="position:absolute;right:16px;top:300px;width:10px;height:40px;background:#C9A45C;border-radius:4px"></div></div>`).join('')}
    <div style="position:absolute;left:0;right:0;top:620px;bottom:0;background:linear-gradient(#2F5D3A,#23462C)"></div>`,
    blur: '6px',
    fg: sign('poster', { h1: 'Back or shoulder sore?', color: '#1E5B34', icon: 'flag', style: '--w:320px;left:440px;top:115px' }) },
  { name: 'massage-spa', tag: 'Massage, spa and salon desks', bg: `
    <div style="position:absolute;inset:0;background:linear-gradient(#EFE6DB,#E2D5C5)"></div>
    <div style="position:absolute;left:80px;top:80px;width:420px;height:280px;border-radius:10px;background:linear-gradient(135deg,#CFE0D8,#AFC8BD)"></div>
    <div style="position:absolute;left:880px;top:180px;width:120px;height:380px;border-radius:60px 60px 0 0;background:#7E9A74"></div>
    <div style="position:absolute;left:0;right:0;top:560px;bottom:0;background:linear-gradient(#F7F3EE,#E9E1D6)"></div>
    <div style="position:absolute;left:0;right:0;top:550px;height:14px;background:#C9B8A2"></div>
    <div style="position:absolute;left:760px;top:505px;width:110px;height:50px;border-radius:0 0 30px 30px;background:#D9C9B3"></div>`,
    blur: '6px',
    fg: sign('tent', { h1: 'Need more than a massage?', color: '#8A6E52', icon: 'hand', style: '--w:230px;left:485px;top:195px' }) },
  { name: 'trade-counter', tag: 'Trade supply and contractor counters', bg: `
    <div style="position:absolute;inset:0;background:linear-gradient(#DADDE0,#C4C9CE)"></div>
    ${[0, 1, 2].map(r => `<div style="position:absolute;left:0;right:0;top:${150 + r * 150}px;height:16px;background:#E86A1A"></div>` + Array.from({ length: 11 }, (_, c) => `<div style="position:absolute;left:${10 + c * 112}px;top:${60 + r * 150}px;width:96px;height:90px;border-radius:4px;background:${['#9AA3AB', '#6D7880', '#C79A5A', '#4E5A63'][(r + c) % 4]}"></div>`).join('')).join('')}
    <div style="position:absolute;left:0;right:0;top:570px;bottom:0;background:linear-gradient(#5E666D,#454B51)"></div>
    <div style="position:absolute;left:0;right:0;top:558px;height:16px;background:#8C949B"></div>`,
    blur: '6px',
    fg: sign('tent', { h1: 'Sore back from the job?', color: '#E86A1A', icon: 'hammer', style: '--w:230px;left:485px;top:200px' }) },
  { name: 'race-day', tag: 'Races, run clubs and tournaments', bg: `
    <div style="position:absolute;inset:0;background:linear-gradient(#8CCBF0,#E4F3FB 65%)"></div>
    <div style="position:absolute;left:130px;top:80px;width:940px;height:560px;border:70px solid #15803D;border-bottom:0;border-radius:470px 470px 0 0"></div>
    <div style="position:absolute;left:0;right:0;top:600px;bottom:0;background:linear-gradient(#6F7478,#595D61)"></div>
    <div style="position:absolute;left:0;right:0;top:680px;height:8px;background:#fff;opacity:.8"></div>`,
    blur: '4px',
    fg: sign('banner', { h1: 'Sore after the race?', color: '#15803D', icon: 'bib', style: '--w:620px;left:290px;top:380px;border-radius:6px' }) },
  { name: 'garden-centre', tag: 'Garden centres', bg: `
    <div style="position:absolute;inset:0;background:linear-gradient(#EAF2E4,#D7E6CC)"></div>
    ${Array.from({ length: 22 }, (_, i) => `<div style="position:absolute;left:${(i * 137) % 1200}px;top:${260 + (i * 53) % 260}px;width:${110 + (i * 17) % 80}px;height:${110 + (i * 17) % 80}px;border-radius:50%;background:${['#4F8A3C', '#6FA84F', '#3C6E2E', '#E7A5B8', '#F2C94C'][i % 5]}"></div>`).join('')}
    <div style="position:absolute;left:0;right:0;top:600px;bottom:0;background:linear-gradient(#8A6A4C,#6E5238)"></div>`,
    blur: '7px',
    fg: sign('poster', { h1: 'Knees sore from the garden?', color: '#3C6E2E', icon: 'leaf', style: '--w:320px;left:440px;top:115px' }) },
  { name: 'ski-hill', tag: 'Ski hills and rental shops', bg: `
    <div style="position:absolute;inset:0;background:linear-gradient(#7FB6E0,#DCEBF6 55%)"></div>
    <div style="position:absolute;left:-100px;top:250px;width:800px;height:500px;background:#F4F8FB;clip-path:polygon(0 100%,45% 0,100% 100%)"></div>
    <div style="position:absolute;left:450px;top:180px;width:900px;height:600px;background:#E6EEF4;clip-path:polygon(0 100%,50% 0,100% 100%)"></div>
    ${Array.from({ length: 16 }, (_, i) => `<div style="position:absolute;left:${i * 80}px;top:${520 + (i % 3) * 20}px;width:40px;height:90px;background:#2F5A45;clip-path:polygon(50% 0,100% 100%,0 100%)"></div>`).join('')}
    <div style="position:absolute;left:0;right:0;top:620px;bottom:0;background:linear-gradient(#6B4B33,#51382A)"></div>`,
    blur: '5px',
    fg: sign('poster', { h1: 'Knees feeling the hill?', color: '#1F5FA8', icon: 'snow', style: '--w:320px;left:440px;top:115px' }) },
];

const chrome = process.env.CHROME || 'google-chrome';
for (const s of scenes) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="scene" style="--blur:${s.blur || '5px'}"><div class="bg">${s.bg}</div><div class="vig"></div>${s.fg}<div class="tag"><i>●</i>${s.tag}</div></div></body></html>`;
  const f = path.join(tmp, `${s.name}.html`); fs.writeFileSync(f, html);
  const png = path.join(tmp, `${s.name}.png`);
  execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--screenshot=${png}`, '--window-size=1200,800', '--virtual-time-budget=2000', 'file://' + f], { stdio: 'ignore' });
  execFileSync('python3', ['-c', `from PIL import Image;im=Image.open('${png}').convert('RGB');im.save('${path.join(out, s.name + '.webp')}','WEBP',quality=84,method=6);im.resize((1200,800),Image.LANCZOS).save('${path.join(out, s.name + '.jpg')}','JPEG',quality=85,optimize=True,progressive=True)`]);
  console.log('built', s.name);
}
fs.writeFileSync(path.join(tmp, 'scenes.json'), JSON.stringify(scenes.map(s => ({ name: s.name, tag: s.tag })), null, 1));
