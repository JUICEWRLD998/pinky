// Phase 5b live check on the v2 contract: backing, apology fee, outside agent entry. Real transactions, real checks.
// Idempotent where it can be. Secrets go to ../.env (gitignored) and are never printed.
// Run from app/:  node --env-file=../.env scripts/e2e-v2.ts
import { appendFileSync, readFileSync } from 'node:fs';
import { KeyPair } from 'near-api-js';
import { epochCommit } from '../../core/rng.ts';
import { GAME, ROOT, milli, provider, signerAccount, view } from '../server/chain.ts';
import { accountOf, epochSecret } from '../server/characters.ts';

const ENV = new URL('../../.env', import.meta.url);
const save = (n: string, v: string) => { appendFileSync(ENV, `${n}=${v}\n`); process.env[n] = v; };
const exists = async (id: string) => { try { await provider.viewAccount({ accountId: id }); return true; } catch { return false; } };
/** True when the call throws or any receipt in it failed. */
const rejected = async (call: () => Promise<{ receipts_outcome?: { outcome: { status: unknown } }[] }>): Promise<boolean> => {
  try { const r = await call(); return !!r.receipts_outcome?.some((o) => typeof o.outcome.status === 'object' && o.outcome.status !== null && 'Failure' in (o.outcome.status as object)); } catch { return true; }
};
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) failures++; };

if (!/^pinky2\./.test(GAME)) throw new Error(`GAME_CONTRACT is ${GAME}; this check is for the v2 contract`);
const root = signerAccount(ROOT, process.env.ROOT_KEY);
const BACKER = `backer.${ROOT}`;
const BEACON = `beacon.${ROOT}`;

for (const [label, key, amount] of [['backer', 'BACKER_KEY', 300], ['beacon', 'BEACON_KEY', 200]] as const) {
  if (!(await exists(`${label}.${ROOT}`))) {
    const kp = KeyPair.fromRandom('ed25519');
    save(key, kp.toString());
    await root.createSubAccount({ accountOrPrefix: label, publicKey: kp.getPublicKey().toString(), nearToTransfer: milli(amount) });
    console.log('created', `${label}.${ROOT}`);
  }
}
const backer = signerAccount(BACKER, process.env.BACKER_KEY);
const beacon = signerAccount(BEACON, process.env.BEACON_KEY);
const bal = async (a: string) => BigInt(await view<string>('get_balance', { account_id: a }));
const sol = async () => { const s = await view<{ account_balance: string; total_held: string }>('solvency'); return { acct: BigInt(s.account_balance), held: BigInt(s.total_held) }; };
const settle = () => new Promise((r) => setTimeout(r, 1500));
const cfg = await view<{ min_stake: string }>('get_config');
const minStake = BigInt(cfg.min_stake);

// ---- 1. Backing: shares in, shares out, conservation ----
const DICE = accountOf('Dice');
if ((await bal(BACKER)) < milli(100)) { await backer.callFunctionRaw({ contractId: GAME, methodName: 'deposit', args: {}, deposit: milli(120) }); await settle(); }
const before = await bal(BACKER);
const s0 = await sol();
const amount = milli(30);
const rb = await backer.callFunctionRaw({ contractId: GAME, methodName: 'back', args: { character: DICE, amount: amount.toString() } });
await settle();
const shares = BigInt(await view<string>('get_shares', { character: DICE, backer: BACKER }));
check('back: backer receives shares', shares > 0n, `shares ${shares} tx ${rb.transaction.hash}`);
check('back: backer ledger fell by the amount', (await bal(BACKER)) === before - amount);
const pool = await view<{ total_shares: string; balance: string }>('get_pool', { character: DICE });
check('back: pool total shares includes the backer', BigInt(pool.total_shares) >= shares);
const ru = await backer.callFunctionRaw({ contractId: GAME, methodName: 'unback', args: { character: DICE, shares: shares.toString() } });
await settle();
check('unback: shares are gone', BigInt(await view<string>('get_shares', { character: DICE, backer: BACKER })) === 0n, `tx ${ru.transaction.hash}`);
const after = await bal(BACKER);
check('unback: backer ledger back within 1 unit (1e12 yocto) of the start', before - after <= 10n ** 12n && after <= before, `diff ${before - after} yocto`);
const s1 = await sol();
check('solvency: total held unchanged by backing and unbacking', s1.held === s0.held, `${s0.held} -> ${s1.held}`);
check('solvency: contract balance covers everything it owes', s1.acct >= s1.held);

// ---- 2. Apology fee: Jar grows, the pair flag flips ----
const MABEL = accountOf('Mabel');
const pairBefore = await view<{ apology_paid: boolean }>('get_pair', { player: BACKER, character: MABEL });
if (!pairBefore.apology_paid) {
  const jar0 = BigInt(await view<string>('get_jar'));
  const bBefore = await bal(BACKER);
  const ra = await backer.callFunctionRaw({ contractId: GAME, methodName: 'apologize', args: { character: MABEL } });
  await settle();
  const jar1 = BigInt(await view<string>('get_jar'));
  check('apologize: the Jar grew by 2 minimum stakes', jar1 - jar0 === 2n * minStake, `tx ${ra.transaction.hash}`);
  check('apologize: the player paid the same amount', bBefore - (await bal(BACKER)) === 2n * minStake);
  check('apologize: the pair flag is set', (await view<{ apology_paid: boolean }>('get_pair', { player: BACKER, character: MABEL })).apology_paid === true);
  check('apologize: paying twice is refused', await rejected(() => backer.callFunctionRaw({ contractId: GAME, methodName: 'apologize', args: { character: MABEL } })));
} else console.log('apology already paid in an earlier run, skipped');

// ---- 3. Outside agent: enters with a public policy, a bankroll and an epoch commit ----
const registered = (await view<[string, { policy?: string | null }][]>('list_characters')).find(([a]) => a === BEACON);
if (!registered) {
  const policy = JSON.stringify({ kind: 'mirror', doorMinKeepBps: 1000, params: { firstMaxBps: 8000, firstMinBps: 4000, afterKeepBps: 9500, afterBreakBps: 500 } });
  const re = await beacon.callFunctionRaw({
    contractId: GAME, methodName: 'enter_agent',
    args: { persona_hash: 'beacon-v1', policy, epoch_commit: epochCommit(epochSecret('beacon', 1)) },
    deposit: milli(80),
  });
  await settle();
  const now = (await view<[string, { policy?: string | null; epoch_open: boolean }][]>('list_characters')).find(([a]) => a === BEACON);
  check('enter_agent: Beacon is registered with its policy and an open epoch', !!now && now[1].policy === policy && now[1].epoch_open, `tx ${re.transaction.hash}`);
  check('enter_agent: bankroll landed in the ledger', (await bal(BEACON)) >= milli(80) - 1n);
  check('enter_agent: an already registered account is refused', await rejected(() => signerAccount(MABEL, process.env.MABEL_KEY).callFunctionRaw({ contractId: GAME, methodName: 'enter_agent', args: { persona_hash: 'x', policy, epoch_commit: epochCommit(epochSecret('beacon', 1)) }, deposit: milli(80) })));
} else console.log('Beacon already entered, skipped');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall v2 live checks passed');
process.exit(failures ? 1 : 0);
