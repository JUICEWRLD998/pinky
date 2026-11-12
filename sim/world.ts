// Seeded simulation of the Pinky economy. No chain, no model: policies decide, a seeded rng draws.
// Every round conserves money: bankrolls + jar + house = initial + injected backing.
import { DEFAULT_PARAMS, jarRateBps as jarRate, settle } from '../core/payoff.ts';
import type { Move, Params } from '../core/payoff.ts';
import { CHARACTERS, NEUTRAL_READ, decide, moveFor } from '../core/policy.ts';
import type { PairHistory } from '../core/policy.ts';
import { mulberry32 } from '../core/rng.ts';

export const UNIT = 1_000_000n; // 1 NEAR in simulation units
export type Archetype = 'alwaysKeep' | 'alwaysBreak' | 'mirror' | 'jarTimer' | 'random';
export const ARCHETYPES: Archetype[] = ['alwaysKeep', 'alwaysBreak', 'mirror', 'jarTimer', 'random'];

export interface SimOptions {
  seed: number;
  rounds: number;
  params?: Params;
  stake?: bigint;
  playersPerArchetype?: number;
  playerStart?: bigint;
  characterStart?: bigint;
  inferenceCost?: bigint;
  /** Every this many rounds a backer tops up characters whose bankroll is below 3 stakes. */
  backerEvery?: number;
  backerTopUp?: bigint;
  apologyFee?: bigint;
  sampleEvery?: number;
  /** Test hook: replace the settle function to prove the conservation invariant can fail. */
  settleImpl?: typeof settle;
}

export interface Sample {
  round: number;
  jar: bigint;
  jarRateBps: number;
  kkShare: number; // share of both-keep games in the last 300 games, 0..1
  charBank: bigint[];
  archBank: bigint[];
}

export interface Summary {
  rounds: number;
  games: number;
  outcomes: { KK: number; KB: number; BK: number; BB: number };
  jarMin: bigint;
  jarMax: bigint;
  jarFinal: bigint;
  jarRateCrossings: number; // times the Jar rate crossed 3000 bps
  houseFinal: bigint;
  injected: bigint;
  apologies: number;
  closedEvents: number;
  archetypeFinal: Record<Archetype, bigint>; // mean bankroll per player
  archetypeStart: bigint;
  characterFinal: Record<string, bigint>;
  conservationOk: boolean;
}

interface Player {
  arch: Archetype;
  bank: bigint;
  games: number;
  keeps: number;
}
interface Pair extends PairHistory {
  lastCharMove: Move | null;
}
const blank = (): Pair => ({ games: 0, playerKeeps: 0, playerBreaks: 0, lastPlayerMove: null, apologyPaid: false, lastCharMove: null });

function playerMove(pl: Player, pair: Pair, jarBps: number, r: () => number): Move {
  switch (pl.arch) {
    case 'alwaysKeep':
      return 'KEEP';
    case 'alwaysBreak':
      return 'BREAK';
    case 'mirror':
      return pair.lastCharMove ?? 'KEEP';
    case 'jarTimer':
      return jarBps >= 3000 ? 'KEEP' : 'BREAK';
    case 'random':
      return r() < 0.5 ? 'KEEP' : 'BREAK';
  }
}

