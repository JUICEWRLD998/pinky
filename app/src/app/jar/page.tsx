'use client';
// The Swear Jar: the live balance, the three rules that move money through it, and the Phase 1 simulation
// played fast. The simulation is the same code the tests run (sim/world.ts); nothing here touches the chain
// except one view call for the live balance.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { GAME, jarOf, near } from '../../lib/client';
import { ARCHETYPES, UNIT, runSim, type Archetype, type Sample, type Summary } from '../../../../sim/world.ts';
import { JAR_MAX, JarArt, MoveGlyph } from '../../components/Glyphs';
import k from '../../components/kit.module.css';
import s from './jar.module.css';

const ROUNDS = 10_000;
const PLAY_MS = 7000;
/** One coin drawn per 0.005 NEAR live, and per 1 simulated NEAR in the simulation. */
const LIVE_COIN = 5n * 10n ** 21n;
const HABIT: Record<Archetype, string> = {
  alwaysKeep: 'Always keeps',
  alwaysBreak: 'Always breaks',
  mirror: 'Copies the last move',
  jarTimer: 'Keeps when the Jar is full',
  random: 'Flips a coin',
};
const sim = (x: bigint): string => (Number(x) / Number(UNIT)).toFixed(2);

const ratePct = (p: Sample) => p.jarRateBps / 100;
const keptPct = (p: Sample) => p.kkShare * 100;

