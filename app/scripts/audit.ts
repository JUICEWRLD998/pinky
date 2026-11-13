// Audit: read every game of a finished epoch from the chain and recompute each character decision from the
// public policy. Needs no keys. Prints PASS, FAIL or SKIP per game; exit code 1 if any game FAILS.
//   node app/scripts/audit.ts --epoch 1 [--character Otis]
import { runAudit } from '../server/audit.ts';

const arg = (k: string): string | undefined => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const epochArg = arg('epoch');
const only = arg('character');
if (!epochArg || !/^\d+$/.test(epochArg)) { console.error('usage: audit --epoch N [--character Name]'); process.exit(2); }
const epoch = Number(epochArg);

const report = await runAudit(epoch, only);
for (const s of report.skippedAccounts) console.log(`\n${s.account}: SKIP ${s.reason}`);
for (const g of report.groups) {
  console.log(`\n${g.name} (${g.account}) epoch ${epoch}: ${g.rows.length} game(s), secret ${g.secretRevealed ? 'revealed on chain' : 'NOT revealed yet'}`);
  for (const r of g.rows) {
    console.log(`  game ${r.id}: ${r.verdict}${r.note ? '  ' + r.note : ''}`);
    for (const c of r.failed) console.log(`      FAILED check: ${c.name} (${c.detail ?? ''})`);
  }
}
console.log(`\nepoch ${epoch}: ${report.pass} PASS, ${report.fail} FAIL, ${report.skip} SKIP`);
console.log('Recomputed from chain: policy decision, draw, commit, stake share, Jar rate. Attested by the character and bounded by policy: pair history, record, stranger-break rate, chat read.');
process.exit(report.fail ? 1 : 0);
