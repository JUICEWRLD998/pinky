// Usage: node sim/run.ts [--seed 7] [--rounds 10000] [--out out]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARCHETYPES, UNIT, runSim } from './world.ts';
import { chartSvg } from './chart.ts';

const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const seed = Number(arg('seed', '7'));
const rounds = Number(arg('rounds', '10000'));
const outDir = arg('out', 'out');

const { samples, summary: s } = runSim({ seed, rounds });
const n = (x: bigint) => (Number(x) / Number(UNIT)).toFixed(2);

const total = s.outcomes.KK + s.outcomes.KB + s.outcomes.BK + s.outcomes.BB;
const pct = (x: number) => ((100 * x) / Math.max(1, total)).toFixed(1) + '%';
console.log(`seed=${seed} rounds=${rounds} games=${s.games}`);
console.log(`outcomes  both keep ${pct(s.outcomes.KK)} | player breaks ${pct(s.outcomes.BK)} | character breaks ${pct(s.outcomes.KB)} | both break ${pct(s.outcomes.BB)}`);
console.log(`jar       min ${n(s.jarMin)} max ${n(s.jarMax)} final ${n(s.jarFinal)} | rate crossed 30% ${s.jarRateCrossings} times`);
console.log(`house     ${n(s.houseFinal)} | backers injected ${n(s.injected)} | apologies ${s.apologies}`);
console.log(`players   mean bankroll at start ${n(s.archetypeStart)}`);
for (const a of ARCHETYPES) console.log(`  ${a.padEnd(12)} ${n(s.archetypeFinal[a])}`);
console.log('characters');
for (const [k, v] of Object.entries(s.characterFinal)) console.log(`  ${k.padEnd(12)} ${n(v)}`);
console.log(`conservation ${s.conservationOk ? 'OK' : 'VIOLATED'}`);

mkdirSync(outDir, { recursive: true });
const header = ['round', 'jar', 'jarRateBps', 'kkShare', ...samples[0].charBank.map((_, i) => `char${i}`), ...ARCHETYPES].join(',');
const rows = samples.map((x) => [x.round, n(x.jar), x.jarRateBps, x.kkShare.toFixed(3), ...x.charBank.map(n), ...x.archBank.map(n)].join(','));
writeFileSync(join(outDir, `sim-seed${seed}.csv`), [header, ...rows].join(String.fromCharCode(10)) + String.fromCharCode(10));
writeFileSync(join(outDir, `sim-seed${seed}.svg`), chartSvg(samples));
if (!s.conservationOk) process.exit(1);
