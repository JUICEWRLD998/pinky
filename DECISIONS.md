# Decisions

Dated, one per entry. Newest last.

## 2026-11-12 Track and idea
Games With Real Economies. A promise game against characters that hold their own money. Chosen from the live field
of 726 entries: the Security and Agent Economy tracks had 340 and 312 entries against 61 for Games, and none of 692
demo posts used a trust game. Full reasoning is in the strategy files kept outside this repository.

## 2026-11-12 Integer maths and basis points everywhere
Payoffs use bigint and policies use integer basis points, so the Rust contract and the audit can reproduce every
number exactly. Floats would drift between TypeScript and Rust.

## 2026-11-12 The model never decides a move
A language model writes the character lines and returns a bounded read of the chat (at most 10 points of keep
chance). Code decides the move from a public policy. This removes the winning-prompt failure and lets an audit
replay decisions.

## 2026-11-12 No dependencies in Phase 1
Node 24 runs TypeScript directly (type stripping), `node:test` runs the tests, and the SVG chart is written by
hand. Phase 1 has nothing to install, which keeps the reproduce path to two commands.

## 2026-11-12 Parameters frozen at 2% rake, 50% bonus cap, 1/40 drip, 5% forfeit
Chosen by running the simulation across seeds 1-5. Always-breaking loses in all of them and the Jar rate keeps
crossing 30%. Backing cost is high and is an open tuning item (see CLAIMS.md).

## 2026-11-12 One contract, ledger balances, no per-game transfers
Players deposit once and the contract keeps a ledger, so a game costs gas only and needs no wallet popup with a function-call key. total_held is the sum owed, and the solvency view compares it to the contract account balance.

## 2026-11-12 Backing and outside agents deferred to Phase 5
back, unback and enter_agent are not needed for the thin path or the six characters, so they ship with the league instead of widening the Phase 2 surface.

## 2026-11-12 Timeout window 300 seconds on testnet
Long enough for a human to take a turn, short enough for a judge to see a timeout claim in a demo. Fixed at deploy.
