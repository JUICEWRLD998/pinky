// Public decision policy of every character. Integer inputs and integer outputs (basis points),
// so the audit can recompute each decision exactly. The language model never decides a move.
import type { Move } from './payoff.ts';
import mabel from './characters/mabel.json' with { type: 'json' };
import otis from './characters/otis.json' with { type: 'json' };
import fenn from './characters/fenn.json' with { type: 'json' };
import prue from './characters/prue.json' with { type: 'json' };
import dice from './characters/dice.json' with { type: 'json' };
import abacus from './characters/abacus.json' with { type: 'json' };

export interface PairHistory {
  games: number;
  playerKeeps: number;
  playerBreaks: number;
  lastPlayerMove: Move | null;
  /** True once the player paid an apology fee to this character. Wipes the grudge. */
  apologyPaid: boolean;
}

export interface PolicyInputs {
  vsPlayer: PairHistory;
  /** The player record across all characters. */
  record: { games: number; keepRateBps: number };
  /** Share of recent first-contact games where the stranger broke, basis points. */
  strangerBreakRateBps: number;
  /** Stake as a share of the character bankroll, basis points. */
  stakeBps: number;
  /** Current Jar bonus as a share of the stake, basis points. */
  jarRateBps: number;
  /** Bounded read of the chat, all basis points 0..10000. Moves the keep chance by at most 1000. */
  read: { promiseBps: number; threatBps: number; sincerityBps: number };
}

export interface Decision {
  /** False when the character refuses to play this player. */
  open: boolean;
  /** Chance of keeping, basis points 0..10000. */
  pKeepBps: number;
  /** One line a player can read in the tooltip. */
  reason: string;
}

export type CharacterSpec = {
  name: string;
  kind: string;
  doorMinKeepBps: number;
  persona: string;
  params: Record<string, number>;
};

export const CHARACTERS: CharacterSpec[] = [mabel, otis, fenn, prue, dice, abacus] as CharacterSpec[];

/** Door rule: with enough record, a keep rate under the character floor is refused. */
export const DOOR_MIN_GAMES = 5;
/** The chat read may move the keep chance by at most this many basis points (0.1). */
export const READ_MAX_BPS = 1000;

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Chat read effect in basis points, bounded to +-READ_MAX_BPS. Sincere promises help, threats hurt. */
export function readAdjustBps(read: PolicyInputs['read']): number {
  const sincerePromise = Math.floor((read.promiseBps * read.sincerityBps) / 10000);
  return clamp(Math.trunc((sincerePromise - read.threatBps) / 10), -READ_MAX_BPS, READ_MAX_BPS);
}

export function decide(spec: CharacterSpec, inp: PolicyInputs): Decision {
  const p = spec.params;
  const h = inp.vsPlayer;

  // Door: a bad record closes it, unless the player has paid the apology fee.
  if (!h.apologyPaid && inp.record.games >= DOOR_MIN_GAMES && inp.record.keepRateBps < spec.doorMinKeepBps) {
    return { open: false, pKeepBps: 0, reason: `${spec.name} will not play players who keep under ${spec.doorMinKeepBps / 100}% of promises.` };
  }

  let base: number;
  let reason: string;
  switch (spec.kind) {
    case 'grudger': {
      if (h.playerBreaks > 0 && !h.apologyPaid) {
        return { open: false, pKeepBps: 0, reason: `${spec.name} remembers you broke a promise. An apology fee reopens her door.` };
      }
      if (h.apologyPaid) {
        base = p.afterApologyBps;
        reason = 'Still wary after the apology.';
      } else {
        base = clamp(p.firstMaxBps - Math.floor(inp.strangerBreakRateBps / 2), p.firstMinBps, p.firstMaxBps);
        reason = 'Trusting a stranger, less so when strangers have been breaking.';
      }
      break;
    }
    case 'mirror': {
      if (h.lastPlayerMove === null) {
        base = clamp(p.firstMaxBps - Math.floor(inp.strangerBreakRateBps / 2), p.firstMinBps, p.firstMaxBps);
        reason = 'First time: trusts strangers about as far as strangers have earned.';
      } else if (h.lastPlayerMove === 'KEEP') {
        base = p.afterKeepBps;
        reason = 'You kept last time, so he keeps.';
      } else {
        base = p.afterBreakBps;
        reason = 'You broke last time, so he breaks. One time in ten he forgives.';
      }
      break;
    }
    case 'opportunist': {
      base = p.baseBps;
      reason = 'Keeps by default.';
      if (inp.stakeBps > p.bigStakeBps) {
        base -= p.bigStakePenaltyBps;
        reason = 'The stake is big against his bankroll, so he leans to break.';
      }
      if (inp.jarRateBps < p.lowJarBps) {
        base -= p.lowJarPenaltyBps;
        reason += ' The Jar is thin, so keeping pays little.';
      }
      base = clamp(base, 500, 9500);
      break;
    }
    case 'saint': {
      base = p.keepBps;
      reason = 'Always keeps, almost.';
      break;
    }
    case 'coin': {
      // The coin ignores the chat read: the persona says so.
      return { open: true, pKeepBps: p.keepBps, reason: 'A coin flip. The chat does not matter.' };
    }
    case 'statistician': {
      const g = Math.min(h.games, p.maxGames);
      const futureValue = g * p.perGameValueBps;
      const score = inp.jarRateBps + futureValue - p.breakGainBps; // above zero: keeping is rational
      const q = h.games >= 3 ? Math.floor((h.playerKeeps * 10000) / h.games) : inp.record.keepRateBps;
      const lean = clamp(5000 + Math.trunc(score / 2), 500, 9500);
      base = Math.floor((lean * (5000 + Math.floor(q / 2))) / 10000);
      reason = `Expected value: Jar ${inp.jarRateBps / 100}% + relationship ${futureValue / 100}% against a ${p.breakGainBps / 100}% gain from breaking, weighted by your keep rate.`;
      break;
    }
    default:
      throw new Error(`unknown character kind ${spec.kind}`);
  }
  const adj = readAdjustBps(inp.read);
  return { open: true, pKeepBps: clamp(base + adj, 0, 10000), reason };
}

/** Move from a decision and the private draw (0..9999): KEEP when draw < pKeep. */
export function moveFor(pKeepBps: number, draw: number): Move {
  return draw < pKeepBps ? 'KEEP' : 'BREAK';
}

export const NEUTRAL_READ = { promiseBps: 0, threatBps: 0, sincerityBps: 0 };
