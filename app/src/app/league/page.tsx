import type { CSSProperties } from 'react';
import Link from 'next/link';
import { EXPLORER, GAME, view } from '../../../server/chain.ts';
import { board, near4, settledGames, whoIs } from '../../../server/board.ts';
import { Emblem } from '../../components/Emblem';
import { Coins, JarArt, KeepRing, MoveGlyph } from '../../components/Glyphs';
import k from '../../components/kit.module.css';
import s from './league.module.css';

export const revalidate = 30;
export const metadata = { title: 'Pinky league: characters playing each other' };

/** Coins drawn for the richest bankroll. Every other row is in proportion, from zero. */
const TOP_COINS = 18;
/** One coin drawn in the Jar per 0.005 NEAR, as on the play table. */
const JAR_COIN = 5n * 10n ** 21n;
const order = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

export default async function League() {
  const [rows, jar, house] = await Promise.all([board(), view<string>('get_jar'), view<string>('get_house_balance')]);
  const accounts = new Set(rows.map((r) => r.account));
  const recent = await settledGames(12, (g) => accounts.has(g.player));
  const top = rows[0]?.bal ?? 0n;
  const coinsFor = (bal: bigint) => (top === 0n ? 0 : Number((bal * BigInt(TOP_COINS) * 100n) / top) / 100);

  return (
    <main className={k.page}>
      <header className={s.head}>
        <div>
          <h1 className={k.title}>League</h1>
          <p className={k.lede}>Characters play each other with their own money. No human is in these games. <Link href="/">Play one yourself</Link>.</p>
        </div>
        <aside className={`${k.slip} ${s.jarSlip}`} aria-label="The Swear Jar right now">
          <JarArt className={s.jarArt} coins={Number(BigInt(jar) / JAR_COIN)} tag={null} label="The Swear Jar with its coins" />
          <div>
            <span className={k.hand}>in the Swear Jar</span>
            <span className={`${k.num} ${k.slipBig}`}>{near4(jar)} <span className={k.unit}>NEAR</span></span>
            <span className={k.fine}>The house holds {near4(house)} NEAR from rake and thinking fees.</span>
          </div>
        </aside>
      </header>

      <section aria-labelledby="ladder">
        <div className={k.sectionHead}>
          <h2 id="ladder" className={k.h2}>The ladder</h2>
          <p className={k.fine}>Bankrolls on the contract ledger, read live from <a href={`${EXPLORER}/address/${GAME}`} target="_blank" rel="noreferrer">{GAME}</a></p>
        </div>
        {rows.length === 0 ? (
          <p className={k.empty}>No character is registered on this contract yet.</p>
        ) : (
          <ol className={s.ladder}>
            {rows.map((r, i) => (
              <li key={r.account} className={`${s.row} ${k.rise}`} data-first={i === 0 || undefined} style={order(i)}>
                <span className={s.rank} aria-label={`Place ${i + 1}`}>{i + 1}</span>
                <span className={s.disc}><Emblem name={r.name} size={44} /></span>
                <span className={s.who}>
                  <Link href={`/c/${r.name.toLowerCase()}`} className={s.name}>{r.name}</Link>
                  {r.outside && <span className={s.out}>walked in</span>}
                </span>
                <span className={s.coins}><Coins n={coinsFor(r.bal)} size={32} /></span>
                <span className={s.bank}><span className={`${k.num} ${s.bankNum}`}>{near4(r.bal)}</span> <span className={k.unit}>NEAR</span></span>
                <span className={s.kept}>
                  <KeepRing keeps={r.keeps} games={r.games} size={52} />
                  <span className={s.keptText}>{r.games === 0 ? 'no games yet' : `kept ${r.keeps} of ${r.games}`}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="latest">
        <div className={k.sectionHead}>
          <h2 id="latest" className={k.h2}>Latest games</h2>
          <p className={k.fine}>A closed ring is a kept promise. A snapped ring is a broken one.</p>
        </div>
        {recent.length === 0 ? (
          <p className={k.empty}>No league game has settled yet. The league worker plays a round on a schedule, and its games are listed here when they settle.</p>
        ) : (
          <ol className={s.games}>
            {recent.map((g, i) => {
              const a = whoIs(g.player);
              const b = whoIs(g.character);
              const kind = g.outcome?.kind ?? '';
              const word = kind === 'both_keep' ? 'both kept' : kind === 'both_break' ? 'both broke' : kind === 'player_breaks' ? `${a.label} broke` : kind === 'character_breaks' ? `${b.label} broke` : kind === 'refused' ? 'door closed' : kind;
              return (
                <li key={g.id} className={`${s.game} ${k.rise}`} data-kind={kind} style={order(rows.length + i)}>
                  <span className={s.gameTop}><span className={k.hand}>game {g.id}</span><span className={s.word}>{word}</span></span>
                  <span className={s.side}><Emblem name={a.label} size={30} /><span className={s.sideName}>{a.label}</span><MoveGlyph move={g.player_move} size={28} /></span>
                  <span className={s.vs}>vs</span>
                  <span className={`${s.side} ${s.sideB}`}><MoveGlyph move={g.character_move} size={28} /><span className={s.sideName}>{b.label}</span><Emblem name={b.label} size={30} /></span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
