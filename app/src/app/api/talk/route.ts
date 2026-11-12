import { makeLimiter } from '../../../../server/limit.ts';
import { MAX_MESSAGE, talk } from '../../../../server/talk.ts';

export const maxDuration = 60;

// Each reply costs the character real (testnet) money: 3 per game, 60 per IP per hour.
const perGame = makeLimiter({ perKey: 3, global: 10_000, windowMs: 3_600_000 });
const perIp = makeLimiter({ perKey: 60, global: 600, windowMs: 3_600_000 });

export async function POST(req: Request): Promise<Response> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  try {
    const { game_id, message } = (await req.json()) as { game_id?: number; message?: string };
    if (!Number.isSafeInteger(game_id) || (game_id as number) < 1) return Response.json({ error: 'game_id must be a positive integer' }, { status: 400 });
    if (typeof message !== 'string' || message.length > MAX_MESSAGE * 2) return Response.json({ error: `message must be text under ${MAX_MESSAGE} characters` }, { status: 400 });
    if (!perIp.check(ip).ok || !perGame.check(String(game_id)).ok) return Response.json({ error: 'too many messages, seal the game' }, { status: 429 });
    return Response.json(await talk(game_id as number, message));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
