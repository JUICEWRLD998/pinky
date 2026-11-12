// The six characters: seal and reveal their moves. A move comes from the public policy (core/policy.ts) and a
// private draw from the epoch secret. The language model never decides a move; it only writes lines and a bounded read.
import { createHmac } from 'node:crypto';
import { CHARACTERS, decide, moveFor, type CharacterSpec, type PolicyInputs } from '../../core/policy.ts';
import { NEUTRAL, type Read } from '../../core/inference.ts';
import { commitFor, drawBps, moveForCommit, saltFor } from '../../core/rng.ts';
import { GAME, ROOT, signerAccount, view, type GameView, type Move } from './chain.ts';

/** Share of first-contact games where the stranger broke. Fixed until Phase 4 measures it from chain. */
export const STRANGER_BREAK_BPS = 2000;

interface Pair { games: number; player_keeps: number; player_breaks: number; last_player_move: Move | null; last_character_move: Move | null }
interface Rec { games: number; keeps: number; active: number }
interface Config { y_max_bps: number; drip: number }

export const NAMES = CHARACTERS.map((c) => c.name);
export const accountOf = (name: string): string => `${name.toLowerCase()}.${ROOT}`;
export function specFor(account: string): CharacterSpec {
  const s = CHARACTERS.find((c) => accountOf(c.name) === account);
  if (!s) throw new Error('not a Pinky character');
  return s;
}
const keyOf = (name: string): string | undefined => process.env[`${name.toUpperCase()}_KEY`];
export const characterAccount = (name: string) => signerAccount(accountOf(name), keyOf(name));

/**
 * Epoch secret of one character, derived so nothing is stored: HMAC(EPOCH_MASTER, "name|epoch").
 * Otis's first epoch was committed before this scheme existed and keeps its original secret.
 */
export function epochSecret(name: string, epoch: number): string {
  if (name === 'Otis' && epoch === 1 && process.env.OTIS_EPOCH_SECRET) return process.env.OTIS_EPOCH_SECRET;
  const m = process.env.EPOCH_MASTER;
  if (!m || !/^[0-9a-f]{64}$/.test(m)) throw new Error('EPOCH_MASTER missing or not 64 hex chars');
  return createHmac('sha256', Buffer.from(m, 'hex')).update(`${name}|${epoch}`).digest('hex');
}

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
async function inputsFor(g: GameView, read: Read): Promise<PolicyInputs> {
  return inputsBetween(g.player, g.character, g.stake, read);
}

/** Policy inputs for `me` deciding against `other`, where `other` is the one playing the "player" side of the history. */
async function inputsBetween(player: string, character: string, stakeStr: string, read: Read): Promise<PolicyInputs> {
  const [pair, rec, cfg, jar, bal] = await Promise.all([
    view<Pair>('get_pair', { player, character }),
    view<Rec>('get_record', { account_id: player }),
    view<Config>('get_config'),
    view<string>('get_jar'),
    view<string>('get_balance', { account_id: character }),
  ]);
  const stake = BigInt(stakeStr);
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
    read,
  };
}

export interface SealResult { game_id: number; refused: boolean; tx: string; reason: string }

/** Seal the character's move for a game that is waiting for it. `read` is the signed chat read, or neutral. */
export async function sealGame(gameId: number, read: Read = NEUTRAL): Promise<SealResult> {
  const g = await gameWhen(gameId, 'Opened');
  const spec = specFor(g.character);
  if (g.status !== 'Opened') throw new Error(`game is ${g.status}, not waiting for a seal`);
  const inp = await inputsFor(g, read);
  const d = decide(spec, inp);
  const otis = characterAccount(spec.name);
  const snapshot = JSON.stringify({ v: 1, inputs: inp, pKeepBps: d.pKeepBps, open: d.open });
  if (!d.open) {
    const r = await otis.callFunctionRaw({ contractId: GAME, methodName: 'refuse', args: { game_id: gameId, snapshot } });
    return { game_id: gameId, refused: true, tx: r.transaction.hash, reason: d.reason };
  }
  const s = epochSecret(spec.name, g.epoch);
  const move = moveFor(d.pKeepBps, drawBps(s, id(gameId)));
  const commit = commitFor(id(gameId), move, saltFor(s, id(gameId)));
  const r = await otis.callFunctionRaw({ contractId: GAME, methodName: 'seal', args: { game_id: gameId, commit, snapshot } });
  return { game_id: gameId, refused: false, tx: r.transaction.hash, reason: d.reason };
}

export interface RevealResult { game_id: number; move: Move; tx: string }

/** Reveal the character's move once the player has played. The move is whichever one matches the on-chain commit. */
export async function revealGame(gameId: number): Promise<RevealResult> {
  const g = await gameWhen(gameId, 'Played');
  const spec = specFor(g.character);
  if (g.status !== 'Played' || !g.commit) throw new Error(`game is ${g.status}, not waiting for a reveal`);
  const salt = saltFor(epochSecret(spec.name, g.epoch), id(gameId));
  const move = moveForCommit(id(gameId), salt, g.commit);
  if (!move) throw new Error('commit does not match the epoch secret');
  const otis = characterAccount(spec.name);
  const r = await otis.callFunctionRaw({ contractId: GAME, methodName: 'reveal', args: { game_id: gameId, character_move: move, salt } });
  return { game_id: gameId, move, tx: r.transaction.hash };
}

/**
 * League: a character playing the PLAYER side of a game against another character. Its move follows its own
 * public policy, seen from the other character's history with it, and the same epoch-secret draw. The game
 * is opened and played with the character's own key, so the money moving is the character's own.
 */
export async function leagueMove(gameId: number, playerName: string): Promise<{ move: Move; pKeepBps: number }> {
  const g = await gameWhen(gameId, 'Sealed');
  const spec = CHARACTERS.find((c) => c.name === playerName)!;
  const me = accountOf(playerName);
  if (g.player !== me) throw new Error('not this character game');
  // From my side the opponent plays the "player" role in the pair history and the record.
  const inp = await inputsBetween(g.character, me, g.stake, NEUTRAL);
  const d = decide(spec, inp);
  const p = d.open ? d.pKeepBps : 0;
  const move = moveFor(p, drawBps(epochSecret(playerName, (await view<{ epoch: number }>('get_character', { account_id: me })).epoch), id(gameId)));
  return { move, pKeepBps: p };
}
