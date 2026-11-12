// Live check of all six characters: each one talks (and pays for the reply on chain), seals, reveals, and the
// house balance rises by exactly what the characters paid. Run from app/:  npm run e2e:characters
import { KeyPair, getTransactionLastResult } from 'near-api-js';
import { CHARACTERS } from '../../core/policy.ts';
import { verifyRead } from '../../core/inference.ts';
import { GAME, GUEST_GAS, milli, signerAccount, view, type GameView } from '../server/chain.ts';
import { accountOf, revealGame, sealGame } from '../server/characters.ts';
import { readSecret, talk } from '../server/talk.ts';
import { usherGuest } from '../server/usher.ts';

let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Our RPC node can trail the one that executed the last transaction: poll until the game is Settled. */
async function settled(id: number): Promise<GameView> {
  let g = await view<GameView>('get_game', { game_id: id });
  for (let i = 0; i < 20 && g.status !== 'Settled'; i++) { await sleep(500); g = await view<GameView>('get_game', { game_id: id }); }
  return g;
}

const kp = KeyPair.fromRandom('ed25519');
const guest = await usherGuest(kp.getPublicKey().toString());
const me = signerAccount(guest.account_id, kp.toString());
const house0 = BigInt(await view<string>('get_house_balance'));
let paidTotal = 0n;

for (const spec of CHARACTERS) {
  const account = accountOf(spec.name);
  const o = await me.callFunctionRaw({ contractId: GAME, methodName: 'open_game', args: { character: account, stake: milli(10).toString() }, gas: GUEST_GAS });
  const id = Number(getTransactionLastResult(o));
  const balBefore = BigInt(await view<string>('get_balance', { account_id: account }));
  const t = await talk(id, 'I will keep my word. You have my promise.');
  ok(`${spec.name}: replies with a line`, t.line.length > 3, t.line.slice(0, 60));
  ok(`${spec.name}: read is signed for this game only`, verifyRead(readSecret(), id, t.read, t.read_sig) && !verifyRead(readSecret(), id + 1, t.read, t.read_sig));
  if (t.paid) {
    paidTotal += BigInt(t.paid.yocto);
    await sleep(1500);
    const balAfter = BigInt(await view<string>('get_balance', { account_id: account }));
    ok(`${spec.name}: ledger fell by exactly the metered cost`, balBefore - balAfter === BigInt(t.paid.yocto), `${t.paid.yocto} yocto, tx ${t.paid.tx.slice(0, 8)}`);
    ok(`${spec.name}: memo names model and chat id`, t.paid.chat_id.length > 8);
  } else ok(`${spec.name}: no payment only in quiet mode or API failure`, t.quiet, 'reply was canned');
  const s = await sealGame(id, t.read);
  if (s.refused) { ok(`${spec.name}: door closed`, (await settled(id)).status === 'Settled', s.reason.slice(0, 50)); continue; }
  await me.callFunctionRaw({ contractId: GAME, methodName: 'play', args: { game_id: id, player_move: 'KEEP' }, gas: GUEST_GAS });
  const r = await revealGame(id);
  const g = await settled(id);
  ok(`${spec.name}: game settles`, g.status === 'Settled', `${g.outcome?.kind}, ${spec.name} played ${r.move}`);
  const snap = JSON.parse(g.snapshot!);
  ok(`${spec.name}: snapshot carries the signed read`, snap.inputs.read.promiseBps === t.read.promiseBps);
}
await sleep(2000);
const house1 = BigInt(await view<string>('get_house_balance'));
ok('house balance rose by at least what characters paid (rake adds more)', house1 - house0 >= paidTotal, `paid ${paidTotal}, rose ${house1 - house0}`);
const sv = await view<{ account_balance: string; total_held: string }>('solvency');
ok('contract still solvent', BigInt(sv.account_balance) >= BigInt(sv.total_held));
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
