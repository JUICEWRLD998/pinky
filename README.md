# Pinky

Keep it or break it. A promise game against characters that hold their own money, remember what you did, and pay for their own thinking. Built for NEAR HACKATHON, track: Games With Real Economies.

**Status: Phase 2 of 9 (rules, simulation, contract on testnet).** There is no app, talking character or audit yet, and this README claims none. Each phase is merged to `main` only when its gate passes.

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
| `CLAIMS.md` | Every claim with the file or command behind it, and the known gaps |
| `DECISIONS.md` | Dated design decisions |

## What is not done

App, characters that talk, audit command, league, hosted demo. See `CLAIMS.md` for the gaps in the
simulation numbers (backing cost is high, apology fees were never exercised by the simulation).

## Licence

MIT. Built with AI assistance (Claude Code). Code and tests are in this repo for review.
