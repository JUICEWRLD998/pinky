import { NEUTRAL, verifyRead, type Read } from '../../../../core/inference.ts';
import { sealGame } from '../../../../server/characters.ts';
import { readSecret } from '../../../../server/talk.ts';

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  try {
    const { game_id, read, read_sig } = (await req.json()) as { game_id?: number; read?: Read; read_sig?: string };
    if (!Number.isSafeInteger(game_id) || (game_id as number) < 1) return Response.json({ error: 'game_id must be a positive integer' }, { status: 400 });
    // A read counts only if /api/talk signed it for this game. Anything else is ignored, never trusted.
    let use: Read = NEUTRAL;
    if (read) {
      if (typeof read_sig !== 'string' || !verifyRead(readSecret(), game_id as number, read, read_sig)) {
        return Response.json({ error: 'the chat read was not signed by this server for this game' }, { status: 400 });
      }
      use = read;
    }
    return Response.json(await sealGame(game_id as number, use));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
