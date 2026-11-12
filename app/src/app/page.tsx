'use client';
import { useEffect, useState } from 'react';
import s from './page.module.css';
import { EXPLORER, OTIS, forgetGame, loadGame, rememberGame, askReveal, askSeal, balanceOf, createGuest, loadGuest, near, openGame, playMove, viewGame, viewGameWhen, type Game, type Guest, type Move } from '../lib/client';

type Phase = 'idle' | 'working' | 'sealed' | 'done';
interface Txs { open?: string; seal?: string; play?: string; reveal?: string }

const OUTCOME: Record<string, string> = {
  both_keep: 'You both kept your word.',
  player_breaks: 'You broke it. He kept it.',
  character_breaks: 'You kept it. He broke it.',
  both_break: 'You both broke it. The stakes went into the Swear Jar.',
};

const tx = (h?: string) => h ? <a className={s.mono} href={`${EXPLORER}/txns/${h}`} target="_blank" rel="noreferrer">{h.slice(0, 10)}…</a> : null;

export default function Home() {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [bal, setBal] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [gameId, setGameId] = useState<number | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [txs, setTxs] = useState<Txs>({});
  const [msg, setMsg] = useState<string>('');
  const [err, setErr] = useState<string>('');
  const [said, setSaid] = useState<string>('Sit down. Ten cents on the table, and we both say what we will do.');

  useEffect(() => {
    const g = loadGuest(); setGuest(g);
    const open = loadGame();
    if (g && open) carry(open, g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (guest) balanceOf(guest.accountId).then(setBal).catch(() => {}); }, [guest, phase]);

  async function run<T>(label: string, f: () => Promise<T>): Promise<T | undefined> {
    setErr(''); setMsg(label);
    try { return await f(); } catch (e) { setErr((e as Error).message); setPhase('idle'); return undefined; } finally { setMsg(''); }
  }

  /** Carry a game forward from wherever it stopped: used on first sit, after an error and after a reload. */
  async function carry(id: number, g: Guest) {
    setGameId(id); setPhase('working');
    const cur = await run('Checking the table…', () => viewGame(id));
    if (!cur) return;
    if (cur.status === 'Opened') {
      const sealed = await run('Otis is choosing…', () => askSeal(id));
      if (!sealed) return;
      setTxs((t) => ({ ...t, seal: sealed.tx }));
      if (sealed.refused) { setSaid(sealed.reason); setPhase('done'); return; }
      await run('Waiting for the seal…', () => viewGameWhen(id, 'Sealed'));
      return carry(id, g);
    }
    if (cur.status === 'Sealed') {
      setSaid('I have made up my mind. It is sealed on the chain. Your move.');
      setGame(cur); setPhase('sealed'); return;
    }
    if (cur.status === 'Played') {
      const r = await run('Otis is revealing…', () => askReveal(id));
      if (!r) return;
      setTxs((t) => ({ ...t, reveal: r.tx }));
      return carry(id, g);
    }
    setGame(cur); setPhase('done'); setSaid(cur.character_move === 'KEEP' ? 'A promise is a promise.' : 'Nothing personal. That is how it goes.');
    forgetGame();
  }

  async function sit() {
    setGame(null); setTxs({}); setPhase('working');
    let g = guest;
    if (!g) {
      const made = await run('Getting you a seat and some test chips…', createGuest);
      if (!made) return;
      g = made.guest; setGuest(g);
    }
    const open = loadGame();
    if (open) return carry(open, g);
    const opened = await run('Putting your stake on the table…', () => openGame(g!));
    if (!opened) return;
    rememberGame(opened.gameId);
    setTxs({ open: opened.tx });
    return carry(opened.gameId, g);
  }

  async function choose(move: Move) {
    if (!guest || gameId === null) return;
    setPhase('working');
    const p = await run('Sending your move…', () => playMove(guest, gameId, move));
    if (!p) return;
    setTxs((t) => ({ ...t, play: p }));
    const r = await run('Otis is revealing…', () => askReveal(gameId));
    if (!r) return;
    setTxs((t) => ({ ...t, reveal: r.tx }));
    const final = await run('Reading the result…', () => viewGameWhen(gameId, 'Settled'));
    if (!final) return;
    setGame(final); setSaid(r.move === 'KEEP' ? 'A promise is a promise.' : 'Nothing personal. That is how it goes.');
    forgetGame(); setPhase('done');
  }

  return (
    <main className={s.main}>
      <h1 className={s.title}>Pinky</h1>
      <p className={s.sub}>Keep it or break it. Testnet, test chips.</p>

      <section className={s.card}>
        <p className={s.line}><strong>Otis</strong>, retired bus driver. He does to you what you did to him last time.</p>
        <p className={`${s.line} ${s.say}`}>“{said}”</p>
        <p className={s.mono}>{OTIS}</p>
        {guest && <p className={s.mono}>You: {guest.accountId}{bal !== null ? ` · ${near(bal)} NEAR in chips` : ''}</p>}
      </section>

      {(phase === 'idle' || phase === 'done') && (
        <button className={`${s.btn} ${s.primary}`} onClick={sit}>{phase === 'done' ? 'Play again' : 'Sit down with Otis'}</button>
      )}

      {phase === 'sealed' && (
        <section className={s.card} aria-label="Your move">
          <p className={s.line}>Otis has sealed his move. Yours:</p>
          <div className={s.row}>
            <button className={`${s.btn} ${s.keep}`} onClick={() => choose('KEEP')}>KEEP</button>
            <button className={`${s.btn} ${s.break}`} onClick={() => choose('BREAK')}>BREAK</button>
          </div>
          {game?.commit && <p className={s.mono}>His sealed commit: {game.commit}</p>}
        </section>
      )}

      {msg && <p role="status" className={s.sub}>{msg}</p>}
      {err && <p role="alert" className={s.err}>{err}</p>}

      {phase === 'done' && game?.outcome && (
        <section className={s.card} aria-label="Result">
          <p className={s.verdict}>{OUTCOME[game.outcome.kind] ?? game.outcome.kind}</p>
          <p className={s.line}>You played {game.player_move}, Otis played {game.character_move}. You received {near(game.outcome.player_payout)} NEAR.</p>
        </section>
      )}

      {(txs.open || txs.seal) && (
        <section className={s.card}>
          <p className={s.line}>On the chain</p>
          <ol className={s.steps}>
            <li>open_game {tx(txs.open)}</li>
            {txs.seal && <li>Otis seals {tx(txs.seal)}</li>}
            {txs.play && <li>you play {tx(txs.play)}</li>}
            {txs.reveal && <li>Otis reveals {tx(txs.reveal)}</li>}
          </ol>
        </section>
      )}
    </main>
  );
}
