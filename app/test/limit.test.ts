import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLimiter } from '../server/limit.ts';

test('allows up to max per key inside the window, then refuses', () => {
  let t = 0;
  const l = makeLimiter({ perKey: 3, global: 100, windowMs: 1000, now: () => t });
  assert.equal(l.check('a').ok, true);
  assert.equal(l.check('a').ok, true);
  assert.equal(l.check('a').ok, true);
  const r = l.check('a');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'per-key');
});

test('keys are independent', () => {
  const l = makeLimiter({ perKey: 1, global: 100, windowMs: 1000, now: () => 0 });
  assert.equal(l.check('a').ok, true);
  assert.equal(l.check('b').ok, true);
  assert.equal(l.check('a').ok, false);
});

test('the window slides: old hits expire', () => {
  let t = 0;
  const l = makeLimiter({ perKey: 1, global: 100, windowMs: 1000, now: () => t });
  assert.equal(l.check('a').ok, true);
  t = 999;
  assert.equal(l.check('a').ok, false);
  t = 1001;
  assert.equal(l.check('a').ok, true);
});

test('global cap stops many different keys', () => {
  const l = makeLimiter({ perKey: 5, global: 2, windowMs: 1000, now: () => 0 });
  assert.equal(l.check('a').ok, true);
  assert.equal(l.check('b').ok, true);
  const r = l.check('c');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'global');
});

test('a refused call does not use up quota', () => {
  let t = 0;
  const l = makeLimiter({ perKey: 1, global: 100, windowMs: 1000, now: () => t });
  l.check('a');
  for (let i = 0; i < 50; i++) l.check('a');
  t = 1001;
  assert.equal(l.check('a').ok, true);
});

test('planted control: with perKey 0 nothing is allowed', () => {
  const l = makeLimiter({ perKey: 0, global: 100, windowMs: 1000, now: () => 0 });
  assert.equal(l.check('a').ok, false);
});
