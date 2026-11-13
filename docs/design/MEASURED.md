# Measured palette

Written by `node app/scripts/measure-colors.mjs` from `app/src/styles/tokens.css`. Do not edit by hand.

These numbers come from the declared tokens, converted from OKLCH to sRGB. They are not sampled from
rendered pixels. The rendered text pairs were sampled separately by `ui-score.mjs` on the four routes.
The script checks six planted controls (black on white 21:1, a colour on itself 1:1, white to black
delta E 100, and three more) and prints nothing if one fails.

## Text contrast (WCAG 2 ratio)

| Text | Ground | Used for | Ratio | Floor | Result |
| --- | --- | --- | --- | --- | --- |
| `--paper` #f6f2e3 | `--table` #0d1a32 | body text, headings | 15.47:1 | 4.5:1 | pass |
| `--paper` #f6f2e3 | `--table-2` #172641 | text on a raised panel | 13.47:1 | 4.5:1 | pass |
| `--paper` #f6f2e3 | `--table-3` #243554 | quiet button label | 10.93:1 | 4.5:1 | pass |
| `--muted` #aab8d2 | `--table` #0d1a32 | secondary text, fine print | 8.67:1 | 4.5:1 | pass |
| `--muted` #aab8d2 | `--table-2` #172641 | fine print on a panel | 7.55:1 | 4.5:1 | pass |
| `--coin` #f9c635 | `--table` #0d1a32 | Swear Jar amount | 10.91:1 | 4.5:1 | pass |
| `--keep` #43d9be | `--table` #0d1a32 | the Kept stamp (large) | 9.82:1 | 3:1 | pass |
| `--break` #ff5636 | `--table` #0d1a32 | the Broke stamp (large) | 5.50:1 | 3:1 | pass |
| `--paper-ink` #121f37 | `--paper` #f6f2e3 | text on a paper slip | 14.70:1 | 4.5:1 | pass |
| `--paper-muted` #49566c | `--paper` #f6f2e3 | fine print on a paper slip | 6.64:1 | 4.5:1 | pass |
| `--paper-ink` #121f37 | `--paper-2` #e9e1cb | text on a transaction stub | 12.64:1 | 4.5:1 | pass |
| `--paper-muted` #49566c | `--paper-2` #e9e1cb | fine print on a match stub | 5.70:1 | 4.5:1 | pass |
| `--ink` #050d1e | `--pink` #ff6fb1 | primary button label | 7.57:1 | 4.5:1 | pass |
| `--ink` #050d1e | `--keep` #43d9be | Keep button label | 11.00:1 | 4.5:1 | pass |
| `--ink` #050d1e | `--break` #ff5636 | Break button label | 6.16:1 | 4.5:1 | pass |
| `--paper-ink` #121f37 | `--break` #ff5636 | error message | 5.22:1 | 4.5:1 | pass |
| `--ink` #050d1e | `--coin` #f9c635 | character kind tag | 12.22:1 | 4.5:1 | pass |
| `--pink-deep` #d43b86 | `--paper` #f6f2e3 | rank number on the first row (large) | 3.92:1 | 3:1 | pass |

## Marks that are not text (3:1 floor)

| Mark | Ground | Used for | Ratio | Floor | Result |
| --- | --- | --- | --- | --- | --- |
| `--coin` #f9c635 | `--table` #0d1a32 | focus ring on the table | 10.91:1 | 3:1 | pass |
| `--paper-ink` #121f37 | `--paper` #f6f2e3 | focus ring on paper | 14.70:1 | 3:1 | pass |
| `--pink` #ff6fb1 | `--table` #0d1a32 | link underline on the table | 6.76:1 | 3:1 | pass |
| `--pink-deep` #d43b86 | `--paper` #f6f2e3 | link underline on paper | 3.92:1 | 3:1 | pass |
| `--table-3` #243554 | `--table` #0d1a32 | unselected character button edge (the emblem and name carry the button) | 1.42:1 | 3:1 | FAIL |
| `--chart-jar` #be8b0f | `--table-2` #172641 | chart line: Jar bonus | 4.98:1 | 3:1 | pass |
| `--chart-keep` #2ba996 | `--table-2` #172641 | chart line: both kept | 5.22:1 | 3:1 | pass |

## Are the role inks different from each other? (CIE Lab delta E 76, floor 20)

| Ink | Ink | Delta E | Result |
| --- | --- | --- | --- |
| `--pink` | `--keep` | 107.4 | pass |
| `--pink` | `--break` | 60.8 | pass |
| `--pink` | `--coin` | 100.1 | pass |
| `--keep` | `--break` | 120.5 | pass |
| `--keep` | `--coin` | 87.8 | pass |
| `--break` | `--coin` | 65.0 | pass |
| `--chart-jar` | `--chart-keep` | 79.6 | pass |

1 pair below the floor. Each one is marked FAIL above.
