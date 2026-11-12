// Live end-to-end check on testnet. One guest plays several games against Otis, then bad calls are tried.
// Every check prints PASS or FAIL; exit code 1 on any FAIL. Run from app/:  npm run e2e
import { KeyPair, getTransactionLastResult } from 'near-api-js';
import { CHARACTERS, decide, moveFor } from '../../core/policy.ts';
import { drawBps } from '../../core/rng.ts';
import { GAME, GUEST_GAS, OTIS, milli, signerAccount, view, type GameView, type Move } from '../server/chain.ts';
import { revealGame, sealGame } from '../server/otis.ts';
import { usherGuest } from '../server/usher.ts';

let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
async function refused(name: string, f: () => Promise<unknown>, needle: string) {
  try { await f(); ok(name, false, 'call succeeded but should have been refused'); }
  catch (e) { const m = (e as Error).message + JSON.stringify((e as { kind?: unknown }).kind ?? ''); ok(name, m.includes(needle), m.includes(needle) ? '' : m.slice(0, 160)); }
}

// Planted control: the refusal checker must flag a call that succeeds, or the checks below prove nothing.
{ const before = fails; const log = console.log; console.log = () => {}; await refused('control', async () => 1, 'x'); console.log = log; const flagged = fails === before + 1; fails = before; ok('planted control: refused() flags a call that succeeds', flagged); }

const kp = KeyPair.fromRandom('ed25519');
const guest = await usherGuest(kp.getPublicKey().toString());
const me = signerAccount(guest.account_id, kp.toString());
const call = (method: string, args: object, gas = GUEST_GAS) => me.callFunctionRaw({ contractId: GAME, methodName: method, args, gas });
const stake = milli(10);
const spec = CHARACTERS.find((c) => c.name === 'Otis')!;
const secret = process.env.OTIS_EPOCH_SECRET!;

async function game(move: Move) {
  const o = await call('open_game', { character: OTIS, stake: stake.toString() });
  const id = Number(getTransactionLastResult(o));
  const s = await sealGame(id);
  await call('play', { game_id: id, player_move: move });
  const r = await revealGame(id);
  const g = await view<GameView>('get_game', { game_id: id });
  return { id, g, s, r };
}

const ids: number[] = [];
// 1. Mirror memory: first game strangers, then Otis copies what we did last.
const g1 = await game('KEEP'); ids.push(g1.id);
ok('game 1 settles', g1.g.status === 'Settled', g1.g.outcome?.kind);
const g2 = await game('BREAK'); ids.push(g2.id);
ok('game 2 settles', g2.g.status === 'Settled', g2.g.outcome?.kind);
const snap2 = JSON.parse(g2.g.snapshot!);
ok('after our KEEP, Otis pKeep is 9000', snap2.pKeepBps === 9000, String(snap2.pKeepBps));
const g3 = await game('KEEP'); ids.push(g3.id);
const snap3 = JSON.parse(g3.g.snapshot!);
ok('after our BREAK, Otis pKeep is 1000', snap3.pKeepBps === 1000, String(snap3.pKeepBps));

// 2. Replay every decision from the public policy and the snapshot: the audit in miniature.
for (const x of [g1, g2, g3]) {
  const snap = JSON.parse(x.g.snapshot!);
  const d = decide(spec, snap.inputs);
  const move = moveFor(d.pKeepBps, drawBps(secret, String(x.id)));
  ok(`game ${x.id}: decision replays from snapshot`, d.pKeepBps === snap.pKeepBps && move === x.g.character_move, `${move}`);
}

// 3. Money: payouts match the rules, every game conserves value.
for (const x of [g1, g2, g3]) {
  const o = x.g.outcome!;
  const total = BigInt(o.player_payout) + BigInt(o.character_payout) + BigInt(o.house) + BigInt(o.jar_delta);
  ok(`game ${x.id}: payouts + house + jar_delta = 2 stakes`, total === stake * 2n, o.kind);
}
const sv = await view<{ account_balance: string; total_held: string }>('solvency');
ok('contract solvent: account balance >= total owed', BigInt(sv.account_balance) >= BigInt(sv.total_held));

// 4. Bad calls must be refused by the chain.
const o4 = await call('open_game', { character: OTIS, stake: stake.toString() });
const id4 = Number(getTransactionLastResult(o4));
await refused('play before seal is refused', () => call('play', { game_id: id4, player_move: 'KEEP' }), 'not sealed');
await refused('a guest cannot seal for Otis', () => call('seal', { game_id: id4, commit: '0'.repeat(64), snapshot: '{}' }), 'Access');
await sealGame(id4);
await refused('second seal is refused', () => sealGame(id4), 'not waiting for a seal');
await refused('reveal before play is refused', () => revealGame(id4), 'not waiting for a reveal');
await call('play', { game_id: id4, player_move: 'KEEP' });
await refused('second play is refused', () => call('play', { game_id: id4, player_move: 'BREAK' }), 'not sealed');
await refused('wrong salt is refused', () => signerAccount(OTIS, process.env.OTIS_KEY).callFunctionRaw({ contractId: GAME, methodName: 'reveal', args: { game_id: id4, character_move: 'KEEP', salt: 'a'.repeat(64) } }), 'do not match');
await refused('claim_timeout inside the window is refused', () => call('claim_timeout', { game_id: id4 }), 'still open');
const r4 = await revealGame(id4); ids.push(id4);
ok(`game ${id4} settles after refusals`, (await view<GameView>('get_game', { game_id: id4 })).status === 'Settled', r4.move);
await refused('reveal twice is refused', () => revealGame(id4), 'not waiting for a reveal');

// 5. Key scope: the guest key cannot reach methods outside its list, nor another contract.
await refused('guest key cannot call deposit_for', () => call('deposit_for', { account_id: guest.account_id }), 'Access');
await refused('guest key cannot call pay_inference', () => call('pay_inference', { amount: '1', memo: 'x' }), 'Access');
await refused('guest key cannot send NEAR', () => me.transfer({ receiverId: OTIS, amount: 1n }), 'Access');

// 6. A guest can cash out through the key it holds.
const before = BigInt(await view<string>('get_balance', { account_id: guest.account_id }));
ok('guest has chips left to withdraw', before > 0n, before.toString());
await call('withdraw', { amount: milli(5).toString() });
await new Promise((r) => setTimeout(r, 4000));
const after = BigInt(await view<string>('get_balance', { account_id: guest.account_id }));
ok('withdraw lowers the ledger balance', after === before - milli(5), `${before} -> ${after}`);

// 7. Contract views the UI relies on.
const rec = await view<{ games: number; keeps: number }>('get_record', { account_id: guest.account_id });
ok('record counts settled games', rec.games >= 4, JSON.stringify(rec));
console.log(`\nGames played: ${ids.join(', ')}. ${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`);
process.exit(fails ? 1 : 0);
