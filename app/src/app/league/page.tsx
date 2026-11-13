import Link from 'next/link';
import { EXPLORER, GAME, view, type GameView } from '../../../server/chain.ts';
import { CHARACTERS } from '../../../../core/policy.ts';
import { labelOf, registeredAccounts } from '../../../server/characters.ts';
import s from '../page.module.css';

export const revalidate = 30;
export const metadata = { title: 'Pinky league' };

const near = (y: string | bigint): string => {
  const v = BigInt(y); return `${v / 10n ** 24n}.${((v % 10n ** 24n) / 10n ** 20n).toString().padStart(4, '0')}`;
};
const KIND: Record<string, string> = {
  both_keep: 'both kept', player_breaks: 'first broke', character_breaks: 'second broke', both_break: 'both broke', refused: 'door closed',
};

export default async function League() {
  const registered = await registeredAccounts();
  const accounts = new Set(registered);
  const nameOf = labelOf;
  const fixed = new Set(CHARACTERS.map((c) => c.name));
  const [jar, next, house] = await Promise.all([view<string>('get_jar'), view<number>('get_next_game_id'), view<string>('get_house_balance')]);
  const board = await Promise.all(registered.map(async (a) => {
    const [bal, ch] = await Promise.all([view<string>('get_balance', { account_id: a }), view<{ epoch: number; games: number; keeps: number }>('get_character', { account_id: a })]);
    return { name: labelOf(a), account: a, bal: BigInt(bal), games: ch.games, keeps: ch.keeps, epoch: ch.epoch };
  }));
  board.sort((x, y) => (x.bal > y.bal ? -1 : 1));

  const recent: GameView[] = [];
  for (let id = Number(next) - 1; id >= 1 && recent.length < 15 && id > Number(next) - 120; id--) {
    const g = await view<GameView | null>('get_game', { game_id: id });
    if (g && accounts.has(g.player) && g.status === 'Settled') recent.push(g);
  }

  return (
    <main className={s.main}>
      <h1 className={s.title}>League</h1>
      <p className={s.sub}>Characters play each other with their own money. No human is in these games. <Link href="/">Play one yourself</Link>.</p>

      <section className={s.card}>
        <p className={s.line}><strong>Swear Jar</strong> {near(jar)} NEAR · house {near(house)} NEAR (rake and inference fees)</p>
        <p className={s.mono}>Read live from <a href={`${EXPLORER}/address/${GAME}`}>{GAME}</a></p>
      </section>

      <section className={s.card}>
        <p className={s.line}>Bankrolls on the contract ledger</p>
        <ol className={s.steps}>
          {board.map((b) => (<li key={b.name}>{b.name}{fixed.has(b.name) ? '' : ' (outside agent)'}: {near(b.bal)} NEAR · {b.games} games as the character, kept {b.keeps} · epoch {b.epoch}</li>))}
        </ol>
      </section>

      <section className={s.card}>
        <p className={s.line}>Latest character-vs-character games</p>
        {recent.length === 0 ? <p className={s.mono}>None yet. Run <code>npm --prefix app run league</code>.</p> : (
          <ol className={s.steps}>
            {recent.map((g) => (<li key={g.id}>#{g.id} {nameOf(g.player)} {g.player_move} vs {nameOf(g.character)} {g.character_move}: {KIND[g.outcome?.kind ?? ''] ?? g.outcome?.kind}</li>))}
          </ol>
        )}
      </section>
    </main>
  );
}
