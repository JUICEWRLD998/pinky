# Pinky: instructions for coding agents

- Rules live in `docs/RULES.md`. `core/payoff.ts` is the source of truth for money. Change them together.
- Money is bigint, policies are integer basis points. No floats in anything that touches money or a decision.
- Every claim goes in `CLAIMS.md` with a file or command behind it.
- Tests first for the core. A control that cannot fail does not count: plant a failure.
- No secrets in git. `.env` is ignored; `.env.example` lists the names.
- Node 24, no dependencies in `core/`, `sim/`, `test/`.
- Commit small, push after each commit, work on a branch per phase, merge to main when the phase gate passes.
