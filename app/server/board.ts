// Read-only views shared by the league and character screens. Everything comes from contract views.
import { ROOT, view, type GameView } from './chain.ts';
import { CHARACTERS } from '../../core/policy.ts';
import { labelOf, registeredAccounts } from './characters.ts';

export interface CharacterView { epoch: number; games: number; keeps: number; epoch_open: boolean; open_games: number }
export interface PoolView { total_shares: string; epoch: number; balance: string; value_per_unit: string }
export interface BoardRow { name: string; account: string; bal: bigint; games: number; keeps: number; epoch: number; outside: boolean }

const FIXED = new Set(CHARACTERS.map((c) => c.name));

/** Every registered character and outside agent, richest first. */
export async function board(): Promise<BoardRow[]> {
  const registered = await registeredAccounts();
  const rows = await Promise.all(registered.map(async (account) => {
    const [bal, ch] = await Promise.all([view<string>('get_balance', { account_id: account }), view<CharacterView>('get_character', { account_id: account })]);
    const name = labelOf(account);
    return { name, account, bal: BigInt(bal), games: ch.games, keeps: ch.keeps, epoch: ch.epoch, outside: !FIXED.has(name) };
  }));
  return rows.sort((x, y) => (x.bal === y.bal ? 0 : x.bal > y.bal ? -1 : 1));
}

/** The newest settled games that pass `keep`, newest first. Looks back over at most `window` game ids. */
export async function settledGames(limit: number, keep: (g: GameView) => boolean, window = 160): Promise<GameView[]> {
  const next = Number(await view<number>('get_next_game_id'));
  const out: GameView[] = [];
  const BATCH = 20;
  for (let hi = next - 1; hi >= 1 && hi > next - 1 - window && out.length < limit; hi -= BATCH) {
    const ids = Array.from({ length: Math.min(BATCH, hi) }, (_, i) => hi - i);
    const games = await Promise.all(ids.map((id) => view<GameView | null>('get_game', { game_id: id })));
    for (const g of games) if (g && g.status === 'Settled' && keep(g) && out.length < limit) out.push(g);
  }
  return out;
}

/** A name a person can read for any account: a character, an outside agent, or a guest. */
export function whoIs(account: string): { label: string; href: string | null } {
  if (account.endsWith(`.guests.${ROOT}`)) return { label: 'a guest', href: null };
  const label = labelOf(account);
  return { label, href: `/c/${label.toLowerCase()}` };
}

export const near4 = (y: string | bigint): string => {
  const v = BigInt(y);
  return `${v / 10n ** 24n}.${((v % 10n ** 24n) / 10n ** 20n).toString().padStart(4, '0')}`;
};
