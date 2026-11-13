import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, NEUTRAL_READ, READ_MAX_BPS, decide, moveFor, readAdjustBps } from '../core/policy.ts';
import type { PolicyInputs } from '../core/policy.ts';
import { mulberry32 } from '../core/rng.ts';

const by = (n: string) => CHARACTERS.find((c) => c.name === n)!;
const fresh = (over: Partial<PolicyInputs> = {}): PolicyInputs => ({
  vsPlayer: { games: 0, playerKeeps: 0, playerBreaks: 0, lastPlayerMove: null, apologyPaid: false },
  record: { games: 0, keepRateBps: 5000 },
  strangerBreakRateBps: 3000,
  stakeBps: 500,
  jarRateBps: 3000,
  read: NEUTRAL_READ,
  ...over,
});

test('six characters with unique names', () => {
  assert.equal(CHARACTERS.length, 6);
  assert.equal(new Set(CHARACTERS.map((c) => c.name)).size, 6);
});

test('decisions are deterministic', () => {
  for (const c of CHARACTERS) assert.deepEqual(decide(c, fresh()), decide(c, fresh()));
});

test('pKeep is always an integer in 0..10000 over random inputs', () => {
  const r = mulberry32(3);
  for (let i = 0; i < 5000; i++) {
    const games = Math.floor(r() * 30);
    const keeps = Math.floor(r() * (games + 1));
    const inp = fresh({
      vsPlayer: { games, playerKeeps: keeps, playerBreaks: games - keeps, lastPlayerMove: games ? (r() < 0.5 ? 'KEEP' : 'BREAK') : null, apologyPaid: r() < 0.2 },
      record: { games: games + Math.floor(r() * 20), keepRateBps: Math.floor(r() * 10001) },
      strangerBreakRateBps: Math.floor(r() * 10001),
      stakeBps: Math.floor(r() * 10001),
      jarRateBps: Math.floor(r() * 5001),
      read: { promiseBps: Math.floor(r() * 10001), threatBps: Math.floor(r() * 10001), sincerityBps: Math.floor(r() * 10001) },
    });
    for (const c of CHARACTERS) {
      const d = decide(c, inp);
      assert.ok(Number.isInteger(d.pKeepBps) && d.pKeepBps >= 0 && d.pKeepBps <= 10000, `${c.name} ${d.pKeepBps}`);
      assert.ok(d.reason.length > 0);
    }
  }
});

test('the chat read moves pKeep by at most 1000 bps, and Dice ignores it', () => {
  const best = { promiseBps: 10000, threatBps: 0, sincerityBps: 10000 };
  const worst = { promiseBps: 0, threatBps: 10000, sincerityBps: 0 };
  assert.equal(readAdjustBps(best), READ_MAX_BPS);
  assert.equal(readAdjustBps(worst), -READ_MAX_BPS);
  for (const c of CHARACTERS) {
    const hi = decide(c, fresh({ read: best }));
    const lo = decide(c, fresh({ read: worst }));
    if (!hi.open) continue;
    assert.ok(hi.pKeepBps - lo.pKeepBps <= 2 * READ_MAX_BPS, c.name);
    if (c.kind === 'coin') assert.equal(hi.pKeepBps, lo.pKeepBps);
  }
});

test('Mabel closes after one break and reopens after an apology', () => {
  const broke = fresh({ vsPlayer: { games: 1, playerKeeps: 0, playerBreaks: 1, lastPlayerMove: 'BREAK', apologyPaid: false } });
  assert.equal(decide(by('Mabel'), broke).open, false);
  const paid = fresh({ vsPlayer: { ...broke.vsPlayer, apologyPaid: true } });
  const d = decide(by('Mabel'), paid);
  assert.equal(d.open, true);
  assert.equal(d.pKeepBps, 3000);
});

test('Otis mirrors the last move', () => {
  const k = decide(by('Otis'), fresh({ vsPlayer: { games: 1, playerKeeps: 1, playerBreaks: 0, lastPlayerMove: 'KEEP', apologyPaid: false } }));
  const b = decide(by('Otis'), fresh({ vsPlayer: { games: 1, playerKeeps: 0, playerBreaks: 1, lastPlayerMove: 'BREAK', apologyPaid: false } }));
  assert.ok(k.pKeepBps > 8000 && b.pKeepBps < 2000);
});

