// Measures the palette in src/styles/tokens.css and prints docs/design/MEASURED.md.
//   node app/scripts/measure-colors.mjs > docs/design/MEASURED.md
// Two different questions, two different instruments:
//   "can this text be read on that ground?"  WCAG 2 contrast ratio
//   "do these two inks look different?"      CIE Lab delta E 76
// The planted controls at the top must hold or the script exits 2 and prints no table.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'src', 'styles', 'tokens.css'), 'utf8');

const tokens = {};
for (const m of css.matchAll(/--([a-z0-9-]+):\s*oklch\(([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\)/g)) {
  tokens[m[1]] = { L: Number(m[2]), C: Number(m[3]), h: Number(m[4]) };
}

function oklchToLinear({ L, C, h }) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
}
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
function toLab([r, g, b]) {
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const deltaE = (a, b) => Math.hypot(...toLab(a).map((v, i) => v - toLab(b)[i]));
const hex = (lin) => '#' + lin.map((v) => {
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(s * 255).toString(16).padStart(2, '0');
}).join('');

// planted controls: known answers, checked before anything is reported
const white = [1, 1, 1];
const black = [0, 0, 0];
const red = [1, 0, 0];
const controls = [
  ['black on white is 21.00:1', Math.abs(ratio(black, white) - 21) < 0.01],
  ['a colour on itself is 1.00:1', Math.abs(ratio(red, red) - 1) < 0.0001],
  ['white to black is delta E 100', Math.abs(deltaE(white, black) - 100) < 0.01],
  ['a colour to itself is delta E 0', deltaE(red, red) < 0.0001],
  ['oklch(1 0 0) is white', hex(oklchToLinear({ L: 1, C: 0, h: 0 })) === '#ffffff'],
  ['the token file was read', Object.keys(tokens).length >= 15],
];
const failed = controls.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('Control failed: ' + failed.map(([name]) => name).join('; '));
  process.exit(2);
}

const lin = (name) => {
  if (!tokens[name]) { console.error('No such token: --' + name); process.exit(2); }
  return oklchToLinear(tokens[name]);
};

// [foreground, ground, where it is used, floor]
const TEXT = [
  ['paper', 'table', 'body text, headings', 4.5],
  ['paper', 'table-2', 'text on a raised panel', 4.5],
  ['paper', 'table-3', 'quiet button label', 4.5],
  ['muted', 'table', 'secondary text, fine print', 4.5],
  ['muted', 'table-2', 'fine print on a panel', 4.5],
  ['coin', 'table', 'Swear Jar amount', 4.5],
  ['keep', 'table', 'the Kept stamp (large)', 3],
  ['break', 'table', 'the Broke stamp (large)', 3],
  ['paper-ink', 'paper', 'text on a paper slip', 4.5],
  ['paper-muted', 'paper', 'fine print on a paper slip', 4.5],
  ['paper-ink', 'paper-2', 'text on a transaction stub', 4.5],
  ['paper-muted', 'paper-2', 'fine print on a match stub', 4.5],
  ['ink', 'pink', 'primary button label', 4.5],
  ['ink', 'keep', 'Keep button label', 4.5],
  ['ink', 'break', 'Break button label', 4.5],
  ['paper-ink', 'break', 'error message', 4.5],
  ['ink', 'coin', 'character kind tag', 4.5],
  ['pink-deep', 'paper', 'rank number on the first row (large)', 3],
];
const MARKS = [
  ['coin', 'table', 'focus ring on the table', 3],
  ['paper-ink', 'paper', 'focus ring on paper', 3],
  ['pink', 'table', 'link underline on the table', 3],
  ['pink-deep', 'paper', 'link underline on paper', 3],
  // known miss, kept visible: the emblem and the name identify the button, the edge alone does not
  ['table-3', 'table', 'unselected character button edge (the emblem and name carry the button)', 3],
  ['chart-jar', 'table-2', 'chart line: Jar bonus', 3],
  ['chart-keep', 'table-2', 'chart line: both kept', 3],
];
const ROLES = ['pink', 'keep', 'break', 'coin'];

const out = [];
out.push('# Measured palette');
out.push('');
out.push('Written by `node app/scripts/measure-colors.mjs` from `app/src/styles/tokens.css`. Do not edit by hand.');
out.push('');
out.push('These numbers come from the declared tokens, converted from OKLCH to sRGB. They are not sampled from');
out.push('rendered pixels. The rendered text pairs were sampled separately by `ui-score.mjs` on the four routes.');
out.push('The script checks six planted controls (black on white 21:1, a colour on itself 1:1, white to black');
out.push('delta E 100, and three more) and prints nothing if one fails.');
out.push('');
out.push('## Text contrast (WCAG 2 ratio)');
out.push('');
out.push('| Text | Ground | Used for | Ratio | Floor | Result |');
out.push('| --- | --- | --- | --- | --- | --- |');
let fails = 0;
const row = ([fg, bg, use, floor]) => {
  const r = ratio(lin(fg), lin(bg));
  const ok = r >= floor;
  if (!ok) fails += 1;
  return `| \`--${fg}\` ${hex(lin(fg))} | \`--${bg}\` ${hex(lin(bg))} | ${use} | ${r.toFixed(2)}:1 | ${floor}:1 | ${ok ? 'pass' : 'FAIL'} |`;
};
TEXT.forEach((t) => out.push(row(t)));
out.push('');
out.push('## Marks that are not text (3:1 floor)');
out.push('');
out.push('| Mark | Ground | Used for | Ratio | Floor | Result |');
out.push('| --- | --- | --- | --- | --- | --- |');
MARKS.forEach((t) => out.push(row(t)));
out.push('');
out.push('## Are the role inks different from each other? (CIE Lab delta E 76, floor 20)');
out.push('');
out.push('| Ink | Ink | Delta E | Result |');
out.push('| --- | --- | --- | --- |');
const pairs = [];
for (let i = 0; i < ROLES.length; i += 1) for (let j = i + 1; j < ROLES.length; j += 1) pairs.push([ROLES[i], ROLES[j]]);
pairs.push(['chart-jar', 'chart-keep']);
for (const [a, b] of pairs) {
  const d = deltaE(lin(a), lin(b));
  if (d < 20) fails += 1;
  out.push(`| \`--${a}\` | \`--${b}\` | ${d.toFixed(1)} | ${d >= 20 ? 'pass' : 'FAIL'} |`);
}
out.push('');
out.push(fails === 0 ? 'Every pair holds its floor.' : `${fails} pair${fails === 1 ? '' : 's'} below the floor. Each one is marked FAIL above.`);
console.log(out.join('\n'));
