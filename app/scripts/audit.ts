// Audit: read every game of a finished epoch from the chain and recompute each character decision from the
// public policy. Needs no keys. Prints PASS, FAIL or SKIP per game; exit code 1 if any game FAILS.
//   node app/scripts/audit.ts --epoch 1 [--character Otis]
import { auditGame, type AuditConfig, type AuditGame } from '../../core/audit.ts';
import { view } from '../server/chain.ts';
import { specOf } from '../server/characters.ts';

const arg = (k: string): string | undefined => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const epochArg = arg('epoch');
const only = arg('character');
if (!epochArg || !/^\d+$/.test(epochArg)) { console.error('usage: audit --epoch N [--character Name]'); process.exit(2); }
const epoch = Number(epochArg);

const cfg = await view<AuditConfig>('get_config');
const next = Number(await view<number>('get_next_game_id'));
const games: AuditGame[] = [];
for (let id = 1; id < next; id++) {
  const g = await view<AuditGame | null>('get_game', { game_id: id });
  if (g && g.epoch === epoch) games.push(g);
}

let pass = 0, fail = 0, skip = 0;
// Every character on the contract: the six and any outside agent. An agent is judged by the policy it stored on chain.
const accounts = (await view<[string, unknown][]>('list_characters')).map(([a]) => a).sort();
for (const account of accounts) {
  let spec;
  try { spec = await specOf(account); } catch (e) { console.log(`
${account}: SKIP ${(e as Error).message}`); continue; }
  if (only && spec.name.toLowerCase() !== only.toLowerCase()) continue;
  const mine = games.filter((g) => g.character === account);
  if (mine.length === 0) continue;
  const secret = await view<string | null>('get_epoch_secret', { character: account, epoch });
  console.log(`\n${spec.name} (${account}) epoch ${epoch}: ${mine.length} game(s), secret ${secret ? 'revealed on chain' : 'NOT revealed yet'}`);
  for (const g of mine) {
    const a = auditGame(g, spec, secret, cfg);
    if (a.verdict === 'PASS') pass++; else if (a.verdict === 'FAIL') fail++; else skip++;
    console.log(`  game ${g.id}: ${a.verdict}${a.note ? '  ' + a.note : ''}`);
    for (const c of a.checks.filter((x) => !x.ok)) console.log(`      FAILED check: ${c.name} (${c.detail ?? ''})`);
  }
}
console.log(`\nepoch ${epoch}: ${pass} PASS, ${fail} FAIL, ${skip} SKIP`);
console.log('Recomputed from chain: policy decision, draw, commit, stake share, Jar rate. Attested by the character and bounded by policy: pair history, record, stranger-break rate, chat read.');
process.exit(fail ? 1 : 0);
