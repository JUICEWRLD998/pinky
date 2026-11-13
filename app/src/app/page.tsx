'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import s from './page.module.css';
import { CHARACTERS } from '../../../core/policy.ts';
import {
  EXPLORER, accountOf, askReveal, askSeal, askTalk, balanceOf, createGuest, forgetGame, jarOf, loadGame, loadGuest, near, openGame, playMove,
  rememberGame, viewGame, viewGameWhen, type Game, type Guest, type Move, type Talk,
} from '../lib/client';
import { Emblem } from '../components/Emblem';
import { Stage, VERDICT_AT_MS, type Outcome } from '../components/Stage';
import { dur, ease, spring } from '../lib/motion';

type Phase = 'pick' | 'working' | 'talk' | 'sealed' | 'done';
interface Txs { open?: string; seal?: string; play?: string; reveal?: string; pay?: string }

const OUTCOME: Record<string, string> = {
  both_keep: 'You both kept your word.',
  player_breaks: 'You broke it. They kept it.',
  character_breaks: 'You kept it. They broke it.',
  both_break: 'You both broke it. The stakes went into the Swear Jar.',
  refused: 'The door was closed. Nobody lost anything.',
};
const OUTCOMES = Object.keys(OUTCOME) as Outcome[];
const STAGE_LABEL: Record<Phase, string> = {
  pick: 'Two fists with their pinkies out, apart, over a jar of coins.',
  working: 'Your fist moves toward the middle of the table.',
  talk: 'Your stake is on the table. The two fists are close.',
  sealed: 'Their move is sealed. Both stakes are on the table.',
  done: 'The promise is resolved.',
};
/** One coin drawn in the Jar per 0.005 NEAR. */
const JAR_COIN = 5n * 10n ** 21n;

