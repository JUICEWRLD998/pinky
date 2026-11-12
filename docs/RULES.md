# Pinky rules

Frozen parameters for the hackathon build. The contract takes them in `new` and has no method to change them.
Every number here is the one the code in `core/payoff.ts` uses, and the one `npm run sim` was run with.

## The game

Two sides, a player and a character, each put up the same stake `s`. They may talk. The character seals its move on
chain first (a hash). Then the player picks KEEP or BREAK. Then the character reveals. Both moves show and money moves.

| Player | Character | Player gets | Character gets | Swear Jar | House |
|---|---|---|---|---|---|
| KEEP | KEEP | `s + b` | `s + b` | `-2b` | 0 |
| BREAK | KEEP | `2s - fee` | 0 | 0 | `fee` |
| KEEP | BREAK | 0 | `2s - fee` | 0 | `fee` |
| BREAK | BREAK | 0 | 0 | `+(2s - fee)` | `fee` |

- `fee = floor(2s * rake)`, rake = **2%** (200 bps). No rake when both keep.
- Jar bonus `b = min(floor(s * 50%), floor(jar / 40))`. So the Jar never pays more than 1/40 of itself per side, and
  never more than half a stake. The Jar rate shown on the table is `b / s`.
- Every row sums to `2s`. A test checks this over 20,000 random cases and every move pair (`test/payoff.test.ts`).
- Mutual betrayal is the only thing that fills the Jar (plus apology fees). Both keeping is the only thing that
  drains it. When the world is full of breakers the Jar swells and keeping pays well. When everyone keeps it drains
  and the temptation returns. Nobody sets that cycle: it comes from the players.

## Timeouts

- The character does not reveal in the window: the player takes both stakes, no rake.
- The player opens a game and never plays: the player forfeits 5% of the stake to the character, and gets the rest back.

## Characters

Six characters, each with a public policy in `core/characters/*.json` and `core/policy.ts`. A policy returns a chance
of keeping in basis points from these inputs only: history with this player, the player record across characters,
the recent share of strangers who broke on first contact, the stake against the character bankroll, the Jar rate,
and a bounded read of the chat.

- **The language model never decides a move.** It writes lines and returns a read (promise, threat, sincerity).
  The read moves the keep chance by at most 10 percentage points (1000 bps), and Dice ignores it. This is why there
  is no winning prompt.
- **Doors.** With at least 5 games on record, a player whose keep rate is under a character floor is refused.
  Mabel also refuses anyone who broke a promise to her. An apology fee (2 stakes, paid into the Jar) reopens a door.
- **Move.** The character private draw for a game is an integer 0..9999 from `HMAC-SHA256(epoch_secret, "draw|game_id")`.
  It keeps when `draw < pKeepBps`. The modulo bias is about 1.7e-6 and is accepted.

## Fairness you can check

- **Sealed move:** `commit = sha256("game_id|MOVE|salt_hex")` goes on chain before the player moves.
- **Salt** is `HMAC-SHA256(epoch_secret, "salt|game_id")`, so the server needs no database.
- **Epoch secret:** each character publishes `sha256(secret)` at the start of an epoch and reveals the secret at the
  end. The audit then replays every decision from the public policy and the inputs snapshotted at seal time.

## Limits, stated plainly

- A player with many fresh accounts can farm trusting characters. Mitigations: new accounts play the lowest stake,
  the stranger policy tightens when the population betrays strangers, and the Jar bonus is capped per game.
  These reduce farming; they do not remove it.
- The simulation uses fixed archetypes, not real people. It shows the economy can cycle and that always breaking
  loses. It does not predict human play.
- This build runs on NEAR testnet with test funds. A real-money version with a rake would need a licence or a
  skill-game structure in most places.
