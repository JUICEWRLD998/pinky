import { makeLimiter } from '../../../../server/limit.ts';
import { usherGuest } from '../../../../server/usher.ts';

export const maxDuration = 60;

// 3 guests per IP per hour, 40 per hour overall: a hard cap on the testnet NEAR the usher can spend.
const limiter = makeLimiter({ perKey: 3, global: 40, windowMs: 3_600_000 });

export async function POST(req: Request): Promise<Response> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  const v = limiter.check(ip);
  if (!v.ok) {
    return Response.json({ error: `usher is busy (${v.reason} limit)`, retryAfterSeconds: Math.ceil(v.retryAfterMs / 1000) }, { status: 429 });
  }
  try {
    const { public_key } = (await req.json()) as { public_key?: string };
    if (typeof public_key !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(public_key)) {
      return Response.json({ error: 'public_key must be an ed25519 key' }, { status: 400 });
    }
    return Response.json(await usherGuest(public_key));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
