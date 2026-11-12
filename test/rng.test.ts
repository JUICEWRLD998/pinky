import test from 'node:test';
import assert from 'node:assert/strict';
import { commitFor, drawBps, epochCommit, moveForCommit, mulberry32, saltFor } from '../core/rng.ts';

const SECRET = 'a1'.repeat(32);

test('mulberry32 is deterministic and in range', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(mulberry32(7)(), mulberry32(8)());
});

test('drawBps is deterministic, in 0..9999, and roughly uniform', () => {
  assert.equal(drawBps(SECRET, 'g1'), drawBps(SECRET, 'g1'));
  assert.notEqual(drawBps(SECRET, 'g1'), drawBps(SECRET, 'g2'));
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 20000; i++) {
    const d = drawBps(SECRET, `game-${i}`);
    assert.ok(Number.isInteger(d) && d >= 0 && d < 10000);
    buckets[Math.floor(d / 1000)]++;
  }
  for (const n of buckets) assert.ok(n > 1800 && n < 2200, `bucket ${n} off`);
});

test('a different secret gives different draws', () => {
  assert.notEqual(drawBps(SECRET, 'g1') + drawBps(SECRET, 'g2'), drawBps('b2'.repeat(32), 'g1') + drawBps('b2'.repeat(32), 'g2'));
});

test('commit binds game, move and salt', () => {
  const salt = saltFor(SECRET, 'g1');
  const k = commitFor('g1', 'KEEP', salt);
  assert.equal(k, commitFor('g1', 'KEEP', salt));
  assert.notEqual(k, commitFor('g1', 'BREAK', salt));
  assert.notEqual(k, commitFor('g2', 'KEEP', salt));
  assert.notEqual(k, commitFor('g1', 'KEEP', saltFor(SECRET, 'g2')));
  assert.match(k, /^[0-9a-f]{64}$/);
});

test('moveForCommit recovers the committed move and rejects a wrong salt', () => {
  const salt = saltFor(SECRET, 'g9');
  assert.equal(moveForCommit('g9', salt, commitFor('g9', 'BREAK', salt)), 'BREAK');
  assert.equal(moveForCommit('g9', salt, commitFor('g9', 'KEEP', salt)), 'KEEP');
  assert.equal(moveForCommit('g9', saltFor(SECRET, 'other'), commitFor('g9', 'KEEP', salt)), null);
});

test('epoch commit is the sha256 of the secret bytes', () => {
  assert.match(epochCommit(SECRET), /^[0-9a-f]{64}$/);
  assert.notEqual(epochCommit(SECRET), epochCommit('b2'.repeat(32)));
});
