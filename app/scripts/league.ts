// League round runner: characters play each other with their own money, no human involved. For each round a pair
// is chosen from the next game id (so repeated runs rotate through every pairing), the first character opens a
// game as the player, the second seals, the first plays by its public policy, the second reveals.
// Run from app/:  node --env-file=../.env scripts/league.ts [rounds]
import { getTransactionLastResult } from 'near-api-js';
import { CHARACTERS } from '../../core/policy.ts';
import { GAME, GUEST_GAS, ROOT, milli, view, type GameView } from '../server/chain.ts';
import { accountOf, characterAccount, leagueMove, revealGame, sealGame } from '../server/characters.ts';

const rounds = Number(process.argv[2] ?? 6);
const stake = milli(10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Everyone registered on the contract under ROOT whose key this runner holds: the six, plus any outside agent entered with enter_agent.
const registered = (await view<[string, unknown][]>('list_characters')).map(([a]) => a).filter((a) => a.endsWith(`.${ROOT}`)).sort();
const nameOf = (account: string): string => CHARACTERS.find((c) => accountOf(c.name) === account)?.name ?? account.slice(0, -(ROOT.length + 1));
const NAMES = registered.map(nameOf).filter((n) => process.env[`${n.toUpperCase().replace(/-/g, '_')}_KEY`]);
const pairs: [string, string][] = NAMES.flatMap((a) => NAMES.filter((b) => b !== a).map((b) => [a, b] as [string, string]));
console.log('league field:', NAMES.join(', '));

let played = 0;
for (let r = 0; r < rounds; r++) {
  const next = Number(await view<number>('get_next_game_id'));
  const [a, b] = pairs[next % pairs.length];
  try {
    const open = await characterAccount(a).callFunctionRaw({ contractId: GAME, methodName: 'open_game', args: { character: accountOf(b), stake: stake.toString() }, gas: GUEST_GAS * 3n });
    const id = Number(getTransactionLastResult(open));
    const sealed = await sealGame(id);
    if (sealed.refused) { console.log(`game ${id}: ${b} closed the door on ${a}`); continue; }
    const { move, pKeepBps } = await leagueMove(id, a);
    await characterAccount(a).callFunctionRaw({ contractId: GAME, methodName: 'play', args: { game_id: id, player_move: move }, gas: GUEST_GAS * 3n });
    const rev = await revealGame(id);
    await sleep(1200);
    const g = await view<GameView>('get_game', { game_id: id });
    console.log(`game ${id}: ${a} (${move}, p=${pKeepBps}) vs ${b} (${rev.move}) -> ${g.outcome?.kind ?? g.status}`);
    played++;
  } catch (e) {
    console.log(`round ${r}: ${a} vs ${b} skipped: ${(e as Error).message.slice(0, 120)}`);
  }
}
console.log(`league: ${played}/${rounds} rounds played`);
