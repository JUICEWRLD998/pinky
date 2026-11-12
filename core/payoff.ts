// Payoff rules for one Pinky game. Integer maths only (bigint), so the contract can match it exactly.
// Conservation: player + character + jarDelta + house === 2 * stake, for every outcome.

export type Move = 'KEEP' | 'BREAK';

export interface Params {
  /** House rake in basis points of the pot, taken whenever at least one side breaks. */
  rakeBps: bigint;
  /** Largest Jar bonus per side, in basis points of the stake. */
  yMaxBps: bigint;
  /** The Jar pays at most 1/drip of itself to each side per game. Must be at least 2. */
  drip: bigint;
  /** Share of the stake a player forfeits to the character for opening a game and never playing. */
  forfeitBps: bigint;
}

export const DEFAULT_PARAMS: Params = {
  rakeBps: 200n,
  yMaxBps: 5000n,
  drip: 40n,
  forfeitBps: 500n,
};

export interface Settlement {
  /** Amount paid out to the player (stake already escrowed). */
  player: bigint;
  /** Amount paid out to the character. */
  character: bigint;
  /** Change in the Swear Jar balance (negative when the Jar pays a bonus). */
  jarDelta: bigint;
  /** Amount kept by the house. */
  house: bigint;
}

const BPS = 10000n;

export function validateParams(p: Params): void {
  if (p.rakeBps < 0n || p.rakeBps > 2500n) throw new Error('rakeBps must be 0..2500');
  if (p.yMaxBps < 0n || p.yMaxBps > 10000n) throw new Error('yMaxBps must be 0..10000');
  if (p.drip < 2n) throw new Error('drip must be at least 2');
  if (p.forfeitBps < 0n || p.forfeitBps > 5000n) throw new Error('forfeitBps must be 0..5000');
}

/** Jar bonus each side gets when both keep: min(stake * yMax, jar / drip). */
export function bonus(stake: bigint, jar: bigint, p: Params): bigint {
  const cap = (stake * p.yMaxBps) / BPS;
  const share = jar / p.drip;
  return cap < share ? cap : share;
}

/** Bonus as basis points of the stake: what the table shows as the Jar rate. */
export function jarRateBps(stake: bigint, jar: bigint, p: Params): bigint {
  if (stake <= 0n) return 0n;
  return (bonus(stake, jar, p) * BPS) / stake;
}

export function settle(stake: bigint, player: Move, character: Move, jar: bigint, p: Params): Settlement {
  if (stake <= 0n) throw new Error('stake must be positive');
  if (jar < 0n) throw new Error('jar must not be negative');
  const pot = 2n * stake;
  const fee = (pot * p.rakeBps) / BPS;
  if (player === 'KEEP' && character === 'KEEP') {
    const b = bonus(stake, jar, p);
    return { player: stake + b, character: stake + b, jarDelta: -2n * b, house: 0n };
  }
  if (player === 'BREAK' && character === 'KEEP') {
    return { player: pot - fee, character: 0n, jarDelta: 0n, house: fee };
  }
  if (player === 'KEEP' && character === 'BREAK') {
    return { player: 0n, character: pot - fee, jarDelta: 0n, house: fee };
  }
  return { player: 0n, character: 0n, jarDelta: pot - fee, house: fee };
}

/** The character did not reveal in time: the player takes both stakes, no rake. */
export function settleCharacterTimeout(stake: bigint): Settlement {
  return { player: 2n * stake, character: 0n, jarDelta: 0n, house: 0n };
}

/** The player opened a game and never played: forfeit a share of the stake to the character. */
export function settlePlayerTimeout(stake: bigint, p: Params): Settlement {
  const pen = (stake * p.forfeitBps) / BPS;
  return { player: stake - pen, character: stake + pen, jarDelta: 0n, house: 0n };
}

export function total(s: Settlement): bigint {
  return s.player + s.character + s.jarDelta + s.house;
}

/**
 * Check conservation and non-negativity of a settle function over many random cases.
 * Returns the first violation found, or null. Used by the tests, with a planted leaky
 * settle function to prove the check can fail.
 */
export function checkConservation(
  fn: typeof settle,
  p: Params,
  cases: Array<{ stake: bigint; jar: bigint }>,
): string | null {
  const moves: Move[] = ['KEEP', 'BREAK'];
  for (const c of cases) {
    for (const a of moves) {
      for (const b of moves) {
        const s = fn(c.stake, a, b, c.jar, p);
        if (total(s) !== 2n * c.stake) {
          return `sum ${total(s)} != ${2n * c.stake} for stake=${c.stake} jar=${c.jar} ${a}/${b}`;
        }
        if (s.player < 0n || s.character < 0n || s.house < 0n) {
          return `negative payout for stake=${c.stake} jar=${c.jar} ${a}/${b}`;
        }
        if (c.jar + s.jarDelta < 0n) {
          return `jar goes negative for stake=${c.stake} jar=${c.jar} ${a}/${b}`;
        }
      }
    }
  }
  return null;
}