export function runSim(o: SimOptions): { samples: Sample[]; summary: Summary } {
  const p = o.params ?? DEFAULT_PARAMS;
  const stake = o.stake ?? UNIT;
  const perArch = o.playersPerArchetype ?? 4;
  const playerStart = o.playerStart ?? 100n * UNIT;
  const charStart = o.characterStart ?? 30n * UNIT;
  const infer = o.inferenceCost ?? 2000n; // 0.002 per reply
  const backerEvery = o.backerEvery ?? 400;
  const backerTopUp = o.backerTopUp ?? 15n * UNIT;
  const apologyFee = o.apologyFee ?? 2n * stake;
  const sampleEvery = o.sampleEvery ?? 100;
  const r = mulberry32(o.seed);
  const draw = () => Math.floor(r() * 10000);

  const players: Player[] = [];
  for (const arch of ARCHETYPES) for (let i = 0; i < perArch; i++) players.push({ arch, bank: playerStart, games: 0, keeps: 0 });
  const chars = CHARACTERS.map((spec) => ({ spec, bank: charStart }));
  const pairs = new Map<string, Pair>();
  const pairOf = (pi: number, ci: number) => {
    const k = `${pi}:${ci}`;
    let v = pairs.get(k);
    if (!v) pairs.set(k, (v = blank()));
    return v;
  };

  let jar = 0n;
  let house = 0n;
  let injected = 0n;
  const initialTotal = BigInt(players.length) * playerStart + BigInt(chars.length) * charStart;
  const strangers: number[] = []; // 1 if a first-contact player broke
  const recent: string[] = []; // outcome strings
  const outcomes = { KK: 0, KB: 0, BK: 0, BB: 0 };
  let games = 0;
  let apologies = 0;
  let closedEvents = 0;
  let jarMin = 0n;
  let jarMax = 0n;
  let crossings = 0;
  let prevHigh: boolean | null = null;
  let conservationOk = true;
  const samples: Sample[] = [];

  const strangerRate = () => (strangers.length === 0 ? 3000 : Math.floor((strangers.reduce((a, b) => a + b, 0) * 10000) / strangers.length));

  for (let round = 1; round <= o.rounds; round++) {
    if (backerEvery > 0 && round % backerEvery === 0) {
      for (const c of chars) {
        if (c.bank < 3n * stake) {
          c.bank += backerTopUp;
          injected += backerTopUp;
        }
      }
    }
    const pi = Math.floor(r() * players.length);
    const pl = players[pi];
    if (pl.bank >= stake) {
      const jarBps = Number(jarRate(stake, jar, p));
      const open: number[] = [];
      const closed: number[] = [];
      const decisions = new Map<number, ReturnType<typeof decide>>();
      for (let ci = 0; ci < chars.length; ci++) {
        if (chars[ci].bank < stake + infer) continue;
        const pair = pairOf(pi, ci);
        const d = decide(chars[ci].spec, {
          vsPlayer: pair,
          record: { games: pl.games, keepRateBps: pl.games === 0 ? 5000 : Math.floor((pl.keeps * 10000) / pl.games) },
          strangerBreakRateBps: strangerRate(),
          stakeBps: Number((stake * 10000n) / chars[ci].bank),
          jarRateBps: jarBps,
          read: NEUTRAL_READ,
        });
        decisions.set(ci, d);
        (d.open ? open : closed).push(ci);
      }
      if (open.length === 0 && closed.length > 0 && pl.bank >= apologyFee + stake && r() < 0.3 && pl.arch !== 'alwaysBreak') {
        // pay the apology fee to a random closed character: the fee goes to the Jar
        const ci = closed[Math.floor(r() * closed.length)];
        const pair = pairOf(pi, ci);
        pl.bank -= apologyFee;
        jar += apologyFee;
        pair.apologyPaid = true;
        pair.playerBreaks = 0;
        apologies++;
        closedEvents++;
      } else if (open.length > 0) {
        const ci = open[Math.floor(r() * open.length)];
        const ch = chars[ci];
        const pair = pairOf(pi, ci);
        const d = decisions.get(ci)!;
        const first = pair.games === 0;
        const cMove = moveFor(d.pKeepBps, draw());
        const pMove = playerMove(pl, pair, jarBps, r);
        // escrow both stakes, settle, then the character pays inference to the house
        pl.bank -= stake;
        ch.bank -= stake;
        const s = (o.settleImpl ?? settle)(stake, pMove, cMove, jar, p);
        pl.bank += s.player;
        ch.bank += s.character;
        jar += s.jarDelta;
        house += s.house;
        const paid = ch.bank >= infer ? infer : ch.bank;
        ch.bank -= paid;
        house += paid;
        const key = (pMove === 'KEEP' ? 'K' : 'B') + (cMove === 'KEEP' ? 'K' : 'B');
        outcomes[key as keyof typeof outcomes]++;
        recent.push(key);
        if (recent.length > 300) recent.shift();
        games++;
        pl.games++;
        if (pMove === 'KEEP') pl.keeps++;
        pair.games++;
        if (pMove === 'KEEP') pair.playerKeeps++;
        else pair.playerBreaks++;
        pair.lastPlayerMove = pMove;
        pair.lastCharMove = cMove;
        if (first) {
          strangers.push(pMove === 'BREAK' ? 1 : 0);
          if (strangers.length > 200) strangers.shift();
        }
      } else {
        closedEvents++;
      }
    }
    if (jar < jarMin) jarMin = jar;
    if (jar > jarMax) jarMax = jar;
    const high = jarRate(stake, jar, p) >= 3000n;
    if (prevHigh !== null && high !== prevHigh) crossings++;
    prevHigh = high;

    // invariant: money is conserved every round
    const sum = players.reduce((a, x) => a + x.bank, 0n) + chars.reduce((a, x) => a + x.bank, 0n) + jar + house;
    if (sum !== initialTotal + injected) conservationOk = false;

    if (round % sampleEvery === 0) {
      const kk = recent.length ? recent.filter((x) => x === 'KK').length / recent.length : 0;
      samples.push({
        round,
        jar,
        jarRateBps: Number(jarRate(stake, jar, p)),
        kkShare: kk,
        charBank: chars.map((c) => c.bank),
        archBank: ARCHETYPES.map((a) => players.filter((x) => x.arch === a).reduce((s, x) => s + x.bank, 0n) / BigInt(perArch)),
      });
    }
  }

  const archetypeFinal = {} as Record<Archetype, bigint>;
  for (const a of ARCHETYPES) archetypeFinal[a] = players.filter((x) => x.arch === a).reduce((s, x) => s + x.bank, 0n) / BigInt(perArch);
  const characterFinal: Record<string, bigint> = {};
  for (const c of chars) characterFinal[c.spec.name] = c.bank;
  return {
    samples,
    summary: {
      rounds: o.rounds,
      games,
      outcomes,
      jarMin,
      jarMax,
      jarFinal: jar,
      jarRateCrossings: crossings,
      houseFinal: house,
      injected,
      apologies,
      closedEvents,
      archetypeFinal,
      archetypeStart: playerStart,
      characterFinal,
      conservationOk,
    },
  };
}
