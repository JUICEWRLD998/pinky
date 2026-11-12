import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, decide, moveFor, NEUTRAL_READ, type PolicyInputs } from '../core/policy.ts';
import { commitFor, drawBps, saltFor } from '../core/rng.ts';
import { auditGame, recordedFacts, type AuditConfig, type AuditGame } from '../core/audit.ts';

const cfg: AuditConfig = { y_max_bps: 5000, drip: 40 };
const SECRET = 'ab'.repeat(32);
const otis = CHARACTERS.find((c) => c.name === 'Otis')!;
const mabel = CHARACTERS.find((c) => c.name === 'Mabel')!;

/** Build a game exactly the way the server would settle it, so the genuine fixture must PASS. */
function genuine(id: number, jar = '2000000000000000000000000', bal = '390000000000000000000000'): AuditGame {
  const g: AuditGame = {
    id, character: 'otis.x.testnet', stake: '10000000000000000000000', status: 'Settled', epoch: 1, commit: null, snapshot: null,
    jar_at_seal: jar, char_balance_at_seal: bal, character_move: null, outcome: { kind: 'both_keep' },
  };
  const f = recordedFacts(g, cfg);
  const inputs: PolicyInputs = {
    vsPlayer: { games: 1, playerKeeps: 1, playerBreaks: 0, lastPlayerMove: 'KEEP', apologyPaid: false },
    record: { games: 1, keepRateBps: 10000 }, strangerBreakRateBps: 2000, stakeBps: f.stakeBps, jarRateBps: f.jarRateBps, read: NEUTRAL_READ,
  };
  const d = decide(otis, inputs);
  const move = moveFor(d.pKeepBps, drawBps(SECRET, String(id)));
  g.snapshot = JSON.stringify({ v: 1, inputs, pKeepBps: d.pKeepBps, open: d.open });
  g.character_move = move;
  g.commit = commitFor(String(id), move, saltFor(SECRET, String(id)));
  return g;
}

test('a genuine game passes every check', () => {
  for (let id = 1; id <= 40; id++) {
    const a = auditGame(genuine(id), otis, SECRET, cfg);
    assert.equal(a.verdict, 'PASS', JSON.stringify(a.checks.filter((c) => !c.ok)));
  }
});

test('planted control: a flipped revealed move prints FAIL', () => {
  const g = genuine(3);
  g.character_move = g.character_move === 'KEEP' ? 'BREAK' : 'KEEP';
  const a = auditGame(g, otis, SECRET, cfg);
  assert.equal(a.verdict, 'FAIL');
  assert.ok(a.checks.some((c) => !c.ok && c.name.includes('revealed move')));
});

test('planted control: a snapshot with a rigged chance of keeping prints FAIL', () => {
  const g = genuine(4);
  const s = JSON.parse(g.snapshot!); s.pKeepBps = 10000; g.snapshot = JSON.stringify(s);
  const a = auditGame(g, otis, SECRET, cfg);
  assert.equal(a.verdict, 'FAIL');
  assert.ok(a.checks.some((c) => !c.ok && c.name.includes('chance of keeping')));
});

test('planted control: a snapshot that lies about the bankroll or the Jar prints FAIL', () => {
  const g = genuine(5);
  const s = JSON.parse(g.snapshot!); s.inputs.stakeBps = 1; s.inputs.jarRateBps = 9999; g.snapshot = JSON.stringify(s);
  const a = auditGame(g, otis, SECRET, cfg);
  assert.equal(a.verdict, 'FAIL');
  assert.equal(a.checks.filter((c) => !c.ok && /recorded/.test(c.name)).length, 2);
});

test('planted control: a wrong epoch secret or a forged commit prints FAIL', () => {
  assert.equal(auditGame(genuine(6), otis, 'cd'.repeat(32), cfg).verdict, 'FAIL');
  const g = genuine(7); g.commit = '0'.repeat(64);
  assert.equal(auditGame(g, otis, SECRET, cfg).verdict, 'FAIL');
});

test('an unrevealed secret fails, a timeout is skipped, an unfinished game is skipped', () => {
  assert.equal(auditGame(genuine(8), otis, null, cfg).verdict, 'FAIL');
  const t = genuine(9); t.outcome = { kind: 'character_timeout' };
  assert.equal(auditGame(t, otis, SECRET, cfg).verdict, 'SKIP');
  const u = genuine(10); u.status = 'Sealed';
  assert.equal(auditGame(u, otis, SECRET, cfg).verdict, 'SKIP');
});

test('a refusal passes only when the policy really closes the door', () => {
  const g = genuine(11);
  const s = JSON.parse(g.snapshot!);
  s.inputs.vsPlayer = { games: 1, playerKeeps: 0, playerBreaks: 1, lastPlayerMove: 'BREAK', apologyPaid: false };
  const d = decide(mabel, s.inputs);
  assert.equal(d.open, false);
  g.snapshot = JSON.stringify({ v: 1, inputs: s.inputs, pKeepBps: 0, open: false });
  g.outcome = { kind: 'refused' };
  g.char_balance_at_seal = '0'; g.jar_at_seal = '0'; g.commit = null; g.character_move = null; // as the contract leaves them after a refusal
  assert.equal(auditGame(g, mabel, SECRET, cfg).verdict, 'PASS');
  const lie = genuine(12); lie.outcome = { kind: 'refused' };
  assert.equal(auditGame(lie, otis, SECRET, cfg).verdict, 'FAIL');
});
