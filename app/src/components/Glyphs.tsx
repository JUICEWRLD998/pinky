// Small drawn parts shared by the league, character and Jar screens. Same print rules as the Lock: thick ink
// outlines, solid fills, palette tokens only. No hooks here, so server components can use them.
import k from './kit.module.css';

const INK = 'var(--ink)';

/** KEEP is a closed ring, BREAK is a ring snapped in two. Shape carries the meaning; colour repeats it. */
export function MoveGlyph({ move, size = 24 }: { move: 'KEEP' | 'BREAK' | null; size?: number }) {
  if (move === null) {
    return (<svg viewBox="0 0 28 28" width={size} height={size} role="img" aria-label="no move"><path d="M8 14 H20" stroke="var(--muted)" strokeWidth={4} strokeLinecap="round" /></svg>);
  }
  const d = move === 'KEEP' ? 'M14 5 A9 9 0 1 1 13.99 5' : 'M11 5.5 A9 9 0 0 0 11 22.5 M17 5.5 A9 9 0 0 1 17 22.5';
  const colour = move === 'KEEP' ? 'var(--keep)' : 'var(--break)';
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} role="img" aria-label={move === 'KEEP' ? 'kept' : 'broke'}>
      <g transform={move === 'BREAK' ? 'rotate(18 14 14)' : undefined} fill="none" strokeLinecap="round">
        <path d={d} stroke={INK} strokeWidth={8} />
        <path d={d} stroke={colour} strokeWidth={4.5} />
      </g>
    </svg>
  );
}

/** Share of promises kept, as a ring that closes as the share rises. The number is always written beside it. */
export function KeepRing({ keeps, games, size = 64 }: { keeps: number; games: number; size?: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const share = games > 0 ? keeps / games : 0;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={games > 0 ? `kept ${keeps} of ${games}` : 'no games yet'}>
      <circle cx="32" cy="32" r={r} fill="none" stroke={INK} strokeWidth={12} />
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--table-3)" strokeWidth={7} />
      {share > 0 && (
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--keep)" strokeWidth={7} strokeLinecap={share < 1 ? 'round' : 'butt'}
          strokeDasharray={`${(c * share).toFixed(2)} ${c.toFixed(2)}`} transform="rotate(-90 32 32)" />
      )}
      <text x="32" y="37.5" textAnchor="middle" className={k.ringText}>{games > 0 ? `${Math.round(share * 100)}%` : '0'}</text>
    </svg>
  );
}

/** A bankroll as a row of coins. The count is the measure, from zero, so rows compare like bars. */
export function Coins({ n, size = 26 }: { n: number; size?: number }) {
  const count = Math.max(0, Math.floor(n));
  const step = 15;
  const w = count === 0 ? 30 : 30 + (count - 1) * step;
  return (
    <svg viewBox={`0 0 ${w} 30`} width={(w * size) / 30} height={size} aria-hidden="true" style={{ display: 'block', maxWidth: '100%' }}>
      {count === 0 && <circle cx="15" cy="15" r="11" fill="none" stroke="var(--table-3)" strokeWidth={3} strokeDasharray="4 5" />}
      {Array.from({ length: count }, (_, i) => (
        <g key={i} transform={`translate(${15 + i * step} 15)`}>
          <circle r="12" fill="var(--coin)" stroke={INK} strokeWidth={3} />
          <circle r="6.5" fill="none" stroke="var(--coin-deep)" strokeWidth={2} />
        </g>
      ))}
    </svg>
  );
}

export const JAR_ROW = 5;
export const JAR_MAX = 60;

/** Where coin `i` rests in the Jar: rows from the bottom, fixed by index so the pile never reshuffles. */
function jarCoin(i: number): [number, number] {
  const row = Math.floor(i / JAR_ROW);
  const col = i % JAR_ROW;
  const nudge = ((i * 37) % 7) - 3;
  return [52 + col * 24 + (row % 2 ? 8 : 0) + nudge * 0.6, 246 - row * 16.5 - Math.abs(nudge)];
}

/** The Swear Jar on its own. A coin that appears drops in from the lid; coins that leave are simply gone. */
export function JarArt({ coins, tag = 'Swear Jar', label, className }: { coins: number; tag?: string | null; label: string; className?: string }) {
  const shown = Math.max(0, Math.min(JAR_MAX, Math.floor(coins)));
  return (
    <svg className={className} viewBox={tag === null ? '0 0 200 280' : '0 0 290 280'} role="img" aria-label={label} style={{ display: 'block', overflow: 'visible' }}>
      <path d="M 36 54 H 164 Q 178 54 178 70 V 242 Q 178 268 152 268 H 48 Q 22 268 22 242 V 70 Q 22 54 36 54 Z" fill="var(--table-2)" stroke="var(--paper)" strokeWidth={5} strokeLinejoin="round" />
      <path d="M 38 80 V 224" stroke="var(--table-3)" strokeWidth={5} strokeLinecap="round" />
      {Array.from({ length: shown }, (_, i) => {
        const [x, y] = jarCoin(i);
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <g className={k.coinDrop}>
              <circle r={12} fill="var(--coin)" stroke={INK} strokeWidth={3} />
              <circle r={6.5} fill="none" stroke="var(--coin-deep)" strokeWidth={2} />
            </g>
          </g>
        );
      })}
      <rect x={36} y={30} width={128} height={26} rx={6} fill="var(--table-3)" stroke="var(--paper)" strokeWidth={5} />
      <rect x={26} y={12} width={148} height={22} rx={8} fill="var(--paper)" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      {tag !== null && (<g transform="rotate(7 214 96)">
        <path d="M 174 42 Q 192 54 202 72" fill="none" stroke="var(--paper)" strokeWidth={2.5} />
        <rect x={170} y={70} width={112} height={46} rx={7} fill="var(--paper)" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
        <text x={226} y={102} textAnchor="middle" className={k.jarTag}>{tag}</text>
      </g>)}
    </svg>
  );
}
