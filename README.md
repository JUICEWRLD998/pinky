# Pinky

Keep it or break it. A promise game against characters that hold their own money, remember what you did, and pay for their own thinking. Built for NEAR HACKATHON, track: Games With Real Economies.

**Status: Phase 5 of 9 done (league, backing, apology fee and outside agents live on the v2 contract `pinky2.fad-pilot1.testnet`).** There is no polished interface or judge page yet, and this README claims none.

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

## The contract (Phase 2)

Live on NEAR testnet: [`pinky.fad-pilot1.testnet`](https://testnet.nearblocks.io/address/pinky.fad-pilot1.testnet),
deployed in transaction [`FZnu9zM4Rm3jm8cAoqYcZ6FUk6gLX7LK23bdoHu8NQsQ`](https://testnet.nearblocks.io/txns/FZnu9zM4Rm3jm8cAoqYcZ6FUk6gLX7LK23bdoHu8NQsQ).
Wasm sha256 `5563a38fe36861f96cd41d13c2cff9899f385a231a79d6ed401245f8e66faa3f`. The parameters are set in `new` and have no setter. Read them:

```
node -e "fetch('https://test.rpc.fastnear.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'query',params:{request_type:'call_function',finality:'final',account_id:'pinky.fad-pilot1.testnet',method_name:'get_config',args_base64:'e30='}})}).then(r=>r.json()).then(j=>console.log(Buffer.from(j.result.result).toString()))"
```

Run the contract tests (Rust, inside WSL or Linux; the sandbox tests need the built wasm):

```
cd contract && cargo test                                   # 25 game tests + 2 golden-vector parity tests
cargo near build non-reproducible-wasm
cd ../integration && PINKY_WASM=<path to pinky_contract.wasm> cargo test   # 4 sandbox tests
```

## Play one game (Phase 3)

Needs Node 24 and a `.env` with the server keys (names in `.env.example`). Only Otis exists, with scripted lines.

```
cd app && npm install
npm run play            # a stranger's whole game from the command line, prints 4 tx hashes, saves docs/receipts/game-N.json
npm run build && npm start   # the web table on http://localhost:3100
```

A guest account holds only a function-call key for `open_game`, `play`, `withdraw`, `claim_timeout`. The server seals and reveals
Otis's move; the move comes from his public policy and a draw from his epoch secret. Receipts: `docs/receipts/`.

## Characters, payments and the audit (Phase 4)

All six characters (Mabel, Otis, Fenn, Prue, Dice, Abacus) are funded NEAR sub-accounts, registered on the contract with an open epoch.

- **Talk:** `POST /api/talk` sends the player's line to NEAR AI Cloud (`Qwen/Qwen3.8-27B`, non-thinking). The model returns one in-character line and a
  read of the message (promise, threat, sincerity). The read can move the chance of keeping by at most 10 points and the server signs it for that one game.
  The model never sees or picks a move.
- **Paid on chain:** after each reply the character calls `pay_inference` on the contract: the metered USD cost converted at a fixed 3 USD per NEAR
  (demo rate, `core/inference.ts`) moves from the character's ledger balance to the house. The memo holds the model and the chat id, so the reply's
  TEE signature is fetchable: `GET https://cloud-api.near.ai/v1/signature/<chat_id>?model=Qwen/Qwen3.8-27B&signing_algo=ecdsa`.
  Below a 0.05 NEAR ledger balance a character goes quiet (canned lines, nothing paid).
- **Epochs:** `npm --prefix app run epoch` settles overdue games, reveals the finished epoch secret and commits the next one (secrets are
  HMAC(master, name|epoch), so no storage).
- **Audit (no keys needed):**

```
npm run audit -- --epoch 1
```

Expected: per game `PASS`, `FAIL` or `SKIP` (timeouts have no sealed move) and a last line like `epoch 1: 17 PASS, 0 FAIL, 3 SKIP`. Saved run: `docs/receipts/audit-epoch1.txt`.
It recomputes from chain data: the policy decision, the private draw, the commit, the stake share and the Jar rate. It cannot recompute pair history, the
player record, the stranger-break rate or the chat read (the character attests those, bounded by policy). Tampered fixtures print FAIL (`npm test`).

Live checks (testnet, need the server keys): `npm --prefix app run e2e` and `npm --prefix app run e2e:characters`.

## The league and the economy layer (Phase 5)

Contract v2 is [`pinky2.fad-pilot1.testnet`](https://testnet.nearblocks.io/address/pinky2.fad-pilot1.testnet) (wasm sha256 `91ab0e36…6169`, deploy tx `7SCjCX3hbeTenifGUjDxFEym1LKKTaZY2ifuHtu5NKap`). It adds `back`/`unback` (shares of a character bankroll), `apologize` (2 minimum stakes into the Jar reopens that character's door for the player) and `enter_agent` (anyone enters an agent with a public policy and a bankroll). The v1 contract above is kept untouched as the audited history. Live proof: `docs/receipts/v2-live-checks.txt` (14 PASS) and `docs/receipts/v2-audit-epoch1.txt` (14 PASS, 0 FAIL, including the outside agent Beacon). Outside agents choose one of six policy kinds and set its weights (`parseAgentPolicy` in `core/policy.ts`), so they are judged by the same public rules and the same audit as the six.

Characters play each other with their own ledger money: one opens a game as the player, the other seals, the first plays by its public policy, the second reveals.
`npm --prefix app run league -- 6` plays six rounds (rotating through every pairing); `.github/workflows/league.yml` runs it every 30 minutes once the
repository secrets named in that file are set. `/league` shows bankrolls, the Jar and the latest games live from the contract. Audit passes league games
too (`docs/receipts/audit-epoch1-all-six.txt`: 33 PASS, 0 FAIL, 3 SKIP). The player side of a league game follows the same public policy but its move is not
sealed first, so the audit checks the sealing character only.

Beacon, the demo outside agent, is run by this repository's runner with a key we hold; a real outside party would run their own agent with their own key. The `/league` page ranks every registered character by bankroll.

## Where things are

| Path | What |
|---|---|
| `docs/RULES.md` | The payoff table, parameters, timeouts, doors, fairness, limits |
| `core/payoff.ts` | Integer payoff rules and the conservation check |
| `core/policy.ts`, `core/characters/` | The six public character policies |
| `core/rng.ts` | Seeded generator, sealed-move commit, salt and draw |
| `sim/` | Seeded economy simulation, runner and chart |
| `contract/` | Rust contract, payoff module, golden-vector and game tests |
| `integration/` | Sandbox tests on the compiled wasm |
| `app/` | Next.js table, API routes (usher, talk, seal, reveal), server logic, setup, epoch, audit and e2e scripts |
| `core/inference.ts`, `core/audit.ts` | Metered cost, bounded chat read, signed read; the pure game audit |
| `CLAIMS.md` | Every claim with the file or command behind it, and the known gaps |
| `DECISIONS.md` | Dated design decisions |

## What is not done

Five-person playtest (waived), league, backing, interface polish, audit command, league, hosted demo. See `CLAIMS.md` for the gaps in the
simulation numbers (backing cost is high, apology fees were never exercised by the simulation).

## Licence

MIT. Built with AI assistance (Claude Code). Code and tests are in this repo for review.
