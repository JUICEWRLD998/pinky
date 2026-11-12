// Open a game as a fresh guest, talk to a character, print the reply and the on-chain payment.
// Run from app/:  node --env-file=../.env scripts/talk-once.ts Mabel "I will keep my word, I promise."
import { KeyPair, getTransactionLastResult } from 'near-api-js';
import { GAME, GUEST_GAS, milli, signerAccount, view } from '../server/chain.ts';
import { accountOf } from '../server/characters.ts';
import { talk } from '../server/talk.ts';
import { usherGuest } from '../server/usher.ts';

const name = process.argv[2] ?? 'Otis';
const kp = KeyPair.fromRandom('ed25519');
const guest = await usherGuest(kp.getPublicKey().toString());
const me = signerAccount(guest.account_id, kp.toString());
const o = await me.callFunctionRaw({ contractId: GAME, methodName: 'open_game', args: { character: accountOf(name), stake: milli(10).toString() }, gas: GUEST_GAS });
const id = Number(getTransactionLastResult(o));
await new Promise((r) => setTimeout(r, 1500));
const before = BigInt(await view<string>('get_balance', { account_id: accountOf(name) }));
const t = await talk(id, process.argv[3] ?? 'I will keep my word, I promise.');
console.log(JSON.stringify(t, null, 2));
await new Promise((r) => setTimeout(r, 1500));
const after = BigInt(await view<string>('get_balance', { account_id: accountOf(name) }));
console.log('character ledger balance change (yocto):', (after - before).toString());
