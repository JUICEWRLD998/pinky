'use client';
import { useEffect, useState } from 'react';
import s from './page.module.css';
import { CHARACTERS } from '../../../core/policy.ts';
import {
  EXPLORER, accountOf, askReveal, askSeal, askTalk, balanceOf, createGuest, forgetGame, loadGame, loadGuest, near, openGame, playMove,
  rememberGame, viewGame, viewGameWhen, type Game, type Guest, type Move, type Talk,
} from '../lib/client';

type Phase = 'pick' | 'working' | 'talk' | 'sealed' | 'done';
interface Txs { open?: string; seal?: string; play?: string; reveal?: string; pay?: string }

const OUTCOME: Record<string, string> = {
  both_keep: 'You both kept your word.',
  player_breaks: 'You broke it. They kept it.',
  character_breaks: 'You kept it. They broke it.',
  both_break: 'You both broke it. The stakes went into the Swear Jar.',
  refused: 'The door was closed. Nobody lost anything.',
};

const tx = (h?: string) => h ? <a className={s.mono} href={`${EXPLORER}/txns/${h}`} target="_blank" rel="noreferrer">{h.slice(0, 10)}…</a> : null;

export default function Home() {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [bal, setBal] = useState<bigint | null>(null);
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

  const spec = CHARACTERS.find((c) => c.name === who)!;

  useEffect(() => {
    const g = loadGuest(); setGuest(g);
    const open = loadGame();
    if (g && open) { setWho(open.character); carry(open.id, open.character, g); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (guest) balanceOf(guest.accountId).then(setBal).catch(() => {}); }, [guest, phase]);

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
    setGame(null); setTxs({}); setTalked(undefined); setDraft(''); setSaid(spec.persona); setPhase('working');
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

  const picking = phase === 'pick' || phase === 'done';

  return (
    <main className={s.main}>
      <h1 className={s.title}>Pinky</h1>
      <p className={s.sub}>Keep it or break it. Testnet, test chips.</p>

      {picking && (
        <div className={s.cast} role="radiogroup" aria-label="Choose who to play">
          {CHARACTERS.map((c) => (
            <button key={c.name} role="radio" aria-checked={c.name === who} className={`${s.pick} ${c.name === who ? s.picked : ''}`} onClick={() => { setWho(c.name); setSaid(''); }}>{c.name}</button>
          ))}
        </div>
      )}

      <section className={s.card}>
        <p className={s.line}><strong>{who}</strong>. {spec.persona}</p>
        {said && <p className={`${s.line} ${s.say}`}>“{said}”</p>}
        <p className={s.mono}>{accountOf(who)}</p>
        {guest && <p className={s.mono}>You: {guest.accountId}{bal !== null ? ` · ${near(bal)} NEAR in chips` : ''}</p>}
      </section>

      {picking && <button className={`${s.btn} ${s.primary}`} onClick={sit}>{phase === 'done' ? `Play ${who} again` : `Sit down with ${who}`}</button>}

      {phase === 'talk' && (
        <section className={s.card} aria-label="Talk before the seal">
          <p className={s.line}>Say something, or just shake on it. {who} pays for each reply out of their own balance.</p>
          <div className={s.row}>
            <input className={s.input} value={draft} maxLength={280} placeholder="I promise I will keep it." aria-label="Your message" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') say(); }} />
            <button className={s.btn} onClick={say} disabled={!draft.trim()}>Say it</button>
          </div>
          {talked?.paid && <p className={s.mono}>{who} paid {near(talked.paid.yocto)} NEAR for that reply · {tx(talked.paid.tx)}</p>}
          {talked?.quiet && <p className={s.mono}>{who} is low on funds and is not paying for thinking right now.</p>}
          <button className={`${s.btn} ${s.primary}`} onClick={shake}>Shake on it</button>
        </section>
      )}

      {phase === 'sealed' && (
        <section className={s.card} aria-label="Your move">
          <p className={s.line}>{who} has sealed their move. Yours:</p>
          <div className={s.row}>
            <button className={`${s.btn} ${s.keep}`} onClick={() => choose('KEEP')}>KEEP</button>
            <button className={`${s.btn} ${s.break}`} onClick={() => choose('BREAK')}>BREAK</button>
          </div>
          {game?.commit && <p className={s.mono}>Sealed commit: {game.commit}</p>}
        </section>
      )}

      {msg && <p role="status" className={s.sub}>{msg}</p>}
      {err && <p role="alert" className={s.err}>{err}</p>}

      {phase === 'done' && game?.outcome && (
        <section className={s.card} aria-label="Result">
          <p className={s.verdict}>{OUTCOME[game.outcome.kind] ?? game.outcome.kind}</p>
          {game.outcome.kind !== 'refused' && <p className={s.line}>You played {game.player_move}, {who} played {game.character_move}. You received {near(game.outcome.player_payout)} NEAR.</p>}
        </section>
      )}

      {(txs.open || txs.seal) && (
        <section className={s.card}>
          <p className={s.line}>On the chain</p>
          <ol className={s.steps}>
            <li>open_game {tx(txs.open)}</li>
            {txs.pay && <li>{who} pays for a reply {tx(txs.pay)}</li>}
            {txs.seal && <li>{who} seals {tx(txs.seal)}</li>}
            {txs.play && <li>you play {tx(txs.play)}</li>}
            {txs.reveal && <li>{who} reveals {tx(txs.reveal)}</li>}
          </ol>
        </section>
      )}
    </main>
  );
}
