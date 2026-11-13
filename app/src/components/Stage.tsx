'use client';
// The hero object: two fists with hooked pinkies over the Swear Jar. Flat print: thick ink outlines, solid
// fills, halftone. The signature moment ("The Pinky") is choreographed here and depends only on the outcome
// kind, so the same result always plays the same way. Beat sheet: docs/design/ART_DIRECTION.md.
import { motion } from 'motion/react';
import { ease, spring } from '../lib/motion';
import s from './Stage.module.css';

export type Outcome = 'both_keep' | 'player_breaks' | 'character_breaks' | 'both_break' | 'refused';
export type StagePhase = 'pick' | 'working' | 'talk' | 'sealed' | 'done';

/** When the verdict slip may land, and when everything is at rest (ms after the result arrives). */
export const VERDICT_AT_MS = 900;
export const SETTLE_MS = 1400;

const INK = 'var(--ink)';
const W = 1000;
const H = 570;
const CX = 500;
/** The art below is drawn around x = 360. OFF moves it to the stage centre. */
const OFF = CX - 360;
const shift = `translate(${OFF} 0)`;
const CY = 168;
const outline = { stroke: INK, strokeWidth: 5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

// The pinky is one thick stroke: along the table, then a hook around the lock centre. The hook radius (52) is
// wider than the stroke is thick, so two locked hooks leave a hole and cross at two separate points, like a link.
const PINKY = 'M 200 220 L 340 220 A 52 52 0 0 0 340 116 L 330 116';

const PinkyInk = () => <path d={PINKY} fill="none" stroke={INK} strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" />;
const PinkyFill = ({ colour }: { colour: string }) => <path d={PINKY} fill="none" stroke={colour} strokeWidth={36} strokeLinecap="round" strokeLinejoin="round" />;

function Pinky({ colour }: { colour: string }) {
  return (
    <>
      <PinkyInk />
      <PinkyFill colour={colour} />
      <path d="M 256 206 V 234 M 268 206 V 234" stroke={INK} strokeWidth={3} strokeLinecap="round" opacity={0.35} />
    </>
  );
}

/** A fist seen from the side, pinky out. Drawn for the left; the right is its mirror. */
function Fist({ colour, cuff, stripe }: { colour: string; cuff: string; stripe: string }) {
  return (
    <>
      <rect x={-1400} y={120} width={1488} height={118} rx={12} fill={cuff} {...outline} />
      <path d="M 62 124 V 234" stroke={stripe} strokeWidth={8} strokeLinecap="round" />
      <rect x={72} y={96} width={128} height={146} rx={38} fill={colour} {...outline} />
      <Pinky colour={colour} />
      {[100, 136, 172].map((y) => (<rect key={y} x={150} y={y} width={84} height={34} rx={17} fill={colour} {...outline} />))}
      <rect x={112} y={76} width={98} height={40} rx={20} fill={colour} {...outline} transform="rotate(-9 161 96)" />
    </>
  );
}

const mirror = `translate(${2 * CX - OFF} 0) scale(-1 1)`;

interface HandMove { x: number | number[]; y?: number | number[]; rotate?: number | number[] }
const REST: Record<Exclude<StagePhase, 'done'>, { l: number; r: number }> = {
  pick: { l: -112, r: 112 },
  working: { l: -84, r: 100 },
  talk: { l: -72, r: 84 },
  sealed: { l: -62, r: 58 },
};

// times: 0 start, 0.12 pulled back (about 160 ms), 0.36 contact (about 460 ms), then the consequence.
const T = [0, 0.12, 0.36, 0.62];
const MOMENT: Record<Outcome, { l: HandMove; r: HandMove; times: number[] }> = {
  both_keep: { l: { x: [-62, -82, 7, 0] }, r: { x: [58, 78, -7, 0] }, times: [0, 0.12, 0.36, 0.5] },
  player_breaks: {
    l: { x: [-62, -82, 4, -150], y: [0, 0, 0, -20], rotate: [0, -3, 0, -6] },
    r: { x: [58, 78, -4, 10], y: [0, 0, 0, 4], rotate: [0, 3, 0, 2] },
    times: T,
  },
  character_breaks: {
    l: { x: [-62, -82, 4, -10], y: [0, 0, 0, 4], rotate: [0, -3, 0, -2] },
    r: { x: [58, 78, -4, 150], y: [0, 0, 0, -20], rotate: [0, 3, 0, 6] },
    times: T,
  },
  both_break: {
    l: { x: [-62, -82, 4, -132], y: [0, 0, 0, -18], rotate: [0, -3, 0, -5] },
    r: { x: [58, 78, -4, 132], y: [0, 0, 0, -18], rotate: [0, 3, 0, 5] },
    times: T,
  },
  refused: {
    l: { x: [-62, -82, -30, -30] },
    r: { x: [58, 78, 120, 120], y: [0, 0, -16, -16], rotate: [0, 4, 7, 7] },
    times: [0, 0.12, 0.4, 1],
  },
};
const MOMENT_S = SETTLE_MS / 1000;

// Where coins rest. Stakes sit between the fists; piles sit beside each fist's cuff; the Jar is below the lock.
const STAKE_L: [number, number][] = [[296, 268], [318, 276], [307, 256]];
const PILE_L: [number, number][] = [[236, 528], [208, 532], [222, 512], [250, 508], [194, 514], [236, 492], [262, 534], [180, 534]];
const IN_JAR: [number, number][] = [[334, 470], [386, 474], [360, 456], [348, 490], [374, 492], [360, 476]];
const flip = ([x, y]: [number, number]): [number, number] => [720 - x, y];

function coinTarget(side: 'l' | 'r', i: number, staged: boolean, outcome: Outcome | null): [number, number] {
  const own = side === 'l' ? PILE_L[i] : flip(PILE_L[i]);
  if (!staged) return own;
  const stake = side === 'l' ? STAKE_L[i] : flip(STAKE_L[i]);
  if (!outcome) return stake;
  if (outcome === 'both_break') return IN_JAR[side === 'l' ? i : i + 3];
  if (outcome === 'player_breaks') return side === 'l' ? PILE_L[i] : PILE_L[i + 3];
  if (outcome === 'character_breaks') return side === 'r' ? flip(PILE_L[i]) : flip(PILE_L[i + 3]);
  return own; // both_keep and refused: every stake goes home
}

function Coin({ to, show, delay }: { to: [number, number]; show: boolean; delay: number }) {
  return (
    <motion.g
      initial={false}
      animate={{ x: to[0] + OFF, y: to[1], opacity: show ? 1 : 0 }}
      transition={{ x: { duration: 0.5, ease: ease.inOut, delay }, y: { ...spring.weighty, delay }, opacity: { duration: 0.16, delay: show ? delay : 0 } }}
    >
      <circle r={13} fill="var(--coin)" stroke={INK} strokeWidth={3.5} />
      <circle r={7.5} fill="none" stroke="var(--coin-deep)" strokeWidth={2.5} />
    </motion.g>
  );
}

/** Coins already in the Jar: rows from the bottom, positions fixed by index so the pile never reshuffles. */
function jarCoin(i: number): [number, number] {
  const row = Math.floor(i / 5);
  const col = i % 5;
  const nudge = ((i * 37) % 7) - 3;
  return [311 + col * 24 + (row % 2 ? 8 : 0) + nudge * 0.6, 522 - row * 17 - Math.abs(nudge)];
}

export interface StageProps {
  phase: StagePhase;
  outcome: Outcome | null;
  /** Your stake is on the table. */
  staked: boolean;
  /** Their move is sealed and their stake is on the table. */
  sealed: boolean;
  /** Coins to draw inside the Jar. */
  jarCoins: number;
  who: string;
  label: string;
}

export function Stage({ phase, outcome, staked, sealed, jarCoins, who, label }: StageProps) {
  const done = phase === 'done' && outcome !== null;
  const m = done ? MOMENT[outcome] : null;
  const rest = REST[phase === 'done' ? 'sealed' : phase];
  const handT = (times: number[]) => ({ duration: MOMENT_S * 0.72, times, ease: [ease.out, ease.in, ease.out] });
  const left = m ? { animate: { y: 0, rotate: 0, ...m.l }, transition: handT(m.times) } : { animate: { x: rest.l, y: 0, rotate: 0 }, transition: spring.weighty };
  const right = m ? { animate: { y: 0, rotate: 0, ...m.r }, transition: handT(m.times) } : { animate: { x: rest.r, y: 0, rotate: 0 }, transition: spring.weighty };
  const locked = done && outcome === 'both_keep';
  const broken = done && (outcome === 'player_breaks' || outcome === 'character_breaks' || outcome === 'both_break');
  const waiting = phase === 'pick' || phase === 'talk' || phase === 'sealed';
  const settle = (i: number) => (done ? 0.62 + i * 0.07 : i * 0.06);
  const stamp = !done ? null : outcome === 'both_keep' ? 'Kept!' : outcome === 'refused' ? 'Not today' : 'Snapped!';
  const stampColour = outcome === 'both_keep' ? 'var(--keep)' : outcome === 'refused' ? 'var(--paper)' : 'var(--break)';
  const shown = Math.max(0, Math.min(34, jarCoins));

  return (
    <svg className={s.stage} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin slice" role="img" aria-label={label}>
      <defs>
        <pattern id="st-dots" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="6.5" cy="6.5" r="2.7" fill="var(--table-3)" /></pattern>
        <radialGradient id="st-fade"><stop offset="0.35" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <mask id="st-burst"><circle cx={CX} cy={CY} r="250" fill="url(#st-fade)" /></mask>
        <pattern id="st-stripe" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="var(--table-3)" /><rect width="11" height="30" fill="var(--paper-2)" /></pattern>
        {/* two clips: the fill's is 2 units larger, so the outline's antialiased edge never shows as a seam */}
        <clipPath id="st-under-ink"><rect x={298 + OFF} y="170" width="122" height="92" /></clipPath>
        <clipPath id="st-under"><rect x={296 + OFF} y="168" width="126" height="96" /></clipPath>
      </defs>

      {/* halftone burst: the poster's focal point */}
      <rect x={CX - 300} y="-70" width="600" height="500" fill="url(#st-dots)" mask="url(#st-burst)" />

      {/* who is who, in handwriting */}
      <text x={CX - 224} y="290" className={s.tag} textAnchor="middle">you</text>
      <text x={CX + 224} y="290" className={s.tag} textAnchor="middle">{who}</text>

      {/* the Jar */}
      <motion.g
        style={{ transformOrigin: `${CX}px 544px`, transformBox: 'view-box' }}
        initial={false}
        animate={done && outcome === 'both_break' ? { scaleX: [1, 1, 1.05, 0.98, 1], scaleY: [1, 1, 0.94, 1.02, 1] } : { scaleX: 1, scaleY: 1 }}
        transition={{ duration: 0.5, delay: done ? 0.92 : 0, times: [0, 0.1, 0.4, 0.7, 1] }}
      >
        <g transform={shift}>
        <path d="M 296 330 H 424 Q 438 330 438 346 V 518 Q 438 544 412 544 H 308 Q 282 544 282 518 V 346 Q 282 330 296 330 Z" fill="var(--table-2)" stroke="var(--paper)" strokeWidth={5} strokeLinejoin="round" />
        <path d="M 298 356 V 500" stroke="var(--table-3)" strokeWidth={5} strokeLinecap="round" />
        {Array.from({ length: shown }, (_, i) => { const [x, y] = jarCoin(i); return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <circle r={12} fill="var(--coin)" stroke={INK} strokeWidth={3} />
            <circle r={6.5} fill="none" stroke="var(--coin-deep)" strokeWidth={2} />
          </g>
        ); })}
        <rect x={296} y={306} width={128} height={26} rx={6} fill="var(--table-3)" stroke="var(--paper)" strokeWidth={5} />
        <rect x={286} y={288} width={148} height={22} rx={8} fill="var(--paper)" {...outline} />
        <g transform="rotate(7 474 372)">
          <path d="M 434 318 Q 452 330 462 348" fill="none" stroke="var(--paper)" strokeWidth={2.5} />
          <rect x={440} y={346} width={96} height={46} rx={7} fill="var(--paper)" {...outline} strokeWidth={4} />
          <text x={488} y={378} textAnchor="middle" className={s.jarTag}>Swear Jar</text>
        </g>
        </g>
      </motion.g>

      {/* the Lock */}
      <motion.g
        style={{ transformOrigin: `${CX}px ${CY}px`, transformBox: 'view-box' }}
        initial={false}
        animate={locked ? { scale: [1, 1, 1.07, 1] } : { scale: 1 }}
        transition={{ duration: 0.75, times: [0, 0.6, 0.72, 1], ease: ease.out }}
      >
        <motion.g initial={false} style={{ transformOrigin: `${2 * CX - OFF - 136}px 170px`, transformBox: 'view-box' }} {...right}>
          <g className={waiting ? s.breatheR : undefined}><g transform={mirror}><Fist colour="var(--paper)" cuff="url(#st-stripe)" stripe="var(--paper)" /></g></g>
        </motion.g>
        <motion.g initial={false} style={{ transformOrigin: `${OFF + 136}px 170px`, transformBox: 'view-box' }} {...left}>
          <g className={waiting ? s.breatheL : undefined}><g transform={shift}><Fist colour="var(--pink)" cuff="var(--pink-deep)" stripe="var(--paper)" /></g></g>
        </motion.g>
        {/* their pinky passes over yours at the lower crossing, so the two are truly hooked */}
        {(['ink', 'fill'] as const).map((part) => (
          <g key={part} clipPath={part === 'ink' ? 'url(#st-under-ink)' : 'url(#st-under)'} opacity={!done || locked ? 1 : 0}>
            <motion.g initial={false} animate={{ x: right.animate.x }} transition={right.transition}>
              <g className={waiting ? s.breatheR : undefined}><g transform={mirror}>{part === 'ink' ? <PinkyInk /> : <PinkyFill colour="var(--paper)" />}</g></g>
            </motion.g>
          </g>
        ))}
      </motion.g>

      {/* impact marks */}
      {locked && (
        <g>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6 + 0.26;
            const p = (r: number) => `${(CX + Math.cos(a) * r).toFixed(1)} ${(CY + Math.sin(a) * r * 0.86).toFixed(1)}`;
            return (
              <motion.path key={i} d={`M ${p(92)} L ${p(i % 2 ? 122 : 136)}`} stroke={i % 3 ? 'var(--keep)' : 'var(--coin)'} strokeWidth={7} strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0.9] }} transition={{ duration: 0.34, delay: 0.47 + (i % 4) * 0.02, ease: ease.out }} />
            );
          })}
        </g>
      )}
      {broken && (
        <motion.path transform={shift} d="M 366 84 L 348 124 L 372 152 L 346 190 L 370 222 L 354 262" fill="none" stroke="var(--break)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.2, delay: 0.5, ease: ease.out }} />
      )}

      {/* the sealed tag: their move is on the chain before yours */}
      {sealed && !done && (<motion.g initial={{ opacity: 0, y: -18, rotate: -14 }} animate={{ opacity: 1, y: 0, rotate: -6 }} transition={spring.settle} style={{ transformOrigin: `${560 + OFF}px 60px`, transformBox: 'view-box' }}>
        <g transform={shift}>
        <rect x={506} y={22} width={112} height={44} rx={8} fill="var(--coin)" {...outline} strokeWidth={4} />
        <circle cx={528} cy={44} r={8} fill="none" stroke={INK} strokeWidth={4} />
        <text x={574} y={53} textAnchor="middle" className={s.sealTag}>sealed</text>
        </g>
      </motion.g>)}

      {/* coins: three a side */}
      {[0, 1, 2].map((i) => (<Coin key={`r${i}`} to={coinTarget('r', i, sealed, done ? outcome : null)} show={sealed} delay={settle(i + 3)} />))}
      {[0, 1, 2].map((i) => (<Coin key={`l${i}`} to={coinTarget('l', i, staked, done ? outcome : null)} show={staked} delay={settle(i)} />))}

      {/* the stamp: the result, printed */}
      {stamp && (
        <motion.g style={{ transformOrigin: `${CX}px 52px`, transformBox: 'view-box' }} initial={{ scale: 1.7, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -5 }} transition={{ ...spring.thud, delay: 0.5 }}>
          <rect x={CX - 118} y={18} width={236} height={66} rx={14} fill="var(--table)" stroke={stampColour} strokeWidth={6} />
          <text x={CX} y={68} textAnchor="middle" className={s.stamp} fill={stampColour}>{stamp}</text>
        </motion.g>
      )}
    </svg>
  );
}