export default function JarPage() {
  const [live, setLive] = useState<bigint | null>(null);
  const [seed, setSeed] = useState(7);
  const [run, setRun] = useState<{ samples: Sample[]; summary: Summary; seed: number } | null>(null);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const raf = useRef(0);
  // Chart geometry in SVG units. A phone gets its own narrower drawing, so type stays readable instead of shrinking.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(max-width: 719px)');
    const on = () => setNarrow(q.matches);
    on(); q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  const W = narrow ? 340 : 720;
  const H = narrow ? 250 : 300;
  const M = narrow ? { l: 36, r: 12, t: 12, b: 30 } : { l: 44, r: 118, t: 14, b: 34 };
  const IW = W - M.l - M.r;
  const IH = H - M.t - M.b;
  const xOf = (round: number) => M.l + (round / ROUNDS) * IW;

  useEffect(() => { jarOf().then(setLive).catch(() => {}); }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const total = run?.samples.length ?? 0;
  const playing = run !== null && at < total;
  const done = run !== null && at >= total;
  const drawn = useMemo(() => (run ? run.samples.slice(0, at) : []), [run, at]);
  const head = drawn.length ? drawn[drawn.length - 1] : null;
  // One shared percent axis, fixed for the whole run so nothing rescales while it plays.
  const yMax = useMemo(() => (run ? Math.max(60, Math.ceil(Math.max(...run.samples.map((p) => Math.max(ratePct(p), keptPct(p)))) / 20) * 20) : 60), [run]);
  const yOf = (pct: number) => M.t + IH - (pct / yMax) * IH;
  const pathOf = (pts: Sample[], f: (p: Sample) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.round).toFixed(1)} ${yOf(f(p)).toFixed(1)}`).join(' ');

  function start() {
    cancelAnimationFrame(raf.current);
    setBusy(true); setHover(null);
    // let the button show its working state before the simulation blocks the thread for a moment
    setTimeout(() => {
      const r = runSim({ seed, rounds: ROUNDS });
      setRun({ ...r, seed }); setBusy(false);
      const n = r.samples.length;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAt(n); return; }
      setAt(0);
      const t0 = performance.now();
      const tick = (now: number) => {
        const i = Math.min(n, Math.floor(((now - t0) / PLAY_MS) * n));
        setAt(i);
        if (i < n) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }, 40);
  }
  const skip = () => { cancelAnimationFrame(raf.current); setAt(total); };
  const reset = () => { cancelAnimationFrame(raf.current); setRun(null); setAt(0); setHover(null); };

  function onMove(e: PointerEvent<SVGRectElement>) {
    if (!run || drawn.length === 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const round = ((e.clientX - box.left) / box.width) * ROUNDS;
    const step = run.samples[0].round;
    setHover(Math.max(0, Math.min(drawn.length - 1, Math.round(round / step) - 1)));
  }

  const inSim = run !== null;
  const coins = inSim ? (head ? Math.min(JAR_MAX, Number(head.jar / UNIT)) : 0) : live === null ? 0 : Number(live / LIVE_COIN);
  const tip = hover !== null && drawn[hover] ? drawn[hover] : null;
  const sum = run?.summary;
  const games = sum ? sum.outcomes.KK + sum.outcomes.KB + sum.outcomes.BK + sum.outcomes.BB : 0;
  const share = (n: number) => (games ? (100 * n) / games : 0);
  const habits = sum ? [...ARCHETYPES].sort((a, b) => Number(sum.archetypeFinal[b] - sum.archetypeFinal[a])) : [];
  const richest = sum ? Math.max(Number(sum.archetypeStart), ...habits.map((a) => Number(sum.archetypeFinal[a]))) : 1;

  return (
    <main className={k.page}>
      <header>
        <h1 className={k.title}>The Swear Jar</h1>
        <p className={k.lede}>Broken promises fill it. Kept promises are paid out of it. That one loop is the whole economy of the game.</p>
      </header>

      <div className={s.layout}>
        <div className={s.jarCol}>
          <JarArt className={s.jar} coins={coins} tag={inSim ? 'simulated' : 'Swear Jar'} label={inSim ? 'The simulated Swear Jar, filling and emptying as the rounds run' : 'The Swear Jar with the coins it holds now'} />
          <p className={s.readout} aria-live="off">
            <span className={`${k.num} ${s.readNum}`}>{inSim ? (head ? sim(head.jar) : '0.00') : live === null ? '…' : near(live)}</span>
            <span className={s.readUnit}>{inSim ? 'simulated NEAR' : 'NEAR'}</span>
            <span className={k.fine}>{inSim ? `in the simulated Jar at round ${(head?.round ?? 0).toLocaleString('en-US')}` : `in the Jar right now, read live from ${GAME}`}</span>
          </p>
        </div>

        <div className={s.main}>
          <section className={`${k.slip} ${s.sheet} ${k.rise}`} aria-labelledby="rules">
            <h2 id="rules" className={s.sheetTitle}>How the money moves</h2>
            <ol className={s.rules}>
            <li className={s.rule}>
              <span className={s.pair}><MoveGlyph move="KEEP" size={34} /><MoveGlyph move="KEEP" size={34} /></span>
              <strong>Both keep</strong>
              <span>Each side gets its stake back, plus a bonus out of the Jar: up to half a stake, and never more than a fortieth of the Jar.</span>
            </li>
            <li className={s.rule}>
              <span className={s.pair}><MoveGlyph move="KEEP" size={34} /><MoveGlyph move="BREAK" size={34} /></span>
              <strong>One breaks</strong>
              <span>The one who broke takes both stakes, less a 2% rake. The Jar gets nothing.</span>
            </li>
            <li className={s.rule}>
              <span className={s.pair}><MoveGlyph move="BREAK" size={34} /><MoveGlyph move="BREAK" size={34} /></span>
              <strong>Both break</strong>
              <span>Nobody is paid. Both stakes drop into the Jar, less the rake.</span>
            </li>
            </ol>
          </section>

          <section className={`${k.panel} ${s.sim}`} aria-labelledby="sim">
            <p className={s.simTag}>simulation, not live play</p>
            <h2 id="sim" className={k.h2}>Ten thousand rounds, fast</h2>
            <p className={s.simLede}>Twenty players with five habits meet the six characters. No chain and no language model: the same public policies, the same payoff rules and a seeded draw, so a seed always replays the same way.</p>

            <div className={s.controls}>
              <div className={s.seed} role="group" aria-label="Seed">
                <button type="button" onClick={() => setSeed((v) => Math.max(1, v - 1))} disabled={busy || playing || seed <= 1} aria-label="Seed down">−</button>
                <span className={k.num}>seed {seed}</span>
                <button type="button" onClick={() => setSeed((v) => Math.min(99, v + 1))} disabled={busy || playing || seed >= 99} aria-label="Seed up">+</button>
              </div>
              {playing ? (
                <button type="button" className={k.btn} onClick={skip}>Skip to the end</button>
              ) : (
                <button type="button" className={k.btn} onClick={start} disabled={busy}>{busy ? 'Running…' : done ? `Run seed ${seed}` : 'Run 10,000 rounds'}</button>
              )}
              {done && <button type="button" className={`${k.btn} ${k.btnQuiet}`} onClick={reset}>Back to the live Jar</button>}
            </div>

            <figure className={s.figure}>
              <figcaption className={s.caption}>
                <span className={s.capTitle}>Jar bonus and promises kept by both sides</span>
                <span className={s.legend}>
                  <span className={s.key} data-series="jar">Jar bonus, as a share of the stake</span>
                  <span className={s.key} data-series="kept">Both kept, share of the last 300 games</span>
                </span>
              </figcaption>
              <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={done ? `Chart of the simulated Jar bonus and the share of games both sides kept over ${ROUNDS.toLocaleString('en-US')} rounds` : 'Chart, empty until the simulation runs'}>
                {[0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax].map((g) => (
                  <g key={g}>
                    <line x1={M.l} x2={W - M.r} y1={yOf(g)} y2={yOf(g)} className={g === 0 ? s.axis : s.grid} />
                    <text x={M.l - 8} y={yOf(g) + 4} textAnchor="end" className={s.tick}>{g}%</text>
                  </g>
                ))}
                {(narrow ? [0, 5000, 10000] : [0, 2500, 5000, 7500, 10000]).map((r) => (<text key={r} x={xOf(r)} y={H - 12} textAnchor={r === 0 ? 'start' : r === ROUNDS ? 'end' : 'middle'} className={s.tick}>{r === 0 ? 'round 0' : r.toLocaleString('en-US')}</text>))}
                {drawn.length > 1 && (
                  <>
                    <path d={pathOf(drawn, ratePct)} className={s.lineJar} />
                    <path d={pathOf(drawn, keptPct)} className={s.lineKept} />
                  </>
                )}
                {head && (
                  <>
                    {playing && <line x1={xOf(head.round)} x2={xOf(head.round)} y1={M.t} y2={M.t + IH} className={s.playhead} />}
                    <circle cx={xOf(head.round)} cy={yOf(ratePct(head))} r={5} className={s.dotJar} />
                    <circle cx={xOf(head.round)} cy={yOf(keptPct(head))} r={5} className={s.dotKept} />
                    {done && !narrow && (() => {
                      // direct labels at the line ends, nudged apart when the two lines finish close together
                      const yj = yOf(ratePct(head)); const yk = yOf(keptPct(head));
                      const gap = Math.abs(yj - yk) < 30 ? (30 - Math.abs(yj - yk)) / 2 : 0;
                      const up = yj <= yk ? -gap : gap;
                      return (
                        <>
                          <text x={W - M.r + 12} y={yj + up - 2} className={s.endLabel}>Jar bonus</text>
                          <text x={W - M.r + 12} y={yj + up + 13} className={s.endValue}>{ratePct(head).toFixed(0)}%</text>
                          <text x={W - M.r + 12} y={yk - up - 2} className={s.endLabel}>Both kept</text>
                          <text x={W - M.r + 12} y={yk - up + 13} className={s.endValue}>{keptPct(head).toFixed(0)}%</text>
                        </>
                      );
                    })()}
                  </>
                )}
                {tip && (
                  <g pointerEvents="none">
                    <line x1={xOf(tip.round)} x2={xOf(tip.round)} y1={M.t} y2={M.t + IH} className={s.cross} />
                    <circle cx={xOf(tip.round)} cy={yOf(ratePct(tip))} r={5} className={s.dotJar} />
                    <circle cx={xOf(tip.round)} cy={yOf(keptPct(tip))} r={5} className={s.dotKept} />
                    <g transform={`translate(${xOf(tip.round) > M.l + IW - 190 ? xOf(tip.round) - 190 : xOf(tip.round) + 10} ${M.t + 4})`}>
                      <rect width={180} height={70} rx={8} className={s.tipBox} />
                      <text x={12} y={21} className={s.tipHead}>Round {tip.round.toLocaleString('en-US')}</text>
                      <line x1={12} x2={26} y1={36} y2={36} className={s.lineJar} /><text x={32} y={40} className={s.tipRow}>Jar bonus {ratePct(tip).toFixed(1)}%</text>
                      <line x1={12} x2={26} y1={54} y2={54} className={s.lineKept} /><text x={32} y={58} className={s.tipRow}>Both kept {keptPct(tip).toFixed(1)}%</text>
                    </g>
                  </g>
                )}
                {!run && <text x={M.l + IW / 2} y={M.t + IH / 2 + 5} textAnchor="middle" className={s.idle}>Nothing has run yet. Press Run.</text>}
                <rect x={M.l} y={M.t} width={IW} height={IH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
              </svg>
            </figure>

            {done && sum && (
              <div className={s.results}>
                <section aria-labelledby="who">
                  <h3 id="who" className={s.h3}>Who ended richer</h3>
                  <p className={s.finding}>{HABIT[habits[0]]} ended richest. {HABIT[habits[habits.length - 1]]} ended poorest.</p>
                  <p className={k.fine}>Mean bankroll for each habit. Everyone started with {sim(sum.archetypeStart)}.</p>
                  <ul className={s.bars}>
                    {habits.map((a, i) => {
                      const v = Number(sum.archetypeFinal[a]);
                      return (
                        <li key={a} className={`${s.bar} ${k.rise}`} style={{ animationDelay: `${i * 60}ms` }}>
                          <span className={s.barLabel}>{HABIT[a]}</span>
                          <span className={s.track}>
                            <span className={s.fill} data-up={v >= Number(sum.archetypeStart) || undefined} style={{ width: `${(100 * v) / richest}%` }} />
                            <span className={s.startMark} style={{ left: `${(100 * Number(sum.archetypeStart)) / richest}%` }} aria-hidden="true" />
                          </span>
                          <span className={`${k.num} ${s.barValue}`}>{sim(sum.archetypeFinal[a])}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className={k.fine}>The dashed mark is where each started.</p>
                </section>
                <section aria-labelledby="how">
                  <h3 id="how" className={s.h3}>How {games.toLocaleString('en-US')} games ended</h3>
                  <ul className={s.ends}>
                    {([['Both kept', 'KEEP', 'KEEP', sum.outcomes.KK], ['Player broke', 'BREAK', 'KEEP', sum.outcomes.BK], ['Character broke', 'KEEP', 'BREAK', sum.outcomes.KB], ['Both broke', 'BREAK', 'BREAK', sum.outcomes.BB]] as const).map(([label, a, b, n], i) => (
                      <li key={label} className={`${s.end} ${k.rise}`} style={{ animationDelay: `${i * 60}ms` }}>
                        <span className={s.pairSmall}><MoveGlyph move={a} size={22} /><MoveGlyph move={b} size={22} /></span>
                        <span className={s.barLabel}>{label}</span>
                        <span className={s.track}><span className={s.fill} style={{ width: `${share(n)}%` }} /></span>
                        <span className={`${k.num} ${s.barValue}`}>{share(n).toFixed(1)}%</span>
                      </li>
                    ))}
                  </ul>
                  <p className={k.fine}>
                    The Jar ranged from {sim(sum.jarMin)} to {sim(sum.jarMax)} and ended at {sim(sum.jarFinal)}. Money conserved in every round: {sum.conservationOk ? 'yes' : 'NO, the invariant failed'}. Seed {run.seed}.
                  </p>
                </section>
                <details className={s.table}>
                  <summary>Show the numbers behind the chart</summary>
                  <div className={s.tableScroll}>
                    <table>
                      <thead><tr><th scope="col">Round</th><th scope="col">Jar</th><th scope="col">Jar bonus</th><th scope="col">Both kept</th></tr></thead>
                      <tbody>
                        {run.samples.filter((_, i) => (i + 1) % 10 === 0).map((p) => (
                          <tr key={p.round}><td>{p.round.toLocaleString('en-US')}</td><td>{sim(p.jar)}</td><td>{ratePct(p).toFixed(1)}%</td><td>{keptPct(p).toFixed(1)}%</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
