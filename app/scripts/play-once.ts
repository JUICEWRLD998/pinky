// A stranger's whole game from the command line, using only what a browser has: a fresh key, a function-call
// guest account, the four calls. Saves the four transaction hashes as a receipt.
// Run from app/:  node --env-file=../.env scripts/play-once.ts [KEEP|BREAK]
import { mkdirSync, writeFileSync } from 'node:fs';
import { KeyPair, getTransactionLastResult } from 'near-api-js';
import { GAME, GUEST_GAS, OTIS, milli, signerAccount, view, type GameView, type Move } from '../server/chain.ts';
import { revealGame, sealGame } from '../server/characters.ts';
import { usherGuest } from '../server/usher.ts';

const move = (process.argv[2] ?? 'KEEP').toUpperCase() as Move;
if (move !== 'KEEP' && move !== 'BREAK') throw new Error('move must be KEEP or BREAK');

const t0 = Date.now();
const lap = (label: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${label}`);

const kp = KeyPair.fromRandom('ed25519');
const guest = await usherGuest(kp.getPublicKey().toString());
lap(`guest ${guest.account_id} created and funded`);
const me = signerAccount(guest.account_id, kp.toString());

const stake = milli(10);
const opened = await me.callFunctionRaw({ contractId: GAME, methodName: 'open_game', args: { character: OTIS, stake: stake.toString() }, gas: GUEST_GAS });
const gameId = Number(getTransactionLastResult(opened));
lap(`open_game tx ${opened.transaction.hash} (game ${gameId})`);

const sealed = await sealGame(gameId);
lap(`seal tx ${sealed.tx}${sealed.refused ? ' (REFUSED)' : ''}`);
if (sealed.refused) throw new Error('Otis refused a stranger: ' + sealed.reason);

const played = await me.callFunctionRaw({ contractId: GAME, methodName: 'play', args: { game_id: gameId, player_move: move }, gas: GUEST_GAS });
lap(`play ${move} tx ${played.transaction.hash}`);

const revealed = await revealGame(gameId);
lap(`reveal ${revealed.move} tx ${revealed.tx}`);

const g = await view<GameView>('get_game', { game_id: gameId });
const seconds = (Date.now() - t0) / 1000;
console.log('outcome', g.outcome?.kind, 'player payout', g.outcome?.player_payout, 'jar_delta', g.outcome?.jar_delta);

mkdirSync(new URL('../../docs/receipts/', import.meta.url), { recursive: true });
writeFileSync(
  new URL(`../../docs/receipts/game-${gameId}.json`, import.meta.url),
  JSON.stringify({
    game_id: gameId, guest: guest.account_id, character: OTIS, stake: stake.toString(), seconds, at: new Date().toISOString(),
    txs: { create_guest: guest.create_tx, deposit: guest.deposit_tx, open: opened.transaction.hash, seal: sealed.tx, play: played.transaction.hash, reveal: revealed.tx },
    moves: { player: move, character: revealed.move }, outcome: g.outcome,
  }, null, 2) + '\n',
);
console.log(`receipt saved, ${seconds.toFixed(1)}s total`);
