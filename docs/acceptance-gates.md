# Acceptance gates

A phase is merged to `main` only when its gate passes, from a clean clone, with the command output saved.

| Phase | Gate | Status |
|---|---|---|
| 0 Toolchain | `cargo near --version` and `near --version` print inside WSL; a testnet RPC view call returns; one NEAR AI chat completion returns with the key | PASSED 2026-11-12: cargo-near 0.23.0, near-cli-rs 0.31.1, wasm32 target, testnet view_account, NEAR AI completion 200 |
| 1 Rules and simulation | `npm test` green; `npm run sim -- --seed 7` prints identical numbers twice | PASSED 2026-11-12, merged |
| 2 Contract | Unit and sandbox tests green; contract deployed on testnet; address and deploy tx hash in README | PASSED 2026-11-12: 25 mock-runtime tests + 2 vector tests + 4 sandbox tests green; deployed `pinky.fad-pilot1.testnet`, deploy tx `FZnu9zM4Rm3jm8cAoqYcZ6FUk6gLX7LK23bdoHu8NQsQ` |
| 3 Thin path | A stranger on a clean browser plays one full game in under 60 seconds; four tx hashes saved; five-person playtest asks for a second game | PASSED 2026-11-12: browser game on clean storage in 17 s with 4 tx hashes (`docs/receipts/browser-game.json`); `npm run e2e` live suite all pass (multi-game memory, replay of every Otis decision, conservation, solvency, 13 refused bad calls, key scope, withdraw). Five-person playtest WAIVED: no testers available, recorded as a known gap |
| 4 Characters | A game against each character; an audit of one finished epoch prints PASS for every game; a reply cost is visible as an on-chain transfer | PASSED 2026-11-12: all six played live with signed chat read and on-chain paid reply (`docs/receipts/e2e-characters.txt`, 39 PASS); Mabel's closed door seen in the browser; `npm run audit -- --epoch 1` = 17 PASS, 0 FAIL, 3 SKIP (`docs/receipts/audit-epoch1.txt`); tampered-fixture controls FAIL as they must; reply TEE signature fetched by chat id |
| 5 Economy and league | League rounds on chain with no human playing; one outside agent entered and ranked | PARTIAL 2026-11-12: league rounds on chain with no human (games 43-48, `npm --prefix app run league`, scheduled by `.github/workflows/league.yml`, needs repo secrets); `/league` page; doors already live (Mabel). NOT BUILT: backing, apology fee, enter_agent, so the `swarms` track is not claimed. Contract stayed frozen on purpose |
| 6 Interface | `ui-score.mjs` passes with its planted controls; screenshots at 8 widths in `docs/screens/` | open |
| 7 Judge path | From a clean clone the README commands give the output the README shows; the judge path works from a browser that never saw the site | open |
| 8 Submission | Public repo, demo post on X, form sent once | open |
