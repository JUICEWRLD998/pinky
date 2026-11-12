// Epoch rotation, run by hand or on a schedule. For each character: settle overdue games, reveal the finished
// epoch secret, commit the next one. A character with a game still inside its window is skipped this round.
// Run from app/:  node --env-file=../.env scripts/epoch.ts [Name ...]
import { epochCommit } from '../../core/rng.ts';
import { GAME, ROOT, signerAccount, view, type GameView } from '../server/chain.ts';
import { NAMES, accountOf, characterAccount, epochSecret } from '../server/characters.ts';

interface Char { epoch: number; epoch_open: boolean; open_games: number }
const only = process.argv.slice(2);
const names = only.length ? only : NAMES;
const root = signerAccount(ROOT, process.env.ROOT_KEY);

async function settleOverdue(account: string) {
  const next = Number(await view<number>('get_next_game_id'));
  for (let id = 1; id < next; id++) {
    const g = await view<GameView | null>('get_game', { game_id: id });
    if (!g || g.character !== account || g.status === 'Settled') continue;
    try {
      const r = await root.callFunctionRaw({ contractId: GAME, methodName: 'claim_timeout', args: { game_id: id } });
      console.log(`  game ${id}: timeout claimed`, r.transaction.hash);
    } catch (e) {
      console.log(`  game ${id}: not settled (${/still open/.test((e as Error).message) ? 'window still open' : 'refused'})`);
    }
  }
}

for (const name of names) {
  const account = accountOf(name);
  let c = await view<Char | null>('get_character', { account_id: account });
  if (!c) { console.log(name, 'is not registered'); continue; }
  if (c.open_games > 0) {
    console.log(name, `has ${c.open_games} unsettled game(s)`);
    await settleOverdue(account);
    c = await view<Char>('get_character', { account_id: account });
  }
  if (c.open_games > 0) { console.log(name, 'skipped: games still open'); continue; }
  const me = characterAccount(name);
  if (c.epoch_open) {
    const r = await me.callFunctionRaw({ contractId: GAME, methodName: 'reveal_epoch', args: { secret: epochSecret(name, c.epoch) } });
    console.log(name, `epoch ${c.epoch} revealed`, r.transaction.hash);
  }
  const next = c.epoch + 1;
  const r = await me.callFunctionRaw({ contractId: GAME, methodName: 'commit_epoch', args: { commit: epochCommit(epochSecret(name, next)) } });
  console.log(name, `epoch ${next} committed`, r.transaction.hash);
}
