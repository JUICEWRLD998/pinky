# Pinky: art direction sheet (Phase 6)

The contract every interface decision is checked against. Written 2026-11-13 with `ui-studio` (rewritten the
same day: hero screen first, look loop, one signature moment).

## Subject, audience, jobs

- **Subject:** a pinky promise with money on it. You and a character each stake chips, each secretly choose
  KEEP or BREAK, and the chain reveals both. Betrayals feed a Swear Jar that pays people who keep their word.
- **Audience:** hackathon judges (Games track) who give it one minute, then players who come back.
- **One job per screen:** `/` play one promise and see it resolve. `/league` see who is winning with no human
  playing. `/c/[name]` decide whether to trust or back this character. `/jar` watch the economy run fast.

## The world (vocabulary)

Hooked little fingers. A schoolyard chant ("pinky promise"). A glass jar of coins on a table. Handwritten IOU
slips. A rubber stamp. Screen-printed fairground and playground posters: few inks, thick outlines, halftone
dots, slightly off register. Verbs: hook, lock, squeeze, snap, drop, clink, stamp.

## Concept sentence

Pinky looks like a screen-printed playground poster that moves: two fists with hooked pinkies over a jar of
coins on a midnight-blue table, so that a promise is a thing you watch being kept or snapped.

## Hero object

**The Lock.** Two fists reaching in from the left (you, pink) and the right (them, paper white), pinkies out,
meeting over **the Jar**. It is the largest thing on `/`, it is the logo, and the signature moment acts on it.

## Decisions

| Axis | Choice | Why it belongs |
|---|---|---|
| Depth model | Flat print: solid offset shadows, thick ink outlines, halftone, grain. No blur, no glass, no gradients except halftone | Screen-print poster; also his standing rule (flat, no glass) |
| Drawing | Thick-stroke marks for the hands, geometric emblems for the six characters, diagrammatic Jar. No faces | Styles we can execute exactly; people are shown by their object and their handwriting |
| Display type | Caprasimo (chunky poster serif), big only | Fairground and playground poster lettering |
| Text type | Hanken Grotesk, tabular numbers | Quiet, legible |
| World type | Caveat (handwriting) on slips and speech only | IOU slips and what characters say |
| Theme | One theme (midnight table). A game is art-directed once | craft.md §3 |

**Taste collision, stated:** his SIGNAL DECK is deep blue-black with one mint accent. Kept: deep blue ground,
flat, no glass, no violet. Changed: the action colour is pink because the product is called Pinky; teal (his
mint family) becomes the colour of a kept promise.

## Palette (OKLCH; names are jobs)

| Token | Value | Job |
|---|---|---|
| `--table` | oklch(0.22 0.05 262) | ground: the midnight table |
| `--table-2` | oklch(0.27 0.055 262) | raised panel, halftone dots |
| `--ink` | oklch(0.16 0.04 262) | outlines and offset shadows on the table |
| `--paper` | oklch(0.96 0.02 92) | slips, their hand, primary text on the table |
| `--paper-ink` | oklch(0.24 0.05 262) | text on paper |
| `--muted` | oklch(0.76 0.04 262) | secondary text on the table |
| `--pink` | oklch(0.74 0.19 355) | THE action colour; your hand |
| `--keep` | oklch(0.80 0.13 178) | a kept promise |
| `--break` | oklch(0.68 0.21 33) | a broken promise |
| `--coin` | oklch(0.85 0.16 88) | money, the Jar |

Meaning never rides on hue alone: KEEP is a closed ring, BREAK is a split ring, and both are words. Contrast and
ΔE are measured on the rendered page in Verify and written into `docs/design/MEASURED.md`.

## Composition of `/` (picked from three roughs)

- A. Table: character left, lock centre, jar right. Safe; three equal columns.
- B. Poster: giant lock over a headline, game below the fold. The product is not on the first viewport.
- **C. Duel (picked):** you on the left, them on the right, the Lock crossing the middle, the Jar directly
  under the Lock. The vertical axis is the mechanism (promise above, Jar below: broken stakes fall straight
  down into it, bonuses rise out of it). The horizontal axis is the two parties. Asymmetric weight: their side
  carries the character card and speech, your side carries the controls.

```
 Pinky (mark)                                   League  Jar  [guest · 0.48 chips]
 ┌ you ───────────┐        THE LOCK         ┌ them ─────────────────┐
 │ your slip:     │   fist ══╗   ╔══ fist    │ emblem  Mabel         │
 │ chips, record  │         ╚═╦═╝           │ persona               │
 │                │        ( stake )        │ "speech, handwritten" │
 │ [Sit down]     │        ┌ JAR ┐          │ cast: six emblems     │
 │ say / shake /  │        │coins│          │                       │
 │ KEEP  BREAK    │        └─────┘          │                       │
 └────────────────┘   verdict slip lands    └───────────────────────┘
 chain tape: open · seal · play · reveal (tx links)
```

Phone: them (compact) on top, Lock and Jar in the middle, your controls in a bottom dock.

## Motion language

Controls are crisp (no bounce). Fists move with weight (`spring.weighty`). Paper slides in and settles a few
degrees off square (`spring.settle`). Coins fall, bounce once and clink (`spring.weighty`). Stamps thud
(`spring.thud`). Money always travels along a visible path between a party and the Jar.

Living detail: while a game waits for a move, the two fists breathe toward each other (2 px, 3 s), paused
under reduced motion.

## Signature moment: "The Pinky"

```
Trigger:   the settled game arrives (phase 'done')
t=0        anticipation: both fists pull back 16 px and tilt; the halftone burst dims
t=160ms    action: both fists swing in (spring.weighty)
t=460ms    impact, by outcome:
           both_keep        pinkies interlock, squeeze 1.08 -> 1, tick marks burst, ring closes (teal)
           player_breaks    your pinky snaps straight and your fist jerks back; theirs is left hooked on air
           character_breaks mirrored
           both_break       both snap apart, a crack mark splits the middle (vermilion)
           refused          their fist turns away before contact; yours stays out
t=620ms    consequence: coins travel. keep: bonus coins rise from the Jar to both sides. one breaks: the
           stake coins slide to the breaker. both break: every coin drops into the Jar, which bounces
t=900ms    the verdict slip stamps in under the Lock: outcome sentence, moves, payout counting up
settle     <= 1400ms
Eye:       fists -> pinkies -> coins -> verdict slip
End state: verdict as text (aria-live polite), payout number, coins at rest
Reduced:   crossfade to the end pose and the slip
Poster:    t~520ms both_keep, locked, burst visible
```

Deterministic: choreography depends only on the outcome kind. A click during it jumps to the end state.

## Build plan (order)

1. `src/styles/tokens.css`, `src/lib/motion.ts`, fonts in `layout.tsx`, `Shell` (mark + nav).
2. Hero screen `/`: `Lock`, `Jar`, `Emblem`, `Slip`, `Coin`, `ChainTape`; look loop x3 at 1280 and 375.
3. Signature moment in `Lock` with a `?demo=<outcome>` switch for filming (no chain call), filmstrip.
4. Spread: `/league`, `/c/[name]`, `/jar` (simulation, labelled SIMULATION).
5. Verify: 8 widths, `ui-score.mjs`, journey click-through on testnet, contrast table, reduced motion.
6. Screenshots to `docs/screens/`.
