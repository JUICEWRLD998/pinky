// Minimal dependency-free SVG chart: Jar rate and both-keep share over time.
import type { Sample } from './world.ts';

export function chartSvg(samples: Sample[]): string {
  const W = 720;
  const H = 300;
  const m = { l: 48, r: 16, t: 28, b: 32 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const last = samples[samples.length - 1]?.round ?? 1;
  const x = (r: number) => m.l + (r / last) * iw;
  const line = (f: (s: Sample) => number, max: number) =>
    samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.round).toFixed(1)} ${(m.t + ih - (f(s) / max) * ih).toFixed(1)}`).join(' ');
  const grid = [0, 0.25, 0.5, 0.75, 1].map((g) => {
    const y = m.t + ih - g * ih;
    return `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="#c9ced6" stroke-width="1"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#4a5260">${Math.round(g * 100)}%</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Swear Jar rate and both-keep share over simulated rounds" font-family="sans-serif">
<rect width="${W}" height="${H}" fill="#fbfaf7"/>
${grid.join(String.fromCharCode(10))}
<path d="${line((s) => s.jarRateBps, 10000)}" fill="none" stroke="#b4541a" stroke-width="2"/>
<path d="${line((s) => s.kkShare * 10000, 10000)}" fill="none" stroke="#1f6f8b" stroke-width="2"/>
<text x="${m.l}" y="16" font-size="12" fill="#b4541a">Jar rate (bonus as share of stake, axis 0-100%)</text>
<text x="${m.l + 340}" y="16" font-size="12" fill="#1f6f8b">Both-keep share of last 300 games</text>
<text x="${W - m.r}" y="${H - 8}" text-anchor="end" font-size="11" fill="#4a5260">round (simulation, not live play)</text>
</svg>
`;
}
