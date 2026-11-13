import test from 'node:test';
import assert from 'node:assert/strict';
import { refusalOf } from '../src/lib/refusal.ts';

// The shape NEAR RPC returns for a function call that panicked.
const panicked = (msg: string) => ({
  status: { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: `Smart contract panicked: ${msg}` } } } } },
  receipts_outcome: [{ outcome: { status: { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: `Smart contract panicked: ${msg}` } } } } } } }],
});

test('a panic is reported in the contract own words', () => {
  assert.equal(refusalOf(panicked('game is not sealed')), 'game is not sealed');
  assert.equal(refusalOf(panicked('move and salt do not match the commit')), 'move and salt do not match the commit');
});

test('a successful call is not a refusal', () => {
  assert.equal(refusalOf({ status: { SuccessValue: '' }, receipts_outcome: [{ outcome: { status: { SuccessValue: '' } } }] }), null);
  assert.equal(refusalOf({}), null);
});

test('a failure in a later receipt is still found', () => {
  const r = { status: { SuccessReceiptId: 'x' }, receipts_outcome: [{ outcome: { status: { SuccessValue: '' } } }, panicked('only the player').receipts_outcome[0]] };
  assert.equal(refusalOf(r), 'only the player');
});

test('a failure that is not a panic is reported, not hidden', () => {
  const r = { status: { Failure: { ActionError: { index: 0, kind: { AccountDoesNotExist: { account_id: 'nobody.testnet' } } } } } };
  assert.match(refusalOf(r) ?? '', /AccountDoesNotExist/);
});
