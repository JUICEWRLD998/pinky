// One-time Phase 3 setup on testnet: guests account, Otis account, Otis registered with an open epoch.
// Idempotent: skips what already exists. Writes new secrets to ../.env (gitignored), never prints them.
// Run from app/:  node --env-file=../.env scripts/setup.ts
import { appendFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { KeyPair } from 'near-api-js';
import { epochCommit } from '../../core/rng.ts';
import { GAME, GUESTS, OTIS, ROOT, milli, provider, signerAccount } from '../server/chain.ts';

const ENV = new URL('../../.env', import.meta.url);
const have = (name: string): boolean => new RegExp(`^${name}=.+`, 'm').test(readFileSync(ENV, 'utf8'));
const save = (name: string, value: string): void => appendFileSync(ENV, `${name}=${value}\n`);

async function exists(id: string): Promise<boolean> {
  try { await provider.viewAccount({ accountId: id }); return true; } catch { return false; }
}

const root = signerAccount(ROOT, process.env.ROOT_KEY);

// 1. A sub-account that creates guest accounts. Its key lives on the server (USHER_KEY).
if (!(await exists(GUESTS))) {
  const kp = KeyPair.fromRandom('ed25519');
  await root.createSubAccount({ accountOrPrefix: 'guests', publicKey: kp.getPublicKey().toString(), nearToTransfer: milli(1500) });
  save('USHER_KEY', kp.toString());
  console.log('created', GUESTS);
}

// 2. Otis: a sub-account with its own balance and a key the server holds.
if (!(await exists(OTIS))) {
  const kp = KeyPair.fromRandom('ed25519');
  await root.createSubAccount({ accountOrPrefix: 'otis', publicKey: kp.getPublicKey().toString(), nearToTransfer: milli(900) });
  save('OTIS_KEY', kp.toString());
  console.log('created', OTIS);
}

// 3. Epoch secret for Otis. The server derives every draw and salt from it.
if (!have('OTIS_EPOCH_SECRET')) save('OTIS_EPOCH_SECRET', randomBytes(32).toString('hex'));
const env = Object.fromEntries(readFileSync(ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

const otis = signerAccount(OTIS, env.OTIS_KEY);
const chars = await provider.callFunction<[string, { epoch_open: boolean }][]>({ contractId: GAME, method: 'list_characters', args: {}, blockQuery: { finality: 'final' } });
const mine = chars?.find(([id]) => id === OTIS)?.[1];
if (!mine) {
  const r = await otis.callFunctionRaw({ contractId: GAME, methodName: 'register_character', args: { persona_hash: 'otis-v1' } });
  console.log('registered Otis, tx', r.transaction.hash);
}
if (!mine?.epoch_open) {
  const r = await otis.callFunctionRaw({ contractId: GAME, methodName: 'commit_epoch', args: { commit: epochCommit(env.OTIS_EPOCH_SECRET) } });
  console.log('committed epoch, tx', r.transaction.hash);
}
// 4. Otis ledger balance: the stake he puts up in every game.
const bal = BigInt((await provider.callFunction<string>({ contractId: GAME, method: 'get_balance', args: { account_id: OTIS }, blockQuery: { finality: 'final' } })) ?? '0');
if (bal < milli(300)) {
  const r = await otis.callFunctionRaw({ contractId: GAME, methodName: 'deposit', args: {}, deposit: milli(400) });
  console.log('Otis deposited 0.4 NEAR, tx', r.transaction.hash);
}
console.log('setup done');
