import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PARAMS as P,
  bonus,
  checkConservation,
  jarRateBps,
  settle,
  settleCharacterTimeout,
  settlePlayerTimeout,
  total,
  validateParams,
} from '../core/payoff.ts';
import type { Move, Settlement } from '../core/payoff.ts';
import { mulberry32 } from '../core/rng.ts';

const UNIT = 1_000_000n;

function randomCases(n: number, seed: number) {
  const r = mulberry32(seed);
  const out: Array<{ stake: bigint; jar: bigint }> = [];
  for (let i = 0; i < n; i++) {
    const stake = BigInt(1 + Math.floor(r() * 5_000_000_000));
    const jar = r() < 0.2 ? 0n : BigInt(Math.floor(r() * 200_000_000_000));
    out.push({ stake, jar });
  }
  // edge cases: tiny stakes, odd numbers, empty and huge jars
  for (const stake of [1n, 2n, 3n, 7n, 49n, 99n, 101n, 12_345_679n]) {
    for (const jar of [0n, 1n, 39n, 40n, 41n, 1_000_003n, 10n ** 12n]) out.push({ stake, jar });
  }
  return out;
}

test('params validate', () => {
  validateParams(P);
  assert.throws(() => validateParams({ ...P, drip: 1n }));
  assert.throws(() => validateParams({ ...P, rakeBps: 9000n }));
});

test('conservation holds for 20,000 random cases and every move pair', () => {
  assert.equal(checkConservation(settle, P, randomCases(20_000, 1)), null);
});

test('planted control: a settle that leaks one unit is caught', () => {
  const leaky = (stake: bigint, a: Move, b: Move, jar: bigint, p = P): Settlement => {
    const s = settle(stake, a, b, jar, p);
    return a === 'BREAK' && b === 'BREAK' ? { ...s, jarDelta: s.jarDelta - 1n } : s;
  };
  const found = checkConservation(leaky, P, randomCases(50, 2));
  assert.notEqual(found, null);
  assert.match(String(found), /sum/);
});

test('planted control: a settle that overdraws the jar is caught', () => {
  const greedy = (stake: bigint, a: Move, b: Move, jar: bigint, p = P): Settlement => {
    if (a === 'KEEP' && b === 'KEEP') return { player: stake + jar + 1n, character: stake, jarDelta: -jar - 1n, house: 0n };
    return settle(stake, a, b, jar, p);
  };
  assert.match(String(checkConservation(greedy, P, [{ stake: UNIT, jar: 5n * UNIT }])), /jar goes negative/);
});

test('both keep: each gets stake plus bonus, jar pays for both', () => {
  const jar = 100n * UNIT;
  const s = settle(UNIT, 'KEEP', 'KEEP', jar, P);
  const b = bonus(UNIT, jar, P);
  assert.equal(s.player, UNIT + b);
  assert.equal(s.character, UNIT + b);
  assert.equal(s.jarDelta, -2n * b);
  assert.equal(s.house, 0n);
});

test('bonus is capped by yMax and by jar / drip', () => {
  assert.equal(bonus(UNIT, 10_000n * UNIT, P), UNIT / 2n); // yMax 50%
  assert.equal(bonus(UNIT, 4n * UNIT, P), (4n * UNIT) / 40n); // jar / 40
  assert.equal(bonus(UNIT, 0n, P), 0n);
});

test('jar rate in basis points', () => {
  assert.equal(jarRateBps(UNIT, 10_000n * UNIT, P), 5000n);
  assert.equal(jarRateBps(UNIT, 0n, P), 0n);
});

test('one breaks: breaker takes the pot minus rake, house takes rake', () => {
  const s = settle(UNIT, 'BREAK', 'KEEP', 50n * UNIT, P);
  assert.equal(s.house, (2n * UNIT * P.rakeBps) / 10000n);
  assert.equal(s.player, 2n * UNIT - s.house);
  assert.equal(s.character, 0n);
  assert.equal(s.jarDelta, 0n);
  const t = settle(UNIT, 'KEEP', 'BREAK', 50n * UNIT, P);
  assert.equal(t.character, 2n * UNIT - t.house);
  assert.equal(t.player, 0n);
});

test('both break: stakes minus rake fill the jar', () => {
  const s = settle(UNIT, 'BREAK', 'BREAK', 0n, P);
  assert.equal(s.player, 0n);
  assert.equal(s.character, 0n);
  assert.equal(s.jarDelta + s.house, 2n * UNIT);
  assert.ok(s.jarDelta > 0n);
});

test('timeouts conserve and favour the side that showed up', () => {
  const c = settleCharacterTimeout(UNIT);
  assert.equal(total(c), 2n * UNIT);
  assert.equal(c.player, 2n * UNIT);
  const p = settlePlayerTimeout(UNIT, P);
  assert.equal(total(p), 2n * UNIT);
  assert.equal(p.character, UNIT + (UNIT * P.forfeitBps) / 10000n);
});

test('rejects bad inputs', () => {
  assert.throws(() => settle(0n, 'KEEP', 'KEEP', 0n, P));
  assert.throws(() => settle(UNIT, 'KEEP', 'KEEP', -1n, P));
});
