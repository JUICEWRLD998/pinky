import { cheatReveal, type CheatKind } from '../../../../server/cheat.ts';
import { makeLimiter } from '../../../../server/limit.ts';

export const maxDuration = 60;

// Each call makes a character pay gas for a transaction that fails, so it is capped: 10 per IP, 80 overall, per hour.
const limiter = makeLimiter({ perKey: 10, global: 80, windowMs: 3_600_000 });

export async function POST(req: Request): Promise<Response> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  const v = limiter.check(ip);
  if (!v.ok) return Response.json({ error: `too many attempts (${v.reason} limit)`, retryAfterSeconds: Math.ceil(v.retryAfterMs / 1000) }, { status: 429 });
  try {
    const { game_id, kind } = (await req.json()) as { game_id?: number; kind?: string };
    if (!Number.isSafeInteger(game_id) || (game_id as number) < 1) return Response.json({ error: 'game_id must be a positive integer' }, { status: 400 });
    if (kind !== 'wrong_move' && kind !== 'replay') return Response.json({ error: 'kind must be wrong_move or replay' }, { status: 400 });
    return Response.json(await cheatReveal(game_id as number, kind as CheatKind));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
