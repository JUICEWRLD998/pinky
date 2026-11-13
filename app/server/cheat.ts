// The judge page's "try to cheat" panel, character side. The server makes the CHARACTER send a reveal it should
// not be able to land: the other move against its own commit, or a second reveal on a finished game. The
// transaction is real and is expected to fail; the answer is the contract's own refusal and the hash to check it.
// Only guest games are accepted, and a refused transaction changes no state, so this cannot move anyone's money.
import { actions } from 'near-api-js';
import { moveForCommit, saltFor } from '../../core/rng.ts';
import { refusalOf } from '../src/lib/refusal.ts';
import { GAME, GUESTS, GUEST_GAS, view, type GameView, type Move } from './chain.ts';
import { characterAccount, epochSecret, specOf } from './characters.ts';

export type CheatKind = 'wrong_move' | 'replay';
export interface CheatResult { game_id: number; kind: CheatKind; sent: { character_move: Move }; tx: string; refused: string | null }

const other = (m: Move): Move => (m === 'KEEP' ? 'BREAK' : 'KEEP');

export async function cheatReveal(gameId: number, kind: CheatKind): Promise<CheatResult> {
  const g = await view<GameView | null>('get_game', { game_id: gameId });
  if (!g) throw new Error('no such game');
  if (!g.player.endsWith(`.${GUESTS}`)) throw new Error('only a guest game can be used for this');
  if (!g.commit) throw new Error('this game has no sealed move');
  const need = kind === 'wrong_move' ? 'Played' : 'Settled';
  if (g.status !== need) throw new Error(`game is ${g.status}; this attempt needs a game that is ${need}`);

  const spec = await specOf(g.character);
  const salt = saltFor(epochSecret(spec.name, g.epoch), String(gameId));
  const real = moveForCommit(String(gameId), salt, g.commit);
  if (!real) throw new Error('commit does not match the epoch secret');
  // wrong_move: the move that was NOT sealed, with the right salt. replay: the true reveal, sent a second time.
  const character_move = kind === 'wrong_move' ? other(real) : real;

  const r = await characterAccount(spec.name).signAndSendTransaction({
    receiverId: GAME,
    actions: [actions.functionCall('reveal', { game_id: gameId, character_move, salt }, GUEST_GAS * 3n, 0n)],
    throwOnFailure: false,
  });
  return { game_id: gameId, kind, sent: { character_move }, tx: r.transaction.hash, refused: refusalOf(r) };
}
