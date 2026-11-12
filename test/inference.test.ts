import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cannedLine, costYocto, parseDecimal, parseModelReply, signRead, verifyRead, NEUTRAL } from '../core/inference.ts';

const P = { prompt: '0.00000004', completion: '0.00000135' }; // $0.04 and $1.35 per million tokens

test('parseDecimal is exact and rejects junk', () => {
  assert.equal(parseDecimal('0.00001'), 10000000n);
  assert.equal(parseDecimal('2'), 2000000000000n);
  assert.throws(() => parseDecimal('1e-5'));
  assert.throws(() => parseDecimal('-1'));
});

test('cost: 1M prompt tokens at $0.04 is $0.04 = 0.04/3 NEAR, rounded up', () => {
  const y = costYocto({ prompt_tokens: 1_000_000, completion_tokens: 0 }, P);
  assert.ok(y >= 13_333_333_333_333_333_333_333n && y <= 13_333_333_333_333_333_333_334n, y.toString());
});

test('cost never rounds down to zero for a real reply and is monotonic', () => {
  const small = costYocto({ prompt_tokens: 1, completion_tokens: 0 }, P);
  const bigger = costYocto({ prompt_tokens: 300, completion_tokens: 120 }, P);
  assert.ok(small > 0n);
  assert.ok(bigger > small);
  // 300*0.04e-6 + 120*1.35e-6 = $0.000174 -> /3 -> 5.8e-5 NEAR
  assert.ok(bigger >= 57_999_999_999_999_999_999n && bigger <= 58_000_000_000_000_000_001n, bigger.toString());
});

test('model reply parsing bounds the read and survives junk', () => {
  const ok = parseModelReply('Sure! {"line":"Deal.","read":{"promise":0.9,"threat":0,"sincerity":0.7}}');
  assert.deepEqual(ok, { line: 'Deal.', read: { promiseBps: 9000, threatBps: 0, sincerityBps: 7000 } });
  const wild = parseModelReply('{"line":"x","read":{"promise":99,"threat":-5,"sincerity":"high"}}');
  assert.deepEqual(wild!.read, { promiseBps: 10000, threatBps: 0, sincerityBps: 0 });
  assert.equal(parseModelReply('no json here'), null);
  assert.equal(parseModelReply('{"line":"","read":{}}'), null);
  assert.equal(parseModelReply('{"line": 5}'), null);
});

test('signed read: verifies, and fails when any field or the game id changes', () => {
  const r = { promiseBps: 9000, threatBps: 0, sincerityBps: 7000 };
  const sig = signRead('s3cret', 7, r);
  assert.equal(verifyRead('s3cret', 7, r, sig), true);
  assert.equal(verifyRead('s3cret', 8, r, sig), false);
  assert.equal(verifyRead('s3cret', 7, { ...r, sincerityBps: 10000 }, sig), false);
  assert.equal(verifyRead('other', 7, r, sig), false);
  assert.equal(verifyRead('s3cret', 7, r, 'zz'), false);
});

test('every character has a canned line and neutral read is all zero', () => {
  for (const n of ['Mabel', 'Otis', 'Fenn', 'Prue', 'Dice', 'Abacus']) assert.ok(cannedLine(n, 3).length > 5);
  assert.deepEqual(NEUTRAL, { promiseBps: 0, threatBps: 0, sincerityBps: 0 });
});
