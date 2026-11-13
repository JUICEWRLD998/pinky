import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EXPLORER, GAME, ROOT, view } from '../../../../server/chain.ts';
import { near4, settledGames, whoIs, type CharacterView, type PoolView } from '../../../../server/board.ts';
import { specOf } from '../../../../server/characters.ts';
import { CHARACTERS, decide, type PolicyInputs } from '../../../../../core/policy.ts';
import { Emblem } from '../../../components/Emblem';
import { KeepRing, MoveGlyph } from '../../../components/Glyphs';
import k from '../../../components/kit.module.css';
import s from './character.module.css';

export const revalidate = 30;
export const metadata = { title: 'Pinky: a character, its wallet and its rules' };

const RULE: Record<string, string> = {
  grudger: 'Trusts a stranger, less so when strangers have been breaking. Break one promise and the door closes until you pay the apology fee.',
  mirror: 'Does to you what you did last time. One time in ten, forgives.',
  opportunist: 'Keeps by default. Leans to break when the stake is big against the bankroll, or when the Jar is thin.',
  saint: 'Keeps, almost always.',
  coin: 'Flips a coin. Nothing you say changes the coin.',
  statistician: 'Keeps when the Jar bonus plus the future of the relationship is worth more than the gain from breaking.',
};
const PARAM: Record<string, string> = {
  firstMaxBps: 'Keeps with a stranger, at best',
  firstMinBps: 'Keeps with a stranger, at worst',
  afterApologyBps: 'Keeps after an apology',
  afterKeepBps: 'Keeps after you kept',
  afterBreakBps: 'Keeps after you broke',
  baseBps: 'Keeps by default',
  bigStakeBps: 'A stake is big above this share of the bankroll',
  bigStakePenaltyBps: 'Taken off for a big stake',
  lowJarBps: 'The Jar is thin below this bonus rate',
  lowJarPenaltyBps: 'Taken off for a thin Jar',
  keepBps: 'Keeps',
  perGameValueBps: 'Worth of each future game',
  maxGames: 'Future games counted',
  breakGainBps: 'Gain from breaking',
};
const words = (key: string) => PARAM[key] ?? key.replace(/Bps$/, '').replace(/([A-Z])/g, ' $1').toLowerCase();
const amount = (key: string, v: number) => (key.endsWith('Bps') ? `${v / 100}%` : String(v));
const order = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

interface Snapshot { inputs?: PolicyInputs; pKeepBps?: number; open?: boolean }
const snapshotOf = (raw: string | null): Snapshot => { try { return raw ? (JSON.parse(raw) as Snapshot) : {}; } catch { return {}; } };

