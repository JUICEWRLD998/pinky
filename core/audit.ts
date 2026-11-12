// Replay of one finished game from public data. Pure: the caller fetches the game, the config and the revealed
// epoch secret from the chain. A game passes only when every check that can be recomputed from chain data holds.
import { decide, moveFor, type CharacterSpec, type PolicyInputs } from './policy.ts';
import { commitFor, drawBps, saltFor } from './rng.ts';
import type { Move } from './payoff.ts';

export interface AuditGame {
  id: number;
  character: string;
  stake: string;
  status: string;
  epoch: number;
  commit: string | null;
  snapshot: string | null;
  jar_at_seal: string;
  char_balance_at_seal: string;
  character_move: Move | null;
  outcome: { kind: string } | null;
}
export interface AuditConfig { y_max_bps: number; drip: number }
export interface Check { name: string; ok: boolean; detail?: string }
export interface GameAudit { id: number; verdict: 'PASS' | 'FAIL' | 'SKIP'; checks: Check[]; note?: string }

/** Facts the contract recorded itself, so the character cannot invent them in the snapshot. */
export function recordedFacts(g: AuditGame, cfg: AuditConfig): { stakeBps: number; jarRateBps: number } {
  const stake = BigInt(g.stake);
  const bankroll = BigInt(g.char_balance_at_seal) + stake;
  const cap = (stake * BigInt(cfg.y_max_bps)) / 10000n;
  const drip = BigInt(g.jar_at_seal) / BigInt(cfg.drip);
  const bonus = cap < drip ? cap : drip;
  return { stakeBps: Number((stake * 10000n) / (bankroll === 0n ? 1n : bankroll)), jarRateBps: Number((bonus * 10000n) / stake) };
}

export function auditGame(g: AuditGame, spec: CharacterSpec, secret: string | null, cfg: AuditConfig): GameAudit {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const done = (note?: string): GameAudit => ({ id: g.id, verdict: checks.every((c) => c.ok) ? 'PASS' : 'FAIL', checks, note });

  if (g.status !== 'Settled') return { id: g.id, verdict: 'SKIP', checks, note: `game is ${g.status}, not finished` };
  const kind = g.outcome?.kind ?? '';
  if (kind === 'character_timeout' || kind === 'player_timeout') {
    return { id: g.id, verdict: 'SKIP', checks, note: `${kind}: no sealed move to replay` };
  }
  let snap: { inputs: PolicyInputs; pKeepBps: number; open: boolean } | null = null;
  try { snap = g.snapshot ? JSON.parse(g.snapshot) : null; } catch { snap = null; }
  add('snapshot is present and parses', snap !== null);
  if (!snap) return done();

  const d = decide(spec, snap.inputs);
  add('open/closed door matches the public policy', d.open === snap.open, `policy ${d.open ? 'open' : 'closed'}, snapshot ${snap.open ? 'open' : 'closed'}`);
  add('chance of keeping matches the public policy', d.pKeepBps === snap.pKeepBps, `policy ${d.pKeepBps}, snapshot ${snap.pKeepBps}`);
  const facts = recordedFacts(g, cfg);
  add('stake share matches what the contract recorded', snap.inputs.stakeBps === facts.stakeBps, `recorded ${facts.stakeBps}, snapshot ${snap.inputs.stakeBps}`);
  add('Jar rate matches what the contract recorded', snap.inputs.jarRateBps === facts.jarRateBps, `recorded ${facts.jarRateBps}, snapshot ${snap.inputs.jarRateBps}`);

  if (kind === 'refused') {
    add('a refusal needs a closed door', !d.open);
    return done('closed door; stakes were returned');
  }
  if (!secret) { add('epoch secret is revealed on chain', false, 'not revealed yet'); return done(); }
  const id = String(g.id);
  const draw = drawBps(secret, id);
  const move = moveFor(d.pKeepBps, draw);
  add('revealed move equals policy and private draw', move === g.character_move, `expected ${move} (draw ${draw}), revealed ${g.character_move}`);
  add('on-chain commit equals sha256(game|move|salt)', g.commit === commitFor(id, move, saltFor(secret, id)));
  return done();
}
