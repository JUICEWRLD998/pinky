// Writes golden vectors from the tested TypeScript payoff rules, for the Rust contract to reproduce.
// Run: npm run vectors
import { writeFileSync } from 'node:fs';
import { DEFAULT_PARAMS, bonus, settle, settleCharacterTimeout, settlePlayerTimeout } from '../core/payoff.ts';
import type { Move, Params } from '../core/payoff.ts';
import { mulberry32 } from '../core/rng.ts';

const paramSets: Params[] = [
  DEFAULT_PARAMS,
  { rakeBps: 0n, yMaxBps: 10000n, drip: 2n, forfeitBps: 0n },
  { rakeBps: 2500n, yMaxBps: 1n, drip: 1000n, forfeitBps: 5000n },
];
const r = mulberry32(2026);
const stakes: bigint[] = [1n, 2n, 3n, 7n, 49n, 99n, 101n, 12345679n, 10n ** 24n, 10n ** 26n];
const jars: bigint[] = [0n, 1n, 39n, 40n, 41n, 1000003n, 10n ** 12n, 10n ** 24n, 7n * 10n ** 25n];
for (let i = 0; i < 150; i++) {
  stakes.push(BigInt(1 + Math.floor(r() * 1e12)) * BigInt(1 + Math.floor(r() * 1e6)));
  jars.push(BigInt(Math.floor(r() * 1e12)) * BigInt(Math.floor(r() * 1e9)));
}
const moves: Move[] = ['KEEP', 'BREAK'];
const rows: unknown[] = [];
let n = 0;
for (const p of paramSets) {
  for (let i = 0; i < stakes.length; i++) {
    const stake = stakes[i];
    const jar = jars[(i * 7 + n) % jars.length];
    n++;
    for (const a of moves) {
      for (const b of moves) {
        const s = settle(stake, a, b, jar, p);
        rows.push({
          kind: 'settle',
          params: [p.rakeBps, p.yMaxBps, p.drip, p.forfeitBps].map(String),
          stake: String(stake), jar: String(jar), player: a, character: b,
          bonus: String(bonus(stake, jar, p)),
          out: [s.player, s.character, s.jarDelta, s.house].map(String),
        });
      }
    }
    const c = settleCharacterTimeout(stake);
    rows.push({ kind: 'char_timeout', params: [p.rakeBps, p.yMaxBps, p.drip, p.forfeitBps].map(String), stake: String(stake), out: [c.player, c.character, c.jarDelta, c.house].map(String) });
    const t = settlePlayerTimeout(stake, p);
    rows.push({ kind: 'player_timeout', params: [p.rakeBps, p.yMaxBps, p.drip, p.forfeitBps].map(String), stake: String(stake), out: [t.player, t.character, t.jarDelta, t.house].map(String) });
  }
}
writeFileSync(new URL('../contract/tests/vectors.json', import.meta.url), JSON.stringify(rows));
console.log(`wrote ${rows.length} vectors`);