/** Count a NEAR amount up to its value once `on` is true. */
function useCountUp(yocto: bigint, on: boolean): string {
  const [shown, setShown] = useState<bigint>(0n);
  useEffect(() => {
    if (!on) { setShown(0n); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(yocto); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      const eased = 1 - (1 - p) ** 3;
      setShown((yocto * BigInt(Math.round(eased * 1000))) / 1000n);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [yocto, on]);
  return near(shown);
}

const TAPE: { key: keyof Txs; label: (who: string) => string }[] = [
  { key: 'open', label: () => 'You stake' },
  { key: 'pay', label: (w) => `${w} pays to reply` },
  { key: 'seal', label: (w) => `${w} seals` },
  { key: 'play', label: () => 'You play' },
  { key: 'reveal', label: (w) => `${w} reveals` },
];

export default function Home() {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [bal, setBal] = useState<bigint | null>(null);
  const [jar, setJar] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [who, setWho] = useState<string>('Otis');
  const [gameId, setGameId] = useState<number | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [txs, setTxs] = useState<Txs>({});
  const [msg, setMsg] = useState<string>('');
  const [err, setErr] = useState<string>('');
  const [said, setSaid] = useState<string>('');
  const [draft, setDraft] = useState<string>('');
  const [talked, setTalked] = useState<Talk | undefined>(undefined);
  const [verdictOn, setVerdictOn] = useState(false);
  const [demo, setDemo] = useState(false);
  const errRef = useRef<HTMLParagraphElement>(null);

  const spec = CHARACTERS.find((c) => c.name === who)!;
  const outcome = phase === 'done' && game?.outcome && OUTCOMES.includes(game.outcome.kind as Outcome) ? (game.outcome.kind as Outcome) : null;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = q.get('demo') as Outcome | null;
    const w = q.get('who');
    if (w && CHARACTERS.some((c) => c.name === w)) setWho(w);
    if (d && OUTCOMES.includes(d)) { setDemo(true); playDemo(d); return; }
    const g = loadGuest(); setGuest(g);
    const open = loadGame();
    if (g && open) { setWho(open.character); carry(open.id, open.character, g); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (guest) balanceOf(guest.accountId).then(setBal).catch(() => {}); }, [guest, phase]);
  useEffect(() => { jarOf().then(setJar).catch(() => {}); }, [phase]);
  // The verdict slip lands after the fists have met: the eye goes fists, coins, then words.
  useEffect(() => {
    if (phase !== 'done') { setVerdictOn(false); return; }
    const t = setTimeout(() => setVerdictOn(true), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : VERDICT_AT_MS);
    return () => clearTimeout(t);
  }, [phase, game]);

  /** Film the reveal without touching the chain: /?demo=both_keep. Labelled on screen. */
  function playDemo(kind: Outcome) {
    const pm: Move = kind === 'player_breaks' || kind === 'both_break' ? 'BREAK' : 'KEEP';
    const cm: Move = kind === 'character_breaks' || kind === 'both_break' ? 'BREAK' : 'KEEP';
    const pay = { both_keep: '12400000000000000000000', player_breaks: '19600000000000000000000', character_breaks: '0', both_break: '0', refused: '10000000000000000000000' }[kind];
    setGameId(0); setPhase('sealed'); setSaid('I have made up my mind. It is sealed on the chain. Your move.');
    setTimeout(() => {
      setGame({ id: 0, status: 'Settled', commit: null, player_move: kind === 'refused' ? null : pm, character_move: kind === 'refused' ? null : cm, outcome: { kind, player_payout: pay, character_payout: '0', jar_delta: '0' } });
      setSaid(kind === 'refused' ? 'Not today.' : cm === 'KEEP' ? 'A promise is a promise.' : 'Nothing personal. That is how it goes.');
      setPhase('done');
    }, 1100);
  }

  async function run<T>(label: string, f: () => Promise<T>): Promise<T | undefined> {
    setErr(''); setMsg(label);
    try { return await f(); } catch (e) { setErr((e as Error).message); setPhase('pick'); return undefined; } finally { setMsg(''); }
  }

  /** Carry a game forward from wherever it stopped: used after sitting down, after an error and after a reload. */
  async function carry(id: number, name: string, g: Guest, t?: Talk) {
    setGameId(id); setPhase('working');
    const cur = await run('Checking the table…', () => viewGame(id));
    if (!cur) return;
    if (cur.status === 'Opened') { setPhase('talk'); return; }
    if (cur.status === 'Sealed') { setSaid('I have made up my mind. It is sealed on the chain. Your move.'); setGame(cur); setPhase('sealed'); return; }
    if (cur.status === 'Played') {
      const r = await run(`${name} is revealing…`, () => askReveal(id));
      if (!r) return;
      setTxs((x) => ({ ...x, reveal: r.tx }));
      return carry(id, name, g, t);
    }
    setGame(cur); setPhase('done');
    setSaid(cur.outcome?.kind === 'refused' ? 'Not today.' : cur.character_move === 'KEEP' ? 'A promise is a promise.' : 'Nothing personal. That is how it goes.');
    forgetGame();
  }

  async function sit() {
    if (demo) { playDemo((game?.outcome?.kind as Outcome) ?? 'both_keep'); return; }
    setGame(null); setTxs({}); setTalked(undefined); setDraft(''); setSaid(''); setGameId(null); setPhase('working');
    let g = guest;
    if (!g) {
      const made = await run('Getting you a seat and some test chips…', createGuest);
      if (!made) return;
      g = made.guest; setGuest(g);
    }
    const open = loadGame();
    if (open) { setWho(open.character); return carry(open.id, open.character, g); }
    const opened = await run('Putting your stake on the table…', () => openGame(g!, who));
    if (!opened) return;
    rememberGame(opened.gameId, who);
    setTxs({ open: opened.tx });
    return carry(opened.gameId, who, g);
  }

  async function say() {
    if (gameId === null || !draft.trim()) return;
    const t = await run(`${who} is thinking…`, () => askTalk(gameId, draft));
    if (!t) return;
    setPhase('talk');
    setTalked(t); setSaid(t.line); setDraft('');
    if (t.paid) setTxs((x) => ({ ...x, pay: t.paid!.tx }));
  }

  async function shake() {
    if (gameId === null || !guest) return;
    setPhase('working');
    const sealed = await run(`${who} is choosing…`, () => askSeal(gameId, talked));
    if (!sealed) return;
    setTxs((x) => ({ ...x, seal: sealed.tx }));
    await run('Waiting for the seal…', () => viewGameWhen(gameId, sealed.refused ? 'Settled' : 'Sealed'));
    return carry(gameId, who, guest, talked);
  }

  async function choose(move: Move) {
    if (!guest || gameId === null) return;
    setPhase('working');
    const p = await run('Sending your move…', () => playMove(guest, gameId, move));
    if (!p) return;
    setTxs((x) => ({ ...x, play: p }));
    const r = await run(`${who} is revealing…`, () => askReveal(gameId));
    if (!r) return;
    setTxs((x) => ({ ...x, reveal: r.tx }));
    const final = await run('Reading the result…', () => viewGameWhen(gameId, 'Settled'));
    if (!final) return;
    setGame(final); setSaid(r.move === 'KEEP' ? 'A promise is a promise.' : 'Nothing personal. That is how it goes.');
    forgetGame(); setPhase('done');
  }

  useEffect(() => { if (err) errRef.current?.focus(); }, [err]);

  const picking = phase === 'pick' || phase === 'done';
  const staked = gameId !== null && phase !== 'pick';
  const sealedYet = phase === 'sealed' || (phase === 'done' && outcome !== 'refused') || (phase === 'working' && !!txs.seal);
  const payout = useCountUp(BigInt(game?.outcome?.player_payout ?? '0'), verdictOn && phase === 'done');
  const jarCoins = jar === null ? 0 : Number(jar / JAR_COIN);
  const line = said || spec.persona;
  const swap = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: dur.base, ease: ease.out } };
  const tape = TAPE.filter((t) => txs[t.key]);

  return (
    <main className={s.table}>
      <header className={s.intro}>
        <h1 className={s.title}>Keep it or break it.</h1>
        <p className={s.sub}>Stake 0.01 test NEAR on a pinky promise. Their move is sealed on the chain before you choose yours.</p>
      </header>

      <div className={s.stageWrap}>
        <Stage phase={phase} outcome={outcome} staked={staked} sealed={sealedYet} jarCoins={jarCoins} who={who} label={outcome ? OUTCOME[outcome] : STAGE_LABEL[phase]} />
      </div>
      <div className={s.band} aria-hidden="true" />
      <div className={s.jarCell}>
        <p className={s.jarLine}>
          <span className={s.jarAmount}>{jar === null ? '…' : near(jar)}</span> NEAR in the Swear Jar. Broken promises fill it. Kept ones are paid from it.
        </p>
      </div>

      <section className={s.you} aria-label="Your side of the table">
        <AnimatePresence mode="wait" initial={false}>
          {phase === 'done' && game?.outcome && verdictOn ? (
            <motion.div key="verdict" className={s.verdict} data-kind={game.outcome.kind} initial={{ opacity: 0, y: 16, rotate: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, rotate: -1.2, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={spring.settle}>
              <p className={s.verdictLine}>{OUTCOME[game.outcome.kind] ?? game.outcome.kind}</p>
              {game.outcome.kind !== 'refused' && (
                <p className={s.verdictMoves}>You played {game.player_move === 'KEEP' ? 'keep' : 'break'}. {who} played {game.character_move === 'KEEP' ? 'keep' : 'break'}.</p>
              )}
              <p className={s.payout}><span className={s.payoutNum}>{payout}</span> NEAR back to you</p>
            </motion.div>
          ) : phase === 'talk' ? (
            <motion.div key="talk" className={s.panel} {...swap}>
              <p className={s.prompt}>Say something to {who}, or just shake on it. {who} pays for each reply from their own balance.</p>
              <div className={s.sayRow}>
                <input className={s.input} value={draft} maxLength={280} placeholder="I promise I will keep it." aria-label={`Your message to ${who}`} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') say(); }} />
                <button className={s.btnQuiet} onClick={say} disabled={!draft.trim()}>Say it</button>
              </div>
              {talked?.paid && <p className={s.fine}>{who} paid {near(talked.paid.yocto)} NEAR for that reply.</p>}
              {talked?.quiet && <p className={s.fine}>{who} is low on funds and is not paying for thinking right now.</p>}
              <button className={s.btnPrimary} onClick={shake}>Shake on it</button>
            </motion.div>
          ) : phase === 'sealed' ? (
            <motion.div key="sealed" className={s.panel} {...swap}>
              <p className={s.prompt}>{who} has sealed a move. Now yours.</p>
              <div className={s.moves}>
                <button className={s.btnKeep} onClick={() => choose('KEEP')} disabled={demo}>
                  <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" strokeWidth="5" /></svg>
                  Keep
                </button>
                <button className={s.btnBreak} onClick={() => choose('BREAK')} disabled={demo}>
                  <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path d="M11 5.5 A9 9 0 0 0 11 22.5 M17 5.5 A9 9 0 0 1 17 22.5" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" transform="rotate(18 14 14)" /></svg>
                  Break
                </button>
              </div>
              {game?.commit && <p className={s.fine}>Sealed commit {game.commit.slice(0, 16)}…</p>}
            </motion.div>
          ) : phase === 'working' ? (
            <motion.div key="working" className={s.panel} {...swap}>
              <p className={s.working} role="status"><span className={s.dots} aria-hidden="true"><i /><i /><i /></span>{msg || 'One moment…'}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {picking && (
          <button className={s.btnPrimary} onClick={sit}>{phase === 'done' ? `Play ${who} again` : `Sit down with ${who}`}</button>
        )}
        {err && <p ref={errRef} tabIndex={-1} role="alert" className={s.err}>{err}</p>}
        {demo && <p className={s.fine}>Demo replay. No transaction is sent on this page.</p>}

        <div className={s.chips}>
          <span className={s.chipsLabel}>your chips</span>
          <span className={s.chipsNum}>{guest && bal !== null ? near(bal) : '0.0000'}</span>
          <span className={s.chipsUnit}>NEAR</span>
          <span className={s.chipsWho}>{guest ? guest.accountId : 'You get a seat and test chips when you sit down.'}</span>
        </div>
      </section>

      <section className={s.them} aria-label={`${who}'s side of the table`}>
        <div className={s.card}>
          <div className={s.emblem}><Emblem name={who} size={88} /></div>
          <div>
            <h2 className={s.name}>{who}</h2>
            <p className={s.persona}>{spec.persona}</p>
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.blockquote key={line} className={s.speech} initial={{ opacity: 0, y: 8, rotate: 2.5 }} animate={{ opacity: 1, y: 0, rotate: 1.2 }} exit={{ opacity: 0, y: -6 }} transition={spring.settle}>
            {said ? `“${said}”` : `“${who === 'Dice' ? 'Heads I keep. Tails I do not.' : 'Sit down. Let us see what your word is worth.'}”`}
          </motion.blockquote>
        </AnimatePresence>
        <p className={s.fine}><Link href={`/c/${who.toLowerCase()}`}>{who}&rsquo;s wallet, policy and past promises</Link></p>

        <div className={s.cast} role="radiogroup" aria-label="Choose who to play">
          {CHARACTERS.map((c) => (
            <button key={c.name} role="radio" aria-checked={c.name === who} aria-label={c.name} disabled={!picking} className={s.pick} onClick={() => { setWho(c.name); setSaid(''); if (phase === 'done') { setPhase('pick'); setGame(null); setGameId(null); setTxs({}); } }}>
              <Emblem name={c.name} size={40} />
              <span className={s.pickName}>{c.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={s.tape} aria-label="This game on the chain">
        <h2 className={s.tapeTitle}>On the chain</h2>
        {tape.length === 0 ? (
          <p className={s.fine}>Every step of a game is a transaction. They are listed here as they happen.</p>
        ) : (
          <ol className={s.stubs}>
            <AnimatePresence initial={false}>
              {tape.map((t) => (
                <motion.li key={t.key} className={s.stub} layout initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring.settle}>
                  <span>{t.label(who)}</span>
                  <a href={`${EXPLORER}/txns/${txs[t.key]}`} target="_blank" rel="noreferrer">{txs[t.key]!.slice(0, 8)}…</a>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </section>
    </main>
  );
}
