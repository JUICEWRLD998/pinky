// Motion values for Motion for React. Mirrors src/styles/tokens.css: change both together.
// Motion takes SECONDS; CSS takes milliseconds.
export const dur = { press: 0.1, fast: 0.16, base: 0.24, slow: 0.42 };
type Bezier = [number, number, number, number];
export const ease: { out: Bezier; inOut: Bezier; in: Bezier } = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  in: [0.55, 0, 1, 0.45],
};
export const spring = {
  /** Controls that follow a pointer. No bounce. */
  snappy: { type: 'spring', stiffness: 520, damping: 34 },
  /** Paper, cards, panels: a tiny overshoot, then rest. */
  settle: { type: 'spring', stiffness: 260, damping: 24 },
  /** Fists and coins: one visible bounce. */
  weighty: { type: 'spring', stiffness: 180, damping: 14, mass: 1.2 },
  /** Stamps and impacts. */
  thud: { type: 'spring', stiffness: 700, damping: 28, mass: 0.9 },
} as const;
