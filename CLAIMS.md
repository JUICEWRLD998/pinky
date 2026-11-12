# Claims

Every claim made in this repo, and the file, test or command that backs it. Nothing here is claimed unless a row
points at something a reader can run. Status: Phase 1 only. No contract, app or audit exists yet, and none is claimed.

| Claim | Evidence | Run |
|---|---|---|
| Payouts conserve money: every outcome sums to twice the stake | `core/payoff.ts` `checkConservation`, `test/payoff.test.ts` (20,000 random cases x 4 move pairs, plus edge cases) | `npm test` |
| The conservation check can fail | Planted controls in `test/payoff.test.ts` (a settle that leaks one unit, one that overdraws the Jar) and `test/sim.test.ts` (leaky settle) | `npm test` |
| The Jar never goes negative and never pays more than 1/40 of itself per side | `bonus()` in `core/payoff.ts`, checked by `checkConservation` | `npm test` |
| Character decisions are deterministic, integer, and bounded 0..10000 | `test/policy.test.ts` (5,000 random inputs x 6 characters) | `npm test` |
| The chat read moves a keep chance by at most 1000 bps; Dice ignores it | `readAdjustBps`, `test/policy.test.ts` | `npm test` |
| Commit, salt and draw are deterministic and bind game, move and salt | `core/rng.ts`, `test/rng.test.ts` | `npm test` |
| The draw is roughly uniform | `test/rng.test.ts` (20,000 draws, 10 buckets, each within 10% of expected) | `npm test` |
| The simulation is reproducible for a fixed seed | `test/sim.test.ts` | `npm test` |
| Money is conserved on every simulated round | `conservationOk` in `sim/world.ts`, tested on seeds 1-3 for 10,000 rounds | `npm test` |
| Always breaking loses; always keeping does not | `test/sim.test.ts`, seeds 1-5 | `npm test` |

## Simulation headline numbers (seed 7, 10,000 rounds, 20 simulated players, 6 characters, stake 1)

Reproduce: `npm run sim -- --seed 7`. Outputs `out/sim-seed7.csv` and `.svg`; a copy is kept in `docs/sim/`.

| Number | Value |
|---|---|
| Games played | 9,720 |
| Outcomes | both keep 43.4%, player breaks 18.7%, character breaks 18.9%, both break 19.1% |
| Jar balance | min 0.00, max 49.81, final 10.91 |
| Times the Jar rate crossed 30% | 346 |
| Mean final bankroll per player (start 100) | alwaysKeep 112.57, jarTimer 124.70, random 125.03, mirror 79.26, alwaysBreak 24.43 |
| Final character bankrolls (start 30) | Mabel 279.56, Prue 377.33, Abacus 323.49, Otis 15.06, Fenn 15.66, Dice 14.59 |
| House take (rake plus inference fees) | 239.44 |
| Backing injected to keep broke characters open | 960.00 |
| Apology fees paid | 0 |

Across seeds 1-5 the always-break archetype ended between 8.8 and 29.8 (start 100) and always-keep between 102.5
and 121.5.

## Known gaps in these numbers

- **Backing is large.** 960 units were injected to keep the three characters Otis, Fenn and Dice open, against 600
  units of starting character bankroll. In this tuning, the human archetypes drain those three. Phase 5 backing and
  stake sizing need tuning; this simulation does not show a self-sustaining character economy yet.
- **No apology ever fired** at seed 7: the apology branch needs every character to be closed to a player, and that
  rarely happens with six characters. The apology rules are unit-tested in `test/policy.test.ts` but not exercised
  by the simulation.
- **Mirror loses** about 20 to 35 percent. Tit-for-tat against characters that include two cheats is not free. This
  is a finding, not a goal.
- The simulation archetypes are fixed rules, not people.

## Phase 2: the contract (2026-11-12)

- **The Rust payoff maths equals the TypeScript rules on 2,880 vectors.** `contract/tests/vectors.rs`, run with `cd contract && cargo test --test vectors`. The test has a planted control.
- **Outcomes, timeouts, auth and epoch rules hold in the mock runtime.** 25 tests in `contract/tests/game.rs`. Every money test ends with a conservation check (balances + Jar + house + open stakes = total_held), and a planted control shows the checker fails on a forged yocto.
- **The compiled wasm works in a sandbox with real transfers.** 4 tests in `integration/tests/sandbox.rs`: a full game, a withdraw that raises the account native balance, a wrong salt that fails and changes nothing, a timeout claim after the window.
- **Deployed on testnet.** `pinky.fad-pilot1.testnet`, deploy tx `FZnu9zM4Rm3jm8cAoqYcZ6FUk6gLX7LK23bdoHu8NQsQ`, `get_config` returns the frozen parameters, `mabel.fad-pilot1.testnet` is registered (tx `2S6FmSrbpuTUSDj6vFQLESkE3sHUnHMS1FvMtdcRdUw6`).

### Known gaps (contract)

- `back`, `unback` and `enter_agent` are not built; they move to Phase 5 with the league.
- The deployed wasm was built non-reproducibly on the author machine. The sha256 is recorded; a reproducible build is not claimed.
- No testnet game has been played yet; the on-chain game is the Phase 3 gate.
- A player can have at most 3 open games and a character can only open games its balance covers; these are anti-spam limits, not fairness proofs.

## Phase 3 (thin path)

| Claim | Evidence |
|---|---|
| A guest account holds only a function-call key and no full-access key | `app/server/usher.ts` builds one tx: CreateAccount, Transfer, AddFunctionCallAccessKey. Check keys: `near account list-keys <guest>` |
| A full game runs from a clean browser in under 60 s | `docs/receipts/browser-game.json` (17 s, four tx hashes), `docs/receipts/browser-game.png` |
| The same flow runs from the command line | `cd app && npm run play`; `docs/receipts/game-2.json` |
| The usher is rate limited (3 per IP per hour, 40 overall) | `app/server/limit.ts`, `app/test/limit.test.ts` (6 tests, one planted control) |
| Otis's move comes from his public policy and an epoch-secret draw | `app/server/otis.ts`, `core/policy.ts`, `core/rng.ts` |

| The live e2e suite passes on testnet | `cd app && npm run e2e` (planted control included) |

Known gaps: five-person playtest not done (no testers; "do people start a second game unprompted" is unmeasured); stranger-break rate is a fixed 2000 bps until Phase 4 measures it; the limiter is
in memory and per process; the usher funds guests from one testnet account that needs faucet top-ups.
