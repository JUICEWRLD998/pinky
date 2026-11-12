// Randomness and commitments. Node built-ins only.
import { createHash, createHmac } from 'node:crypto';
import type { Move } from './payoff.ts';

/** Small seeded generator for simulations. Not for money-handling randomness. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hmac(secretHex: string, label: string, gameId: string): Buffer {
  return createHmac('sha256', Buffer.from(secretHex, 'hex')).update(`${label}|${gameId}`).digest();
}

/**
 * The character's private draw for one game: an integer 0..9999.
 * First 32 bits of HMAC-SHA256(epoch_secret, "draw|game_id") mod 10000. The modulo bias is
 * (2^32 mod 10000) / 2^32, about 1.7e-6, which is why it is accepted and written down.
 */
export function drawBps(secretHex: string, gameId: string): number {
  return hmac(secretHex, 'draw', gameId).readUInt32BE(0) % 10000;
}

/** Salt for the commit of one game, derived so the server needs no database. */
export function saltFor(secretHex: string, gameId: string): string {
  return hmac(secretHex, 'salt', gameId).toString('hex');
}

/** commit = sha256("game_id|MOVE|salt_hex"), hex. */
export function commitFor(gameId: string, move: Move, saltHex: string): string {
  return createHash('sha256').update(`${gameId}|${move}|${saltHex}`).digest('hex');
}

/** Public commitment to an epoch secret. Revealed secret must hash to this. */
export function epochCommit(secretHex: string): string {
  return createHash('sha256').update(Buffer.from(secretHex, 'hex')).digest('hex');
}

/** Find which move a commit belongs to, or null. Used by the reveal route and the audit. */
export function moveForCommit(gameId: string, saltHex: string, commit: string): Move | null {
  for (const m of ['KEEP', 'BREAK'] as Move[]) {
    if (commitFor(gameId, m, saltHex) === commit) return m;
  }
  return null;
}
