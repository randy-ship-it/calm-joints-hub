const assert = require('assert');
const fs = require('fs');
const E = require('../js/enterprise-estimate.js');

function check(patients, sessions, net, contribution, perPatient) {
  const out = E.estimate({ patients: patients, sessions: sessions, netPerSession: net, period: 'month' });
  assert.strictEqual(out.contribution, contribution, patients + '×' + sessions + '×' + net);
  assert.strictEqual(out.perPatient, perPatient, 'per patient ' + sessions + '×' + net);
  assert.strictEqual(out.perPatient, sessions * net);
  assert.strictEqual(out.contribution, patients * out.perPatient);
  if (patients !== 1) assert.notStrictEqual(out.perPatient, out.contribution);
}

check(0, 4, 25, 0, 100);
check(0, 8, 40, 0, 320);
check(0, 6, 30, 0, 180);
check(1000, 4, 25, 100000, 100);
check(1000, 8, 40, 320000, 320);
check(1000, 4, 40, 160000, 160);
check(1000, 8, 25, 200000, 200);
check(2500, 6, 32, 480000, 192);

assert.strictEqual(E.estimate({ patients: 10, sessions: 3, netPerSession: 10 }).sessions, 4);
assert.strictEqual(E.estimate({ patients: 10, sessions: 3, netPerSession: 10 }).netPerSession, 25);
assert.strictEqual(E.estimate({ patients: 10, sessions: 9, netPerSession: 99 }).sessions, 8);
assert.strictEqual(E.estimate({ patients: 10, sessions: 9, netPerSession: 99 }).netPerSession, 40);
assert.strictEqual(E.estimate({ patients: -5, sessions: 4, netPerSession: 25 }).patients, 0);
assert.strictEqual(E.estimate({ patients: -5, sessions: 4, netPerSession: 25 }).contribution, 0);

const example = E.estimate({ patients: 1000, sessions: 6, netPerSession: 30, period: 'month' });
assert.strictEqual(example.perPatient, 180);
assert.strictEqual(example.contribution, 180000);
assert.notStrictEqual(example.contribution, example.perPatient * example.sessions);

const page = fs.readFileSync('enterprise.html', 'utf8');
assert.ok(page.includes('/js/enterprise-estimate.js'));
assert.ok(page.includes('Illustrative'));
assert.ok(page.includes('Early internal calling results'));
assert.ok(page.includes('Randy-reported internal pilot'));
assert.ok(page.includes('not an independent benchmark'));
assert.ok(/Store payouts are separate/.test(page));
assert.ok(!page.includes('one of the only'));

console.log('enterprise estimate ok');
console.log('example 1,000 patients × 6 sessions × $30 = $' + example.contribution + '; per patient $' + example.perPatient);
console.log('bounds 0×4×$25 per patient $100 contribution $0');
console.log('bounds 1,000×4×$25 = $100,000; per patient $100');
console.log('bounds 1,000×8×$40 = $320,000; per patient $320');
console.log('bounds 1,000×4×$40 = $160,000; 1,000×8×$25 = $200,000');
