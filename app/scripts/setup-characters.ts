// Phase 4 setup: all six characters exist on testnet, are registered, have an open epoch and a ledger balance.
// Idempotent. New secrets go to ../.env (gitignored) and are never printed.
// Run from app/:  node --env-file=../.env scripts/setup-characters.ts
import { execSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { KeyPair } from 'near-api-js';
import { epochCommit } from '../../core/rng.ts';
import { CHARACTERS } from '../../core/policy.ts';
import { GAME, ROOT, milli, provider, signerAccount, view } from '../server/chain.ts';
import { accountOf, characterAccount, epochSecret } from '../server/characters.ts';

const ENV = new URL('../../.env', import.meta.url);
const read = () => readFileSync(ENV, 'utf8');
const has = (n: string) => new RegExp(`^${n}=.+`, 'm').test(read());
const save = (n: string, v: string) => { appendFileSync(ENV, `${n}=${v}\n`); process.env[n] = v; };
const exists = async (id: string) => { try { await provider.viewAccount({ accountId: id }); return true; } catch { return false; } };

if (!has('EPOCH_MASTER')) save('EPOCH_MASTER', randomBytes(32).toString('hex'));
const root = signerAccount(ROOT, process.env.ROOT_KEY);

// Mabel was created in Phase 0 with a key kept in WSL; import it once.
if (!has('MABEL_KEY')) {
  const j = JSON.parse(execSync(`wsl -d Ubuntu -- bash -lc "cat ~/.near-credentials/testnet/${accountOf('Mabel')}.json"`).toString());
  save('MABEL_KEY', j.private_key);
}

const chars = await view<[string, { epoch_open: boolean; epoch: number }][]>('list_characters');
for (const spec of CHARACTERS) {
  const id = accountOf(spec.name);
  const N = spec.name.toUpperCase();
  if (!(await exists(id))) {
    const kp = KeyPair.fromRandom('ed25519');
    await root.createSubAccount({ accountOrPrefix: spec.name.toLowerCase(), publicKey: kp.getPublicKey().toString(), nearToTransfer: milli(400) });
    save(`${N}_KEY`, kp.toString());
    console.log('created', id);
  }
  const me = characterAccount(spec.name);
  const mine = chars.find(([a]) => a === id)?.[1];
  if (!mine) {
    const r = await me.callFunctionRaw({ contractId: GAME, methodName: 'register_character', args: { persona_hash: `${spec.name.toLowerCase()}-v1` } });
    console.log(spec.name, 'registered', r.transaction.hash);
  }
  if (!mine?.epoch_open) {
    const epoch = (mine?.epoch ?? 0) + 1;
    const r = await me.callFunctionRaw({ contractId: GAME, methodName: 'commit_epoch', args: { commit: epochCommit(epochSecret(spec.name, epoch)) } });
    console.log(spec.name, `epoch ${epoch} committed`, r.transaction.hash);
  }
  const bal = BigInt(await view<string>('get_balance', { account_id: id }));
  if (bal < milli(200)) {
    const r = await me.callFunctionRaw({ contractId: GAME, methodName: 'deposit', args: {}, deposit: milli(250) });
    console.log(spec.name, 'ledger +0.25 NEAR', r.transaction.hash);
  }
}
console.log('characters ready');
