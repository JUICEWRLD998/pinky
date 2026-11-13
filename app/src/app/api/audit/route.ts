import { latestClosedEpoch, runAudit } from '../../../../server/audit.ts';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** GET /api/audit?epoch=N. Without `epoch`, the newest epoch every character has revealed. Reads the chain only. */
export async function GET(req: Request): Promise<Response> {
  try {
    const q = new URL(req.url).searchParams.get('epoch');
    if (q !== null && !/^[1-9]\d{0,5}$/.test(q)) return Response.json({ error: 'epoch must be a positive integer' }, { status: 400 });
    const epoch = q === null ? await latestClosedEpoch() : Number(q);
    if (epoch < 1) return Response.json({ error: 'no epoch has been revealed yet' }, { status: 409 });
    return Response.json(await runAudit(epoch));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
