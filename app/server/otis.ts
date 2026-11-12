// Otis, the mirror: seals and reveals his moves. The move comes from the public policy (core/policy.ts)
// and a private draw from the epoch secret. No language model in Phase 3: his lines are scripted.
import { CHARACTERS, NEUTRAL_READ, decide, moveFor, type PolicyInputs } from '../../core/policy.ts';
import { commitFor, drawBps, moveForCommit, saltFor } from '../../core/rng.ts';
import { GAME, OTIS, signerAccount, view, type GameView, type Move } from './chain.ts';

/** Share of first-contact games where the stranger broke. Fixed until Phase 4 measures it from chain. */
export const STRANGER_BREAK_BPS = 2000;

interface Pair { games: number; player_keeps: number; player_breaks: number; last_player_move: Move | null; last_character_move: Move | null }
interface Rec { games: number; keeps: number; active: number }
interface Config { y_max_bps: number; drip: number }

const spec = CHARACTERS.find((c) => c.name === 'Otis')!;

function secret(): string {
  const s = process.env.OTIS_EPOCH_SECRET;
  if (!s || !/^[0-9a-f]{64}$/.test(s)) throw new Error('OTIS_EPOCH_SECRET missing or not 64 hex chars');
  return s;
}

const key = () => process.env.OTIS_KEY;

/** The player's transaction may reach our RPC node a moment after their own, so poll until the game has the status we need. */
async function gameWhen(gameId: number, status: GameView['status'], tries = 20): Promise<GameView> {
  let g: GameView | null = null;
  for (let i = 0; i < tries; i++) {
    g = await view<GameView | null>('get_game', { game_id: gameId });
    if (g && g.status === status) return g;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!g) throw new Error('no such game');
  return g;
}
const id = (n: number | string) => String(n);

/** The facts the policy reads, built only from contract views so the audit can rebuild them. */
async function inputsFor(g: GameView): Promise<PolicyInputs> {
  const [pair, rec, cfg, jar, bal] = await Promise.all([
    view<Pair>('get_pair', { player: g.player, character: OTIS }),
    view<Rec>('get_record', { account_id: g.player }),
    view<Config>('get_config'),
    view<string>('get_jar'),
    view<string>('get_balance', { account_id: OTIS }),
  ]);
  const stake = BigInt(g.stake);
  // The stake already left Otis's ledger balance at open_game, so add it back for the bankroll he decided with.
  const bankroll = BigInt(bal) + stake;
  const bonus = (() => {
    const cap = (stake * BigInt(cfg.y_max_bps)) / 10000n;
    const drip = BigInt(jar) / BigInt(cfg.drip);
    return cap < drip ? cap : drip;
  })();
  return {
    vsPlayer: { games: pair.games, playerKeeps: pair.player_keeps, playerBreaks: pair.player_breaks, lastPlayerMove: pair.last_player_move, apologyPaid: false },
    record: { games: rec.games, keepRateBps: rec.games === 0 ? 5000 : Math.floor((rec.keeps * 10000) / rec.games) },
    strangerBreakRateBps: STRANGER_BREAK_BPS,
    stakeBps: Number((stake * 10000n) / (bankroll === 0n ? 1n : bankroll)),
    jarRateBps: Number((bonus * 10000n) / stake),
    read: NEUTRAL_READ,
  };
}

export interface SealResult { game_id: number; refused: boolean; tx: string; reason: string }

/** Seal Otis's move for a game that is waiting for it. Throws on anything else. */
export async function sealGame(gameId: number): Promise<SealResult> {
  const g = await gameWhen(gameId, 'Opened');
  if (g.character !== OTIS) throw new Error('not an Otis game');
  if (g.status !== 'Opened') throw new Error(`game is ${g.status}, not waiting for a seal`);
  const inp = await inputsFor(g);
  const d = decide(spec, inp);
  const otis = signerAccount(OTIS, key());
  const snapshot = JSON.stringify({ v: 1, inputs: inp, pKeepBps: d.pKeepBps, open: d.open });
  if (!d.open) {
    const r = await otis.callFunctionRaw({ contractId: GAME, methodName: 'refuse', args: { game_id: gameId, snapshot } });
    return { game_id: gameId, refused: true, tx: r.transaction.hash, reason: d.reason };
  }
  const s = secret();
  const move = moveFor(d.pKeepBps, drawBps(s, id(gameId)));
  const commit = commitFor(id(gameId), move, saltFor(s, id(gameId)));
  const r = await otis.callFunctionRaw({ contractId: GAME, methodName: 'seal', args: { game_id: gameId, commit, snapshot } });
  return { game_id: gameId, refused: false, tx: r.transaction.hash, reason: d.reason };
}

export interface RevealResult { game_id: number; move: Move; tx: string }

/** Reveal Otis's move once the player has played. The move is whichever one matches the on-chain commit. */
export async function revealGame(gameId: number): Promise<RevealResult> {
  const g = await gameWhen(gameId, 'Played');
  if (g.character !== OTIS) throw new Error('not an Otis game');
  if (g.status !== 'Played' || !g.commit) throw new Error(`game is ${g.status}, not waiting for a reveal`);
  const salt = saltFor(secret(), id(gameId));
  const move = moveForCommit(id(gameId), salt, g.commit);
  if (!move) throw new Error('commit does not match the epoch secret');
  const otis = signerAccount(OTIS, key());
  const r = await otis.callFunctionRaw({ contractId: GAME, methodName: 'reveal', args: { game_id: gameId, character_move: move, salt } });
  return { game_id: gameId, move, tx: r.transaction.hash };
}
