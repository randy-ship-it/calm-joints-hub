// Builds the /partners placement mockups (SVG) with a real, scannable QR.
const fs = require('fs');
const path = require('path');
const qrcode = require('../js/qrcode.js');
const root = path.join(__dirname, '..');
const out = path.join(root, 'media/partners/qr');
const WORD = fs.readFileSync(path.join(root, 'media/calm-joints-wordmark.svg'), 'utf8')
  .replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

function qrPath(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return { n, d };
}
const QR = qrPath('https://calmjoints.org/partners');

// A co-branded card: our wordmark x partner logo, a big QR, a clear call to action.
function card(x, y, w, opts = {}) {
  const wide = opts.tall === false;
  const h = w * (wide ? 0.5 : 1.38);
  const pad = wide ? h * 0.1 : w * 0.08;
  const s = opts.tall === false ? h - pad * 2 : w - pad * 2;
  const qn = QR.n + 8; const scale = s / qn;
  if (opts.tall === false) {
    const qx = x + w - pad - s, qy = y + pad;
    const lw = w - s - pad * 3;
    return `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.03}" fill="#fff" stroke="#E2E8E4" stroke-width="${w * 0.004}"/>
      <svg x="${x + pad}" y="${y + pad}" width="${lw * 0.62}" height="${lw * 0.62 * 56 / 205}" viewBox="0 0 205 56">${WORD}</svg>
      <text x="${x + pad + lw * 0.66}" y="${y + pad + lw * 0.11}" font-family="DM Sans,Arial" font-weight="700" font-size="${lw * 0.07}" fill="#9AA8A0">×</text>
      <rect x="${x + pad + lw * 0.73}" y="${y + pad - lw * 0.01}" width="${lw * 0.27}" height="${lw * 0.17}" rx="${lw * 0.02}" fill="#F3F6F4" stroke="#B9C6BE" stroke-dasharray="${lw * 0.012}" stroke-width="${lw * 0.004}"/>
      <text x="${x + pad + lw * 0.865}" y="${y + pad + lw * 0.1}" text-anchor="middle" font-family="DM Sans,Arial" font-weight="700" font-size="${lw * 0.045}" fill="#6B7C72">YOUR LOGO</text>
      <text x="${x + pad}" y="${y + h * 0.56}" font-family="DM Sans,Arial" font-weight="700" font-size="${lw * 0.105}" fill="#0B1D16">Sore after the game?</text>
      <text x="${x + pad}" y="${y + h * 0.56 + lw * 0.13}" font-family="DM Sans,Arial" font-weight="700" font-size="${lw * 0.105}" fill="#15803D">Scan to see a physio.</text>
      <text x="${x + pad}" y="${y + h - pad}" font-family="DM Sans,Arial" font-weight="500" font-size="${lw * 0.052}" fill="#4B5E54">Registered physios by video · calmjoints.org</text>
      <g transform="translate(${qx} ${qy}) scale(${scale})"><rect width="${qn}" height="${qn}" fill="#fff"/><path transform="translate(4 4)" d="${QR.d}" fill="#0B1D16"/></g>
    </g>`;
  }
  const qy = y + pad * 2.6 + w * 0.12;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.05}" fill="#fff" stroke="#E2E8E4" stroke-width="${w * 0.006}"/>
    <svg x="${x + pad}" y="${y + pad}" width="${w * 0.44}" height="${w * 0.44 * 56 / 205}" viewBox="0 0 205 56">${WORD}</svg>
    <text x="${x + w * 0.56}" y="${y + pad + w * 0.085}" font-family="DM Sans,Arial" font-weight="700" font-size="${w * 0.06}" fill="#9AA8A0">×</text>
    <rect x="${x + w * 0.63}" y="${y + pad - w * 0.005}" width="${w * 0.29}" height="${w * 0.13}" rx="${w * 0.02}" fill="#F3F6F4" stroke="#B9C6BE" stroke-dasharray="${w * 0.012}" stroke-width="${w * 0.005}"/>
    <text x="${x + w * 0.775}" y="${y + pad + w * 0.078}" text-anchor="middle" font-family="DM Sans,Arial" font-weight="700" font-size="${w * 0.042}" fill="#6B7C72">YOUR LOGO</text>
    <g transform="translate(${x + pad} ${qy}) scale(${scale})"><rect width="${qn}" height="${qn}" fill="#fff"/><path transform="translate(4 4)" d="${QR.d}" fill="#0B1D16"/></g>
    <text x="${x + w / 2}" y="${qy + s + w * 0.1}" text-anchor="middle" font-family="DM Sans,Arial" font-weight="700" font-size="${w * 0.075}" fill="#0B1D16">Scan to see a physio</text>
    <text x="${x + w / 2}" y="${qy + s + w * 0.17}" text-anchor="middle" font-family="DM Sans,Arial" font-weight="500" font-size="${w * 0.042}" fill="#4B5E54">Video visits · book in minutes</text>
  </g>`;
}

const scenes = {
  'volleyball-net': () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7CC6F2"/><stop offset="1" stop-color="#D6EEFB"/></linearGradient></defs>
    <rect width="1200" height="800" fill="url(#sky)"/>
    <circle cx="1040" cy="120" r="60" fill="#FFE7A3"/>
    <path d="M0 520 Q300 490 600 505 T1200 500 V800 H0Z" fill="#EBD3A0"/>
    <path d="M0 600 Q400 580 1200 610 V800 H0Z" fill="#E2C48B"/>
    <rect x="96" y="210" width="16" height="420" fill="#5B4636"/><rect x="1088" y="210" width="16" height="420" fill="#5B4636"/>
    <rect x="104" y="222" width="992" height="18" fill="#fff"/>
    <g stroke="#2B2B2B" stroke-width="2" opacity=".55">${Array.from({ length: 50 }, (_, i) => `<line x1="${112 + i * 20}" y1="240" x2="${112 + i * 20}" y2="420"/>`).join('')}${Array.from({ length: 9 }, (_, i) => `<line x1="112" y1="${240 + i * 22}" x2="1088" y2="${240 + i * 22}"/>`).join('')}</g>
    <rect x="104" y="416" width="992" height="10" fill="#fff"/>
    ${card(330, 250, 540, { tall: false })}
    <circle cx="930" cy="150" r="34" fill="#fff" stroke="#F2B63D" stroke-width="6"/><path d="M900 140 Q930 160 962 138 M906 170 Q934 150 958 176" stroke="#2C7BD9" stroke-width="5" fill="none"/>
  </svg>`,
  'arena-boards': () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
    <rect width="1200" height="800" fill="#1C2733"/>
    <g fill="#2A3847">${Array.from({ length: 6 }, (_, r) => Array.from({ length: 24 }, (_, c) => `<rect x="${c * 50 + (r % 2) * 25}" y="${60 + r * 42}" width="36" height="28" rx="6"/>`).join('')).join('')}</g>
    <rect x="0" y="330" width="1200" height="40" fill="#C8D3DB" opacity=".35"/>
    <rect x="0" y="370" width="1200" height="230" fill="#F4F7F9"/>
    <rect x="0" y="370" width="1200" height="12" fill="#D0141F"/><rect x="0" y="588" width="1200" height="12" fill="#F2C300"/>
    ${card(40, 392, 340, { tall: false })}${card(430, 392, 340, { tall: false })}${card(820, 392, 340, { tall: false })}
    <path d="M0 600 H1200 V800 H0Z" fill="#E9F3F8"/><path d="M0 700 H1200" stroke="#D0141F" stroke-width="6" opacity=".5"/>
  </svg>`,
  'studio-poster': () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
    <rect width="1200" height="800" fill="#EFE9E1"/><rect y="600" width="1200" height="200" fill="#B99772"/>
    <g stroke="#A68463" stroke-width="3">${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 110}" y1="600" x2="${i * 110 - 60}" y2="800"/>`).join('')}</g>
    <rect x="720" y="120" width="380" height="470" rx="6" fill="#DCE7E4" opacity=".6"/><rect x="738" y="138" width="344" height="434" fill="#CFE0DC" opacity=".5"/>
    <rect x="80" y="560" width="520" height="40" rx="8" fill="#5E8C7A"/><rect x="620" y="620" width="300" height="24" rx="12" fill="#3E5C50"/>
    ${card(250, 70, 330)}
    <circle cx="1000" cy="690" r="48" fill="#7FA99A"/>
  </svg>`,
  'front-desk': () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
    <rect width="1200" height="800" fill="#F6F4F0"/>
    <rect x="80" y="100" width="1040" height="60" rx="8" fill="#E7E2DA"/>
    <rect x="0" y="560" width="1200" height="240" fill="#2F3B35"/><rect x="0" y="545" width="1200" height="24" fill="#51635A"/>
    <path d="M430 545 L500 190 H720 L790 545Z" fill="#fff" stroke="#DCE3DE" stroke-width="3"/>
    ${card(525, 205, 170)}
    <rect x="860" y="420" width="190" height="125" rx="10" fill="#1D2622"/><rect x="872" y="432" width="166" height="96" rx="4" fill="#3F5A4E"/>
    <circle cx="240" cy="500" r="45" fill="#D8C7A8"/><rect x="200" y="520" width="80" height="26" rx="6" fill="#8E7B5C"/>
  </svg>`,
  'sizes': () => {
    const y0 = 700;
    const items = [
      { w: 70, label: 'Sticker', sub: '4 in' },
      { w: 120, label: 'Table tent', sub: '5 × 7 in' },
      { w: 250, label: 'Poster', sub: '18 × 24 in' },
    ];
    let x = 70; let g = '';
    for (const it of items) { const h = it.w * 1.38; g += card(x, y0 - h, it.w); g += `<text x="${x + it.w / 2}" y="${y0 + 42}" text-anchor="middle" font-family="DM Sans,Arial" font-weight="700" font-size="24" fill="#0B1D16">${it.label}</text><text x="${x + it.w / 2}" y="${y0 + 70}" text-anchor="middle" font-family="DM Sans,Arial" font-size="20" fill="#4B5E54">${it.sub}</text>`; x += it.w + 70; }
    g += card(x, y0 - 330, 1200 - x - 60, { tall: false });
    g += `<text x="${x + (1200 - x - 60) / 2}" y="${y0 + 42}" text-anchor="middle" font-family="DM Sans,Arial" font-weight="700" font-size="24" fill="#0B1D16">Banner</text><text x="${x + (1200 - x - 60) / 2}" y="${y0 + 70}" text-anchor="middle" font-family="DM Sans,Arial" font-size="20" fill="#4B5E54">3 × 6 ft · nets, fences, boards</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#F5F8F6"/><path d="M40 ${y0} H1160" stroke="#CFD9D3" stroke-width="3"/><text x="1160" y="60" text-anchor="end" font-family="DM Sans,Arial" font-size="20" fill="#6B7C72">Not to scale</text>${g}</svg>`;
  },
};
for (const [name, fn] of Object.entries(scenes)) fs.writeFileSync(path.join(out, `${name}.svg`), fn());
console.log('built', Object.keys(scenes).join(', '));
