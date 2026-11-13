// The six characters are shown by their object, never by a face. Geometric emblems on a 48 grid:
// one outline weight, palette tokens only (docs/design/ART_DIRECTION.md).
import type { ReactNode } from 'react';

const INK = 'var(--ink)';
const o = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

const ART: Record<string, ReactNode> = {
  // Mabel runs a flower stall.
  Mabel: (
    <>
      <path d="M24 30 V43" {...o} stroke="var(--keep)" strokeWidth={4} fill="none" />
      <path d="M24 38 C19 37 16 34 16 31 C20 31 23 33 24 38 Z" fill="var(--keep)" {...o} />
      {[0, 72, 144, 216, 288].map((a) => (<circle key={a} cx="24" cy="10.5" r="6" fill="var(--paper)" {...o} transform={`rotate(${a} 24 19)`} />))}
      <circle cx="24" cy="19" r="5" fill="var(--coin)" {...o} />
    </>
  ),
  // Otis drove a bus.
  Otis: (
    <>
      <rect x="9" y="7" width="30" height="32" rx="7" fill="var(--keep)" {...o} />
      <rect x="13" y="12" width="22" height="12" rx="3" fill="var(--table-2)" {...o} />
      <path d="M24 12 V24" {...o} fill="none" />
      <circle cx="15.5" cy="31" r="2.6" fill="var(--coin)" {...o} />
      <circle cx="32.5" cy="31" r="2.6" fill="var(--coin)" {...o} />
      <rect x="12" y="39" width="6" height="4" rx="1.5" fill={INK} />
      <rect x="30" y="39" width="6" height="4" rx="1.5" fill={INK} />
    </>
  ),
  // Fenn is a dealer.
  Fenn: (
    <>
      <rect x="9" y="9" width="22" height="31" rx="4" fill="var(--paper-2)" {...o} transform="rotate(-12 20 24)" />
      <rect x="17" y="8" width="22" height="31" rx="4" fill="var(--paper)" {...o} transform="rotate(8 28 24)" />
      <path d="M28.5 15.5 L34 23.5 L28.5 31.5 L23 23.5 Z" fill="var(--break)" {...o} transform="rotate(8 28 24)" />
    </>
  ),
  // Prue is a vicar's widow: a candle kept lit.
  Prue: (
    <>
      <path d="M24 5 C28 10 29 12.5 29 15 A5 5 0 0 1 19 15 C19 12.5 20 10 24 5 Z" fill="var(--coin)" {...o} />
      <rect x="19" y="20" width="10" height="17" rx="2" fill="var(--paper)" {...o} />
      <path d="M24 20 V17" {...o} fill="none" />
      <path d="M12 37 H36 L33 43 H15 Z" fill="var(--keep)" {...o} />
    </>
  ),
  // Dice flips for everything.
  Dice: (
    <>
      <rect x="9" y="9" width="30" height="30" rx="8" fill="var(--paper)" {...o} transform="rotate(-8 24 24)" />
      {[[17, 17], [31, 17], [24, 24], [17, 31], [31, 31]].map(([x, y]) => (<circle key={`${x}-${y}`} cx={x} cy={y} r="2.8" fill={INK} transform="rotate(-8 24 24)" />))}
    </>
  ),
  // Abacus is an accountant.
  Abacus: (
    <>
      <rect x="7" y="9" width="34" height="30" rx="5" fill="var(--coin)" {...o} />
      <rect x="11.5" y="13.5" width="25" height="21" rx="2" fill="var(--table-2)" {...o} />
      <path d="M11.5 20.5 H36.5 M11.5 27.5 H36.5" {...o} fill="none" strokeWidth={1.8} />
      <circle cx="17" cy="20.5" r="3" fill="var(--paper)" {...o} />
      <circle cx="23.5" cy="20.5" r="3" fill="var(--paper)" {...o} />
      <circle cx="31" cy="27.5" r="3" fill="var(--break)" {...o} />
      <circle cx="24.5" cy="27.5" r="3" fill="var(--keep)" {...o} />
    </>
  ),
};

/** An outside agent that entered the league: a plain token with its initial. */
function Token({ name }: { name: string }) {
  return (
    <>
      <circle cx="24" cy="24" r="15" fill="var(--pink)" {...o} />
      <text x="24" y="31" textAnchor="middle" fontSize="19" fontFamily="var(--font-display)" fill={INK}>{name.slice(0, 1).toUpperCase()}</text>
    </>
  );
}

export function Emblem({ name, size = 48, title }: { name: string; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {ART[name] ?? <Token name={name} />}
    </svg>
  );
}

/** The two hooked pinkies, small: the logo. */
export function Mark({ size = 40 }: { size?: number }) {
  const tube = (d: string, colour: string) => (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={10} strokeLinecap="round" />
      <path d={d} fill="none" stroke={colour} strokeWidth={6} strokeLinecap="round" />
    </>
  );
  const left = 'M5 23 H26 A8.5 8.5 0 0 0 26 6 H24';
  const right = 'M59 23 H38 A8.5 8.5 0 0 1 38 6 H40';
  return (
    <svg width={size * 2.13} height={size} viewBox="0 0 64 30" aria-hidden="true" focusable="false">
      {tube(right, 'var(--paper)')}
      {tube(left, 'var(--pink)')}
      <clipPath id="mark-under"><rect x="26" y="15" width="12" height="15" /></clipPath>
      <g clipPath="url(#mark-under)">{tube(right, 'var(--paper)')}</g>
    </svg>
  );
}
