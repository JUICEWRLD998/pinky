import { revealGame } from '../../../../server/characters.ts';

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  try {
    const { game_id } = (await req.json()) as { game_id?: number };
    if (!Number.isSafeInteger(game_id) || (game_id as number) < 1) return Response.json({ error: 'game_id must be a positive integer' }, { status: 400 });
    return Response.json(await revealGame(game_id as number));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
