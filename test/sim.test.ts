import test from 'node:test';
import assert from 'node:assert/strict';
import { settle } from '../core/payoff.ts';
import type { Move, Params, Settlement } from '../core/payoff.ts';
import { runSim } from '../sim/world.ts';

test('same seed gives identical results', () => {
  const a = runSim({ seed: 7, rounds: 3000 });
  const b = runSim({ seed: 7, rounds: 3000 });
  assert.deepEqual(a.summary, b.summary);
  assert.deepEqual(a.samples, b.samples);
});

test('different seeds differ', () => {
  assert.notDeepEqual(runSim({ seed: 1, rounds: 2000 }).summary.outcomes, runSim({ seed: 2, rounds: 2000 }).summary.outcomes);
});

test('money is conserved every round across 10,000 rounds', () => {
  for (const seed of [1, 2, 3]) assert.equal(runSim({ seed, rounds: 10000 }).summary.conservationOk, true, `seed ${seed}`);
});

test('planted control: a leaky settle makes the conservation invariant fail', () => {
  const leaky = (stake: bigint, a: Move, b: Move, jar: bigint, p: Params): Settlement => {
    const s = settle(stake, a, b, jar, p);
    return { ...s, house: s.house + 1n };
  };
  assert.equal(runSim({ seed: 1, rounds: 500, settleImpl: leaky }).summary.conservationOk, false);
});

test('breaking every time is a losing strategy, keeping is not', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = runSim({ seed, rounds: 10000 }).summary;
    const start = s.archetypeStart;
    assert.ok(s.archetypeFinal.alwaysBreak < start / 2n, `alwaysBreak seed ${seed}`);
    assert.ok(s.archetypeFinal.alwaysKeep > start, `alwaysKeep seed ${seed}`);
    assert.ok(s.archetypeFinal.alwaysKeep > s.archetypeFinal.alwaysBreak, `seed ${seed}`);
  }
});

test('the trust cycle exists: the Jar rate keeps crossing 30 percent', () => {
  const s = runSim({ seed: 7, rounds: 10000 }).summary;
  assert.ok(s.jarRateCrossings > 100, `crossings ${s.jarRateCrossings}`);
  assert.ok(s.jarMax > 0n && s.jarMin === 0n);
});

test('all four outcomes occur', () => {
  const o = runSim({ seed: 7, rounds: 10000 }).summary.outcomes;
  for (const k of ['KK', 'KB', 'BK', 'BB'] as const) assert.ok(o[k] > 500, k);
});
