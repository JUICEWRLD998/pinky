// Phase 5b: deploy the v2 contract (backing, apology fee, enter_agent) to a NEW account. The v1 contract stays untouched.
// Idempotent. Secrets go to ../.env (gitignored) and are never printed.
// Run from app/:  node --env-file=../.env scripts/deploy-v2.ts <path to pinky_contract.wasm>
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { KeyPair } from 'near-api-js';
import { ROOT, milli, provider, signerAccount } from '../server/chain.ts';

const ENV = new URL('../../.env', import.meta.url);
const has = (n: string) => new RegExp(`^${n}=.+`, 'm').test(readFileSync(ENV, 'utf8'));
const save = (n: string, v: string) => { appendFileSync(ENV, `${n}=${v}\n`); process.env[n] = v; };

const wasmPath = process.argv[2];
if (!wasmPath) throw new Error('usage: deploy-v2.ts <wasm path>');
const code = readFileSync(wasmPath);
console.log('wasm bytes', code.length, 'sha256', createHash('sha256').update(code).digest('hex'));

const V2 = `pinky2.${ROOT}`;
const root = signerAccount(ROOT, process.env.ROOT_KEY);

let exists = true;
try { await provider.viewAccount({ accountId: V2 }); } catch { exists = false; }
if (!exists) {
  const kp = KeyPair.fromRandom('ed25519');
  save('PINKY2_KEY', kp.toString());
  const r = await root.createSubAccount({ accountOrPrefix: 'pinky2', publicKey: kp.getPublicKey().toString(), nearToTransfer: milli(2900) });
  console.log('created', V2, r.transaction.hash);
}

const me = signerAccount(V2, process.env.PINKY2_KEY);
const dep = await me.deployContract(code);
console.log('deployed', dep.transaction.hash);

// Same parameters as v1 (read from its get_config). No setter exists.
const init = await me.callFunctionRaw({
  contractId: V2,
  methodName: 'new',
  args: {
    rake_bps: 200, y_max_bps: 5000, drip: 40, forfeit_bps: 500, window_secs: 300,
    min_stake: '10000000000000000000000', max_stake: '1000000000000000000000000',
    max_inference: '10000000000000000000000', house: `house.${ROOT}`,
  },
});
console.log('initialised', init.transaction.hash);

// Epoch secrets revealed on v1 are public, so v2 needs a fresh master. Keep the old one for v1 audits.
if (!has('EPOCH_MASTER_V1')) {
  const old = readFileSync(ENV, 'utf8').match(/^EPOCH_MASTER=(.+)$/m)?.[1];
  if (old) save('EPOCH_MASTER_V1', old);
}
console.log(`next: set GAME_CONTRACT=${V2} and a new EPOCH_MASTER in .env, then run setup:characters`);
