// Sliding-window rate limiter, in memory. Guards the usher, which spends real testnet NEAR per guest.
// It resets when the server restarts and is per process, which the README states as a limit.
export interface LimiterOptions {
  /** Calls allowed per key (an IP address) inside the window. */
  perKey: number;
  /** Calls allowed across all keys inside the window: a hard cap on what the usher can spend. */
  global: number;
  windowMs: number;
  now?: () => number;
}

export type Verdict = { ok: true } | { ok: false; reason: 'per-key' | 'global'; retryAfterMs: number };

export function makeLimiter(o: LimiterOptions) {
  const now = o.now ?? Date.now;
  const hits = new Map<string, number[]>();
  let all: number[] = [];

  const fresh = (xs: number[], t: number) => xs.filter((x) => x > t - o.windowMs);

  return {
    check(key: string): Verdict {
      const t = now();
      all = fresh(all, t);
      const mine = fresh(hits.get(key) ?? [], t);
      if (mine.length >= o.perKey) {
        hits.set(key, mine);
        return { ok: false, reason: 'per-key', retryAfterMs: mine.length ? mine[0] + o.windowMs - t : o.windowMs };
      }
      if (all.length >= o.global) {
        hits.set(key, mine);
        return { ok: false, reason: 'global', retryAfterMs: all[0] + o.windowMs - t };
      }
      mine.push(t);
      all.push(t);
      hits.set(key, mine);
      return { ok: true };
    },
  };
}