test('Fenn leans to break on a big stake and a thin Jar', () => {
  const calm = decide(by('Fenn'), fresh({ stakeBps: 200, jarRateBps: 4000 }));
  const risky = decide(by('Fenn'), fresh({ stakeBps: 3000, jarRateBps: 500 }));
  assert.ok(risky.pKeepBps < calm.pKeepBps - 4000);
});

test('doors close on a bad record, and an apology overrides', () => {
  const bad = fresh({ record: { games: 12, keepRateBps: 500 } });
  assert.equal(decide(by('Mabel'), bad).open, false);
  assert.equal(decide(by('Prue'), bad).open, false);
  assert.equal(decide(by('Fenn'), bad).open, true);
  const paid = fresh({ record: { games: 12, keepRateBps: 500 }, vsPlayer: { games: 0, playerKeeps: 0, playerBreaks: 0, lastPlayerMove: null, apologyPaid: true } });
  assert.equal(decide(by('Prue'), paid).open, true);
});

test('Abacus keeps more as the relationship and the Jar grow', () => {
  const young = decide(by('Abacus'), fresh({ jarRateBps: 500 }));
  const old = decide(by('Abacus'), fresh({ jarRateBps: 5000, vsPlayer: { games: 10, playerKeeps: 10, playerBreaks: 0, lastPlayerMove: 'KEEP', apologyPaid: false }, record: { games: 10, keepRateBps: 10000 } }));
  assert.ok(old.pKeepBps > young.pKeepBps + 2000);
});

test('moveFor: keep when the draw is below pKeep', () => {
  assert.equal(moveFor(5000, 4999), 'KEEP');
  assert.equal(moveFor(5000, 5000), 'BREAK');
  assert.equal(moveFor(0, 0), 'BREAK');
  assert.equal(moveFor(10000, 9999), 'KEEP');
});

// ---- outside agents: the on-chain policy string becomes a CharacterSpec, or is rejected ----
import { parseAgentPolicy } from '../core/policy.ts';

const asPolicy = (c: { kind: string; doorMinKeepBps: number; params: Record<string, number> }) =>
  JSON.stringify({ kind: c.kind, doorMinKeepBps: c.doorMinKeepBps, params: c.params });

test('parseAgentPolicy accepts every built-in character policy and decides identically', () => {
  for (const c of CHARACTERS) {
    const spec = parseAgentPolicy(asPolicy(c), c.name);
    assert.deepEqual(decide(spec, fresh()), decide(c, fresh()), c.name);
  }
});

test('parseAgentPolicy rejects bad policies (planted failures)', () => {
  const good = { kind: 'saint', doorMinKeepBps: 0, params: { keepBps: 9800 } };
  assert.doesNotThrow(() => parseAgentPolicy(asPolicy(good), 'ok'));
  const bad: [string, string][] = [
    ['not json', '{nope'],
    ['unknown kind', asPolicy({ ...good, kind: 'wizard' })],
    ['missing param', asPolicy({ ...good, params: {} })],
    ['extra param', asPolicy({ ...good, params: { keepBps: 9800, sneaky: 1 } })],
    ['param above 10000', asPolicy({ ...good, params: { keepBps: 10001 } })],
    ['negative param', asPolicy({ ...good, params: { keepBps: -1 } })],
    ['fractional param', asPolicy({ ...good, params: { keepBps: 99.5 } })],
    ['door above 10000', asPolicy({ ...good, doorMinKeepBps: 10001 })],
    ['firstMin above firstMax', asPolicy({ kind: 'mirror', doorMinKeepBps: 0, params: { firstMaxBps: 2000, firstMinBps: 3000, afterKeepBps: 9000, afterBreakBps: 1000 } })],
  ];
  for (const [why, p] of bad) assert.throws(() => parseAgentPolicy(p, 'x'), undefined, why);
  assert.throws(() => parseAgentPolicy(asPolicy(good), 'bad name!'), undefined, 'name with spaces and punctuation');
});