export default async function CharacterPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const slug = name.toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(slug)) notFound();
  const account = `${slug}.${ROOT}`;
  const ch = await view<CharacterView | null>('get_character', { account_id: account });
  if (!ch) notFound();

  const [spec, bal, pool, games] = await Promise.all([
    specOf(account),
    view<string>('get_balance', { account_id: account }),
    view<PoolView>('get_pool', { character: account }),
    settledGames(10, (g) => g.character === account),
  ]);
  const builtIn = CHARACTERS.some((c) => c.name === spec.name);
  const shown = builtIn ? spec.name : slug.charAt(0).toUpperCase() + slug.slice(1);
  const backed = BigInt(pool.total_shares) > 0n;

  return (
    <main className={k.page}>
      <header className={s.hero}>
        <div className={s.disc}><Emblem name={builtIn ? spec.name : slug} size={150} title={`${shown}'s emblem`} /></div>
        <div className={s.intro}>
          <p className={s.kind}>{builtIn ? `the ${spec.kind}` : 'walked in from outside'}</p>
          <h1 className={k.title}>{shown}</h1>
          <p className={k.lede}>{spec.persona}</p>
          {builtIn ? (
            <Link href={`/?who=${spec.name}`} className={`${k.btn} ${s.play}`}>Play {shown}</Link>
          ) : (
            <p className={k.fine}>{shown} is an agent someone else entered. It plays in the <Link href="/league">league</Link> with its own money and its own published policy.</p>
          )}
        </div>
        <aside className={`${k.slip} ${s.wallet}`} aria-label={`${shown}'s wallet`}>
          <span className={k.hand}>{shown}&rsquo;s wallet</span>
          <span className={`${k.num} ${k.slipBig}`}>{near4(bal)} <span className={k.unit}>NEAR</span></span>
          <span className={k.fine}><a href={`${EXPLORER}/address/${account}`} target="_blank" rel="noreferrer">{account}</a></span>
          <span className={k.fine}>Held on the game contract, <a href={`${EXPLORER}/address/${GAME}`} target="_blank" rel="noreferrer">{GAME}</a>. Nobody else can spend it.</span>
        </aside>
      </header>

      <div className={s.cols}>
        <section className={`${k.slip} ${s.policy}`} aria-labelledby="policy">
          <h2 id="policy" className={s.cardTitle}>How {shown} decides</h2>
          <p className={s.rule}>{RULE[spec.kind] ?? 'An outside agent with its own published policy.'}</p>
          <dl className={s.params}>
            {Object.entries(spec.params).map(([key, v]) => (
              <div key={key} className={s.param}><dt>{words(key)}</dt><dd className={k.num}>{amount(key, v)}</dd></div>
            ))}
            <div className={s.param}><dt>Door: will not play a record under</dt><dd className={k.num}>{spec.doorMinKeepBps === 0 ? 'open to all' : `${spec.doorMinKeepBps / 100}% kept`}</dd></div>
          </dl>
          <p className={k.fine}>The policy is public and uses whole numbers only, so anyone can recompute each decision. The language model writes what {shown} says. It never picks the move.</p>
        </section>

        <div className={s.side}>
          <section className={`${k.panel} ${s.record}`} aria-labelledby="record">
            <KeepRing keeps={ch.keeps} games={ch.games} size={104} />
            <div>
              <h2 id="record" className={s.cardTitle}>{ch.games === 0 ? 'No promises yet' : `Kept ${ch.keeps} of ${ch.games}`}</h2>
              <p className={k.fine}>Promises as the character, counted by the contract. Epoch {ch.epoch}: its secret is {ch.epoch_open ? 'committed and still sealed' : 'revealed, so every move in it can be checked'}.</p>
            </div>
          </section>
          <section className={k.panel} aria-labelledby="backers">
            <h2 id="backers" className={s.cardTitle}>Backers</h2>
            {backed ? (
              <p className={s.pool}><span className={`${k.num} ${s.poolNum}`}>{near4(pool.balance)}</span> <span className={k.unit}>NEAR</span> in the backing pool</p>
            ) : (
              <p className={s.pool}>Nobody backs {shown} yet.</p>
            )}
            <p className={k.fine}>Anyone can back a character on the contract and take the money out again. Backers share its wins and its losses.</p>
          </section>
        </div>
      </div>

      <section aria-labelledby="past">
        <div className={k.sectionHead}>
          <h2 id="past" className={k.h2}>Past promises</h2>
          <p className={k.fine}>The chance of keeping was fixed and sealed on the chain before the other side moved.</p>
        </div>
        {games.length === 0 ? (
          <p className={k.empty}>{shown} has no settled game in the latest 160. {builtIn ? 'Play one and it is listed here.' : 'League games are listed here when they settle.'}</p>
        ) : (
          <ol className={s.past}>
            {games.map((g, i) => {
              const them = whoIs(g.player);
              const snap = snapshotOf(g.snapshot);
              const kind = g.outcome?.kind ?? '';
              let why = '';
              try { if (snap.inputs) why = decide(spec, snap.inputs).reason; } catch { why = ''; }
              const word = kind === 'both_keep' ? 'both kept' : kind === 'both_break' ? 'both broke' : kind === 'player_breaks' ? `${them.label} broke` : kind === 'character_breaks' ? `${shown} broke` : kind === 'refused' ? 'door closed' : kind;
              const pct = typeof snap.pKeepBps === 'number' ? snap.pKeepBps / 100 : null;
              return (
                <li key={g.id} className={`${s.promise} ${k.rise}`} data-kind={kind} style={order(i)}>
                  <span className={`${k.hand} ${s.gameId}`}>game {g.id}</span>
                  <span className={s.match}>
                    <span className={s.matchName}>{them.href ? <Link href={them.href}>{them.label}</Link> : them.label}</span>
                    <MoveGlyph move={g.player_move} size={26} />
                    <span className={s.vs}>vs</span>
                    <MoveGlyph move={g.character_move} size={26} />
                    <span className={s.matchName}>{shown}</span>
                  </span>
                  <span className={s.why}>
                    {kind === 'refused' ? (
                      <span className={s.chance}>The door stayed closed</span>
                    ) : pct !== null ? (
                      <>
                        <span className={s.chance}>Chance of keeping: <span className={k.num}>{pct}%</span></span>
                        <span className={s.meter} aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                      </>
                    ) : null}
                    {why && <span className={s.reason}>{why}</span>}
                  </span>
                  <span className={s.word}>{word}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
