// One-tap share + Glen/Gwen guide config checks.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const ctx = { window: {}, navigator: { userAgent: 'test', maxTouchPoints: 0 }, location: { pathname: '/chat' } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('config.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('js/share.js', 'utf8'), ctx);
const S = ctx.window.CJShare;
assert.strictEqual(S.url, 'https://calmjoints.org/chat?src=share');
const ios = S.smsHref(true), android = S.smsHref(false);
assert.ok(ios.startsWith('sms:&body='), ios);
assert.ok(android.startsWith('sms:?body='), android);
for (const h of [ios, android]) {
  const body = h.replace(/^sms:[&?]body=/, '');
  assert.ok(!/[\s&?#]/.test(body), 'body must be URL-encoded: ' + body);
  assert.ok(decodeURIComponent(body).includes('https://calmjoints.org/chat?src=share'));
  const dec = decodeURIComponent(body);
  assert.ok(/24\/7/.test(dec));
  assert.strictEqual(dec.split('https://calmjoints.org/chat?src=share').length, 2, 'link appears exactly once');
  assert.ok(dec.startsWith('Hey, sending you this in case it helps.'), dec);
  assert.ok(dec.endsWith(' Or text Glen at (647) 692-6575.'), dec);
  assert.ok(!/(guarantee|diagnos|cure)/i.test(dec), 'no guarantee/diagnosis claims');
}
// Web Share: text only (link once), no url field (doubles on iOS/Android), no title (stray text in Messages).
const pl = JSON.parse(JSON.stringify(S.payload()));
assert.deepStrictEqual(Object.keys(pl), ['text']);
assert.strictEqual(pl.text, S.message);
assert.strictEqual(pl.text.split('https://').length, 2);
// Text Glen line
assert.ok(S.html().includes('href="sms:+16476926575"') && S.html().includes('Text Glen: <b>(647) 692-6575</b>'));
assert.ok(!S.html({ textGuide: false }).includes('data-cjs-textguide'));
assert.ok(S.isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5));
assert.ok(S.isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), 'iPadOS desktop UA');
assert.ok(!S.isIOS('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 5));
assert.ok(/Know somebody with an injury\?/.test(S.html()));
assert.ok(S.html().includes('sms:') && S.html().includes('Copy message'));

const g = ctx.window.CALM_JOINTS.guide;
assert.strictEqual(g.defaultGuide, 'glen');
assert.strictEqual(g.guides.glen.name, 'Glen');
assert.strictEqual(g.guides.gwen.name, 'Gwen');
assert.strictEqual(g.guides.glen.agentId, 'agent_8401m48tn2g5ehwsa0p84e8pnaf8');
assert.strictEqual(g.guides.gwen.agentId, 'agent_8701m49rk5stf07avtka9ef8nvs0');
assert.deepStrictEqual(JSON.parse(JSON.stringify(g.aliases)), { randy: 'glen', emma: 'gwen' });

for (const f of ['chat.html', 'js/guide.js', 'css/guide.css', 'js/share.js']) {
  const src = fs.readFileSync(f, 'utf8');
  assert.ok(!/Talk with (Randy|Emma)|I’m (Randy|Emma)/.test(src), f + ' still shows an old guide name');
  assert.ok(!/\b(CHI|Clairvoyant|Align|Jane|Scale|Birch|BirchReserve|Silver Birch)\b/.test(src), f + ' has a name that must not reach visitors');
}
console.log('share + guide-name tests ok');
