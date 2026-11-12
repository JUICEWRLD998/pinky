// Pure helpers for the talking characters: metered cost, the bounded read of the chat, a read the server can
// sign so a player cannot forge it, and canned lines for when the model is unavailable. No network here.
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Fixed demo rate: 1 NEAR is treated as 3 USD when a metered USD cost is moved on chain. Stated in the README. */
export const NEAR_USD_RATE = 3n;
const YOCTO = 10n ** 24n;
const SCALE = 12; // decimal places kept when parsing a USD-per-token price

/** "0.00001" -> 10000000n at 12 places. Throws on anything that is not a plain non-negative decimal. */
export function parseDecimal(s: string, places = SCALE): bigint {
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`bad decimal ${s}`);
  const [w, f = ''] = s.split('.');
  return BigInt(w) * 10n ** BigInt(places) + BigInt((f + '0'.repeat(places)).slice(0, places));
}

export interface Usage { prompt_tokens: number; completion_tokens: number }
export interface Pricing { prompt: string; completion: string } // USD per token, as the model list gives them

/** Cost of one reply in yocto NEAR, rounded up so the character never underpays: ceil(usd / rate). */
export function costYocto(u: Usage, p: Pricing): bigint {
  const usdScaled = BigInt(u.prompt_tokens) * parseDecimal(p.prompt) + BigInt(u.completion_tokens) * parseDecimal(p.completion);
  const num = usdScaled * YOCTO;
  const den = 10n ** BigInt(SCALE) * NEAR_USD_RATE;
  return (num + den - 1n) / den;
}

export interface Read { promiseBps: number; threatBps: number; sincerityBps: number }
export const NEUTRAL: Read = { promiseBps: 0, threatBps: 0, sincerityBps: 0 };
const clamp01 = (x: unknown): number => {
  const n = typeof x === 'number' && Number.isFinite(x) ? x : 0;
  return Math.max(0, Math.min(10000, Math.round(n * 10000)));
};

/** Parse the model's JSON. Anything malformed becomes a neutral read, never an error and never an unbounded one. */
export function parseModelReply(text: string): { line: string; read: Read } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { line?: unknown; read?: { promise?: unknown; threat?: unknown; sincerity?: unknown } };
    if (typeof j.line !== 'string' || !j.line.trim()) return null;
    const r = j.read ?? {};
    return { line: j.line.trim().slice(0, 280), read: { promiseBps: clamp01(r.promise), threatBps: clamp01(r.threat), sincerityBps: clamp01(r.sincerity) } };
  } catch { return null; }
}

/** HMAC over the game id and the read: /api/talk issues it, /api/seal verifies it, so the server keeps no state. */
export function signRead(secret: string, gameId: number, read: Read): string {
  return createHmac('sha256', secret).update(`${gameId}|${read.promiseBps}|${read.threatBps}|${read.sincerityBps}`).digest('hex');
}
export function verifyRead(secret: string, gameId: number, read: Read, sig: string): boolean {
  const want = Buffer.from(signRead(secret, gameId, read), 'hex');
  const got = Buffer.from(/^[0-9a-f]{64}$/.test(sig) ? sig : '0'.repeat(64), 'hex');
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Lines a character says when it cannot afford, or cannot reach, the model. */
export const CANNED: Record<string, string[]> = {
  Mabel: ['I have heard it all before. Put your stake down.', 'Words are cheap. I keep a ledger.'],
  Otis: ['I do what you did last time. Think about that.', 'Same as always. You first, then me.'],
  Fenn: ['Big talk. Let us see the stake.', 'Everyone is my friend until the money is on the table.'],
  Prue: ['I believe in you. Keep it, please.', 'Be kind. It comes back.'],
  Dice: ['Heads, tails. I do not listen, I flip.', 'Talk to the coin.'],
  Abacus: ['I will compute it. Give me a moment.', 'The numbers decide, not the speech.'],
};
export const cannedLine = (name: string, gameId: number): string => {
  const xs = CANNED[name] ?? ['...'];
  return xs[gameId % xs.length];
};
