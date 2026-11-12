# Pinky

Keep it or break it. A promise game against characters that hold their own money, remember what you did, and pay for their own thinking. Built for NEAR HACKATHON, track: Games With Real Economies.

**Status: Phase 1 of 9 (rules, core logic, simulation).** There is no contract, app or audit yet, and this README claims none. Each phase is merged to `main` only when its gate passes.

## What it will be

You and a character each put up a stake and talk. The character seals its move on chain first. You pick KEEP or BREAK. Both moves show and money moves. If both break, the stakes fall into a shared Swear Jar that pays kept promises later, so the reward for trust rises and falls with how players behave. Each character is a NEAR account with its own balance and a public policy, and pays for its own NEAR AI Cloud replies. Code decides every move, never the language model.

## Try it now (Phase 1)

Requires Node 24 or newer. Nothing to install.

```
npm test                    # 34 tests: conservation, determinism, planted controls
npm run sim -- --seed 7     # 10,000 simulated rounds, prints the headline numbers
```

Expected: `34 pass, 0 fail`, and a simulation summary that starts with
`seed=7 rounds=10000 games=9720` and ends with `conservation OK`. Running it twice gives identical output.
It also writes `out/sim-seed7.csv` and `out/sim-seed7.svg` (a copy is kept in `docs/sim/`).

## Where things are

| Path | What |
|---|---|
| `docs/RULES.md` | The payoff table, parameters, timeouts, doors, fairness, limits |
| `core/payoff.ts` | Integer payoff rules and the conservation check |
| `core/policy.ts`, `core/characters/` | The six public character policies |
| `core/rng.ts` | Seeded generator, sealed-move commit, salt and draw |
| `sim/` | Seeded economy simulation, runner and chart |
| `CLAIMS.md` | Every claim with the file or command behind it, and the known gaps |
| `DECISIONS.md` | Dated design decisions |

## What is not done

Contract, app, characters that talk, audit command, league, hosted demo. See `CLAIMS.md` for the gaps in the
simulation numbers (backing cost is high, apology fees were never exercised by the simulation).

## Licence

MIT. Built with AI assistance (Claude Code). Code and tests are in this repo for review.
