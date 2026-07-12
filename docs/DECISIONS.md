# Decision Log

Notable design & engineering decisions for **Queue Brain — Block Logic
Sandbox**, with the reasoning and trade‑offs behind them. Paired with
[`TIMELINE.md`](TIMELINE.md) (what happened, when). Append new decisions at the
bottom; don't rewrite old ones — if a decision is reversed, add a new entry
that supersedes it.

Format: each entry has a short ID, a date, the decision, why, and (where it
matters) what was rejected.

> Started 2026‑07‑11. Entries D1–D6 are reconstructed from the spec and code;
> D7+ are logged as decisions are made.

---

### D1 — Pure, side‑effect‑free interpreter (`runTick`)
**Date:** 2026‑07‑09 · **Area:** blocks/interpreter

The block program is executed by a pure `runTick(program, world, runtime)` that
returns a new world plus a `TickResult` (moves, violations, problems, trace,
sayings). No React, no DOM, no hidden module state (aside from deliberate
`random`). **Why:** makes the whole language node‑testable in isolation and
keeps rendering a pure function of state. Rooms are updated immutably (drafts
via spread), which later turned out to matter for correctness of undo/reset.

### D2 — Rooms & walls modelled per‑cell with a two‑sided edge rule
**Date:** 2026‑07‑09 · **Area:** engine/pathfinding

Each room stores `wallRules` for its four sides (`auto` / `open` / `closed`).
An edge between two cells is **closed if *either* side says closed**, and
**open if *either* side says open** (`getWallRuleForEdge`). **Why:** lets a
single one‑sided `set wall … to open` punch a door through a wall the neighbour
still considers closed, which is exactly what the "leave one door" lessons need.
Opening syncs both sides; closing stamps only one.

### D3 — Reservation‑based movement, with a rule monitor
**Date:** 2026‑07‑09 · **Area:** interpreter/rules

Parties move by *intent*: they reserve cells, then a monitor detects the two
sacred violations (two parties in one room; two parties swapping through each
other). In strict mode the monitor reverts offending moves to a fixpoint (both
sides of a swap must wait). **Why:** this is the core concept the lessons teach,
and reporting violations even in learning mode powers the coach.

### D4 — Simulation state lives in a hook driven by "latest value" refs
**Date:** 2026‑07‑10 · **Area:** hooks/useSandboxEngine

`useSandboxEngine` owns world + sim state and ticks on a `setInterval`. The
interval callback reads world/program/runtime from refs (updated each render)
so it never closes over stale state and never needs to restart on every change.
**Why:** stable tick loop without re‑subscribing; the program is owned by
`App.jsx` and passed in, keeping editor/engine/coach on one shared program.

### D5 — Lessons are pure data with declarative success checks
**Date:** 2026‑07‑10 · **Area:** teach/lessons + lessonRunner

Each lesson is `{ story, instructions, world, starterProgram (real AST),
success[], hints[] }`. Checks (`party_at`, `used_block`, `within_ticks`,
`no_violations`, …) are evaluated purely against world + tick history + program.
**Why:** lessons stay node‑testable and the coach panel is just a renderer.
Note `within_ticks` is a *live* check (`tick <= n`), so a lesson is "complete"
only in the window where the goal is met **and** the tick budget isn't blown —
budgets need real headroom over the optimal path.

### D6 — Doors visualized by swinging the actual wall segment
**Date:** 2026‑07‑10 · **Area:** components/Grid

Every grid edge renders a wall segment; "open" ones rotate about a vertical
hinge (a real swinging door) rather than disappearing. Explicit `closed` walls
paint red, the outer shell cream, resting `auto` doors grey. **Why:** makes the
building's structure and the effect of build blocks legible and physical.

### D7 — Open doors either swing 90° *or* drop into the floor
**Date:** 2026‑07‑11 · **Area:** components/Grid · **Supersedes part of D6**

A door swings to **exactly 90°** (was ~86°, which never lined up parallel with
the wall it folds against). But swinging is only right when there's a standing
wall to fold flush against. When a door would instead swing onto an edge that is
*itself an open passage* — the inner doors of a fused big room — the leaf just
sits across open space and makes the room read as still walled off. Those doors
now **drop straight down into the floor** and disappear (still logically open).

- A door's "landing edge" (the perpendicular edge it comes to rest along) is
  computed from its id + swing direction (`landingEdgeId`). It **drops iff that
  landing edge is open**; otherwise it swings and folds against the wall there.
- **Rejected:** dropping *all* open doors (loses the nice folded‑door look for
  single doors and corridors); keeping the swing‑only model (the fused‑room
  clutter the user reported); nudging the angle to avoid z‑fighting instead of a
  true 90° (user explicitly wanted flush/parallel).
- Doors drop rather than fade **on purpose** — a physical sink is a hook for
  future mechanics (e.g. retractable/rising walls).

### D8 — Reset restores the loaded world's starting walls
**Date:** 2026‑07‑11 · **Area:** hooks/useSandboxEngine

Reset now snapshots each loaded lesson/world's `rooms` (`baselineRef`, set in
`loadWorldPreset`) and restores them, in addition to resetting
parties/tick/runtime. **Why:** Reset means "restart the simulation," and
"when simulation starts" wall‑building re‑runs on the next tick — so it must
start from the lesson's *starting* shape, not from whatever walls the previous
run (or a previous lesson left mid‑run) had built. Before this, sealed/opened
walls persisted until a full page refresh. This bends no app logic: it mirrors
what re‑running `event_start` from tick 0 already implies. **Rejected:**
snapshotting on every render (would capture mid‑run walls); resetting only when
switching lessons (didn't cover Reset within a lesson, the actual complaint).

### D9 — Lesson 15 teaches guarded generation via an on‑path "gate room"
**Date:** 2026‑07‑11 · **Area:** teach/lessons · **Supersedes** the original L15

The capstone previously opened a side room in a corner the guest never visited,
so the guarded `open_area` had no visible consequence and read as random floating
doors. Redesigned so the guest's *only* route to the exit runs through a shut 2×2
gate room between two pre‑carved corridors; the learner's guarded
`every 3 ticks → if is_area_clear then open_area` opens that gate, and the guest
walks through it to the far corner. **Why:** the generation now visibly gates
progress, and the safety check (`is_area_clear`) has an obvious purpose — never
rebuild a wall on top of a guest standing in the room. **Trade‑off:** because the
gate is empty when the generator first fires, the safety check passes rather than
visibly blocking on this run; the story explains the check's purpose instead of
staging a near‑miss. **Rejected:** re‑sealing/randomising the room each cycle to
make it literally "rebuild" repeatedly (needs variables/reseal blocks beyond the
lesson's level); keeping the disconnected side room (the reported confusion).

### D10 — Grid cells are addressed 1‑indexed; geometry stays put
**Date:** 2026‑07‑11 · **Area:** engine + rendering + lessons

Valid cell coordinates now run **1..width / 1..height** (cell (1,1) is the first
cell), not 0..width‑1. A coordinate of 0 is out of range and every default that
used to be 0 is now 1 (`normalizeCell`, `cell_at`/`cellSlot`, party starts). The
grid's *size* and physical 3D layout are unchanged — only the numbering used to
address a cell shifts by +1.

**Why:** the non‑coder user found it confusing that a cell labelled "x:3 y:2" was
actually the 4th column / 3rd row. 1‑indexing makes the label match "3rd across,
2nd down".

**How to apply:** the engine (`pathfinding.js`, `interpreter.js`) genuinely runs
on 1‑based cells now (`inBounds` is `>=1 && <=width`, loops are `1..n`). The
delicate part is `Grid.jsx`: its wall‑segment geometry and wall **ids** are left
in their original 0‑based *boundary‑index* scheme (so `landingEdgeId` and the
door‑swing math didn't have to be re‑derived), and the coordinate translation
happens only at the seams — `roomToWorld` converts a 1‑based cell to the geometry
offset (`x - 1 - (width-1)/2`), wall loops emit 1‑based `.a/.b/.insideCell` cell
refs for room lookups, and `edgeIdBetween` subtracts 1 to map a moved party's
1‑based cells back onto the 0‑based wall‑id scheme. Result: cell (1,1) renders
exactly where (0,0) used to.

**Trade‑off:** `edgeIdBetween` is now explicitly coupled to Grid's internal
geometry indexing (it already existed only to match wall ids, so this is a
sharpening, not a new coupling). **Rejected:** re‑numbering the wall ids and
`landingEdgeId` to a 1‑based scheme (would have forced a risky re‑derivation of
the door‑landing arithmetic for no visible benefit); keeping the engine 0‑based
and shifting only display labels (the spec and the whole point require real
1‑based addressing, e.g. `cell_at`).

### D11 — Additive "or as close as possible" step block, rather than changing `next_step_toward`
**Date:** 2026‑07‑11 · **Area:** engine + blocks + lesson 15

Added `next_step_toward_or_closest` (and `findPathOrClosest`) instead of altering
`next_step_toward`. When no path reaches the target it advances toward the
reachable cell closest to the target and waits there, resuming normal
goal‑seeking automatically once a path opens.

**Why:** lessons 3–14 depend on `next_step_toward`'s "stay put when there's no
path" contract, so it must not regress. Lesson 15's guest sitting frozen at tick
0 (because the gate it must pass through starts shut) defeated the visual point
of the corridors, so the capstone needed the walk‑up‑and‑wait behavior — but as
a *new* block the learner opts into.

**Trade‑off:** "closest" is measured by **grid‑step (Manhattan) distance to the
target**, not BFS distance *along the traversable graph*. The lesson‑15 gate room
is walled off entirely, so there is no corridor from the guest's side to the
target at all — a graph‑distance‑to‑target metric would label every reachable
cell as infinitely far and the guest would never move. Manhattan proximity picks
the corridor cell nearest the obstruction (the gate threshold), which is exactly
the "how far can I actually get toward the goal" behavior wanted. The one step
handed back is still validated as free right now (won't walk onto an occupied or
reserved cell), same as `next_step_toward`. **Rejected:** a per‑tick special case
in the lesson script (the block should just handle it); BFS‑from‑target distance
labelling (breaks on a fully walled‑off target, the actual lesson‑15 case).

### D12 — Procedural room generation must be live/incremental and produce a branching room network, not a precomputed single corridor
**Date:** 2026‑07‑11 · **Area:** future teaching track (no code yet) · **Supersedes the "random-walk corridor" brainstorm from earlier this session**

Earlier the same day, a brainstorm proposed a `carve winding path from cellA to
cellB` BUILD block — a biased random walk computed once (likely at
`event_start`) that opens one squiggly corridor toward a target. The user
rejected this direction after drawing two comparison diagrams and clarified two
requirements that block reshapes the whole design:

1. **Generation must happen live, as the simulation runs — not precomputed.**
   The user's test case: leave the sim running for two hours. A path carved once
   at start (or even regenerated on a fixed schedule ahead of the guest) doesn't
   satisfy "the building grows as it's explored" — new area must come into
   existence during play, indefinitely, not from a single generation pass.
2. **The output must be a branching network of real rooms, not one corridor.**
   The rejected sketch was a single winding line from start to goal with no
   exploration. The wanted sketch: guests actually wander through generated
   rooms — side rooms, branches, dead ends, loops — more like a roguelike/cave
   level than a maze-solving path. A single-path corridor generator, however
   winding, cannot produce this; it needs a branching generation strategy
   (something closer to a growing tree / random room-and-corridor placement
   algorithm) plus a lesson pattern for guests *exploring* rather than
   beelining.

**Why this matters for design, not just this feature:** the user restated the
project's real endpoint here — this block-sandbox is a logic-teaching stage
toward an eventual fully-rendered theme-park simulation with real guest
behavior, not the final product. That reframes "is this lesson interesting" as
"does this teach a mechanic the final sim will actually need," which favors
live/incremental generation (the final sim needs it) over a one-shot corridor
(a teaching-only shortcut the final sim wouldn't use anyway).

**Not yet decided (open questions for the next design pass):** what
per-tick-affordable generation algorithm produces a branching room network
within this project's grid+wall-rule model (candidates worth evaluating: a
randomized growing-tree/backtracker that opens one new room-edge per some
number of ticks; a "frontier list" of half-open cells the generator picks from
next, biased to branch rather than always extend the newest cell); how a guest
"explores" branches instead of beelining straight to a known goal (this likely
needs its own sensing/behavior pattern, not just `next_step_toward`); and at
what grid size this starts looking good (the user's sketch is roughly a 9×7–12×9
room grid, well past the 5×5–6×6 grids current lessons use).

**Rejected:** the single biased-random-walk corridor block from the earlier
brainstorm (satisfies neither requirement); a first-person/game-engine pivot
(also raised and rejected earlier this session — see the discussion in the
conversation this decision comes from; not a persisted D-entry since no code or
design was committed to it, but worth remembering it was considered and set
aside in favor of extending the existing block-sandbox model).

### D13 — Lists share the scalar variable namespace; 1‑based indexing; live vars on the returned world
**Date:** 2026‑07‑11 · **Area:** blocks/interpreter + catalog + lessonRunner

Added a list value type and eight VARIABLES list blocks (`list_add`,
`list_length`, `list_item`, `list_contains`, `list_random`, `list_remove`,
`list_is_empty`, `list_clear`), a SENSING `random_direction` reporter, and
lesson 16 (`breadcrumb-trail`) that teaches lists in isolation. Groundwork for
the D12 live‑generation / guest‑exploration lessons (built separately later).

Three judgment calls:

1. **Lists live in the same name‑namespace as scalar variables.** A list block
   reads/writes `ctx.variables[name]` exactly like `set_var`/`get_var`; a name
   just holds whatever type was last written to it. **Why:** simplest, most
   Scratch‑like, and consistent with how `ctx.variables` already works —
   `runtime.variables` persistence across ticks comes for free. A new
   `coerceList(ctx, name)` treats a missing/non‑array value as `[]` (never
   throws), matching the file's coercion philosophy. **Rejected:** a separate
   list namespace (extra concept for a non‑coder, no real benefit; the shared
   store already round‑trips lists across ticks in the sandbox).

2. **List indexing is 1‑based** (`list_item` / `list_remove`), matching the grid's
   new 1‑indexed cells (D10) and friendlier for a beginner than 0‑based. Out‑of‑
   range pushes a `problem` and returns null / is a no‑op — never throws. Value
   membership (`list_contains`) reuses `valuesEqual`, so cells match by x/y (the
   expected "have I visited this room?" use).

3. **`runTick` exposes the live variable store as `world.variables` on the
   returned world**, so the two new lessonRunner checks (`list_length_at_least`,
   `list_contains_cell`) can inspect list contents without a new plumbing
   channel. It's the same object as `runtime.variables`. The budget‑abort early
   return still hands back the untouched input `world` (no `variables` key), so
   the "world unchanged on budget abort" invariant holds. **Rejected:** threading
   a separate `variables` prop through App → sandbox → lessonRunner (more surface
   for the same read); a check type that only inspects `used_block` (wouldn't
   prove the list actually filled — the lesson's whole point).

**Lesson‑16 mechanic:** a breadcrumb trail — Party 1 walks a 5×1 row; a pre‑placed
`if not <list contains position>` guard dedupes, the learner adds the one
`add <position> to list` block, and the trail deterministically fills to exactly
5. Chosen over an abstract list‑of‑numbers example to stay grid‑native (the app's
whole vocabulary is rooms/parties), and kept to a single learner gap like other
scaffolded lessons.

### D14 — Lessons 17 & 18 realise D12: growing‑tree generation + wandering guests, no new blocks
**Date:** 2026‑07‑11 · **Area:** teach/lessons + scripts/lessons.test · **Fulfils D12**

The two lessons D12 called for, built entirely from the wave‑1 list/
`random_direction` primitives plus existing build/sensing blocks — **no new
opaque "generate dungeon" block**, per the user's explicit rejection of that
approach. The algorithm is assembled from list/direction/wall primitives the way
lesson 15 assembles its gate logic.

**Lesson 17 "Growing a Dungeon" — the growing‑tree algorithm.** Chosen because it
is naturally incremental (one step every 2 ticks, forever — satisfies D12's
"leave it running for two hours") and naturally branching (D12's rejection of a
single corridor). Two lists: `visited` (all carved rooms) and `active` (the
frontier). Tuning constants and *why*:
- **Grid 10×10** — inside D12's 9×9–12×12 ask; big enough that branching reads as
  a spreading network, not a cramped blob.
- **`n=2` ticks per generation step** — fast enough to fill visibly, slow enough
  to *watch* it grow one doorway at a time (the whole point vs. a one‑shot pass).
- **`repeat 4` direction tries before giving up** — 4 covers all four directions
  with enough re‑rolls that a room with any open neighbour almost always finds it,
  while still retiring genuinely boxed‑in rooms from `active` promptly. Playtested
  (seeded node sim): growth stays steady and never stalls.
- **Random‑index frontier pick as the default** (`item (random 1..length) of
  active`), NOT newest‑cell. **Why:** D12 explicitly wants a branching room
  network over a winding corridor; random pick is Prim‑like/bushy, newest pick is
  depth‑first/corridor‑like. The hints call out swapping the random number for
  `length of list active` as a one‑block change to the corridor shape — the
  tinkering knob the user asked for. An ASCII render of both confirmed the visual
  difference (branchy forks+dead‑ends vs. long snaking corridors).
- **Off‑grid neighbour handling without an "is nothing?" block:** rebuild the
  chosen neighbour through `cell_at(cell_x(nb), cell_y(nb))`, so `neighbor_of`'s
  off‑grid `null` collapses to (1,1). Because the seed (1,1) is always on
  `visited`, the existing `not visited‑contains` guard rejects it — reusing an
  invariant instead of adding a sentinel/null‑check block. **Trade‑off:** relies
  on the seed always being (1,1) and always visited (both guaranteed here); a
  future lesson seeding elsewhere would need to adjust. **Rejected:** a bounds
  check via `cell_x`/`cell_y` comparisons (null coerces to (1,1), which is
  in‑bounds → false positive, would carve toward the corner).
- **Learner gap = the two `list_add` memory blocks** (record the new room in both
  lists). This is the conceptual heart of a frontier algorithm (remember what you
  carved, and where you can still grow from); `open_area` is pre‑placed since it
  was taught in L11/L15. Success keys on `list_length_at_least(visited, 15)`,
  which the gap gates (without it the frontier never grows past the seed).
  **Rejected** making `open_area` the gap: lists would still fill without it, so
  the checkable outcome wouldn't require the learner's block.

**Lesson 18 "Guests Who Explore" — wandering movement.** A per‑guest rule that
prefers unvisited neighbours and only falls back to goal‑seeking when none exist,
matching D12's "guests wander through side rooms" sketch.
- **Maze hand‑carved deterministically in `event_start`** (main hall + four side
  passages on 7×7), NOT dependent on lesson 17's live generator running
  concurrently — that combination is the D12 end‑vision but is deferred (see
  below). Hand‑carving guarantees branches for the exploration to have real
  choices.
- **Four near‑identical per‑direction `if` blocks** rather than adding a "for each
  direction" CONTROL block. **Why:** the repetition stayed readable and is a
  genuine teaching moment ("there's no loop over directions, so you check all
  four"), and *not* adding a block keeps the catalog/`catalog.test` expected‑list
  stable and avoids scope creep. The task permitted adding such a block at my
  judgment; I judged it unnecessary. **Revisit** if a later lesson needs
  per‑direction iteration again — at that point a small additive block earns its
  keep.
- **Learner gap = `add dest to myVisited`** after the move. Without it `myVisited`
  stays at the start room, every open neighbour always looks "new", the guest
  never exhausts local candidates, and it never falls back to the goal — so the
  gap gates both the exploration‑count and reach‑the‑exit checks. Fallback uses
  `next_step_toward_or_closest` (D11) so the guest still makes progress even if
  momentarily boxed.
- Borders are sealed (`reset_all_walls closed` first), so an off‑grid neighbour
  never passes the `is_wall_open` gate — the L17 reconstruct trick isn't needed
  here.

**Determinism for tests:** the interpreter's `random_*`/`list_random`/
`random_direction` use `Math.random`, so both lesson tests stub it with a small
seeded LCG (`withSeededRandom`) — the completed solutions pass all checks on a
fixed seed, and lesson 17's test additionally counts opened doorways to prove
walls actually carved (not just lists filled). **Rejected:** injecting a seedable
RNG into the interpreter (larger blast radius; a test‑local `Math.random` stub is
enough and touches nothing production).

**Lesson 19 (generate‑while‑exploring) not attempted.** Deliberately skipped to
land 17/18 cleanly and fully playtested, per the task's "do NOT let the stretch
compromise finishing 17/18." It remains the natural next step toward D12's
"building keeps growing as the guest explores it" end‑vision; whoever picks it up
should reuse lesson 15's `is_area_clear` safety guard so the live generator never
reshapes a wall onto the wandering guest.

### D15 — Lesson 19 realises D12's end‑vision: generation + exploration together, with a "both mechanisms are working" success check and NO safety guard
**Date:** 2026‑07‑11 · **Area:** teach/lessons + scripts/lessons.test · **Fulfils D12; revises the guard advice in D14's closing note**

Lesson 19 (`living-dungeon`, 12×12) runs lesson 17's live generator and lesson
18's wandering guest concurrently on one grid — the exact "leave it running for
two hours; new area generates while the guest explores it" test the user named as
the end‑vision. Two judgment calls:

**1. Success check for the first lesson with no natural finish line.** Every prior
lesson had a discrete "done" (reach the goal, fill a trail to N, grow to N rooms
once). A "leave it running indefinitely" scenario has none. I chose a
**both‑mechanisms‑active** check — `list_length_at_least(visited, 30)` (the maze
actually grew) AND `list_length_at_least(myVisited, 15)` (the guest actually
explored a good chunk of it) within a generous 120‑tick budget — over the
alternative of giving the guest a far goal room and checking arrival.

- **Why:** a goal‑arrival check is *stochastically fragile* here. The maze is a
  random growing tree; whether a path to a specific far corner exists by any
  given tick depends on the RNG, so "did the guest reach (12,12)" would pass on
  some seeds and fail on others within the same budget — a flaky success
  condition. The two list‑length checks, by contrast, are robust across every
  seed tested (worst case clears both by ~tick 100 of 120) and they directly
  encode what the lesson is actually demonstrating: *both machines are working
  together*, which is the whole point, rather than making the guest "finish"
  something an indefinitely‑running sim has no finish for.
- The guest is still given a goal (12,12) so its `next_step_toward_or_closest`
  fallback has a direction to drift when it runs out of fresh local rooms — this
  biases it to spread toward unexplored territory — but arrival is deliberately
  NOT a success condition.
- **How to apply (pattern for future indefinite lessons):** when a mechanic is
  meant to run forever, check that its *observable effects are accumulating*
  (list grew, N distinct things happened) within a budget, not that it reached a
  terminal state. Avoid success conditions whose truth depends on RNG landing a
  specific way inside the budget.
- **Rejected:** far‑goal arrival check (RNG‑fragile per above); a fixed high
  tick count with no list thresholds (wouldn't prove the guest's block was added
  — the maze grows regardless); requiring the guest to visit a *specific* room
  (same RNG fragility as goal arrival).

**2. No safety guard against generation trapping the guest — and it was never a
real risk here.** D14's closing note advised a future L19 "reuse lesson 15's
`is_area_clear` guard so the generator never reshapes a wall onto the guest." On
building it, that advice proved unnecessary **for this generator** and I
deliberately did not add the guard.

- **The finding:** lesson 17's generator only ever `open_area`s — it opens
  doorways and never closes or reshapes an existing wall. Opening a wall near the
  guest can only ever ADD a passage, never remove one, so there is no physical
  way for generation to trap, wall‑in, or shove the wandering guest. This is
  categorically safer than lesson 15's case, which needed `is_area_clear`
  precisely because it *rebuilt/closed* walls and could otherwise stamp one onto
  a party's cell. The guest's `candidates` list is also recomputed fresh every
  tick from its current position, so a maze that has strictly more open doors
  each tick is naturally handled (more or fewer candidates, never a stale/invalid
  one). Verified in a 5‑seed × 120‑tick sim: zero errors, guest never stuck,
  never illegally moved.
- **Why not add the guard anyway "to be safe":** over‑guarding would make the
  lesson's code busier than the concept requires and would teach a safety check
  that has no purpose in this configuration — the opposite of the clean
  single‑gap scaffolding the track uses. A guard should appear only where its
  absence causes a real failure.
- **Open concern for a future session (the load‑bearing part of this decision):**
  this "no guard needed" conclusion depends entirely on the generator being
  *open‑only*. **If any future lesson adds a generator that can CLOSE or RESHAPE
  existing walls** (e.g. a maze that re‑seals dead ends, a park that remodels
  itself, retractable/rising walls — D7 flagged the dropped‑door sink as a hook
  for exactly this), then generation *could* wall in or displace a guest, and
  that lesson WILL need lesson 15's `is_area_clear` guard (or equivalent) around
  the guest's cell before reshaping near it. Do not generalise L19's "no guard"
  to a close/reshape generator.
- **Rejected:** adding `is_area_clear` around the guest preemptively (over‑guard,
  no failure it prevents here); keeping D14's blanket "reuse the guard" advice
  (it's wrong for an open‑only generator — this entry corrects the scope of that
  note).

### D16 — Dungeon redesign: a rolling, recycling ROOM generator (supersedes D14/D15's growing‑tree maze); staged build‑up lessons; two new blocks
**Date:** 2026‑07‑12 · **Area:** blocks/interpreter + catalog + lessonRunner + teach/lessons + scripts/*.test · **Supersedes D14; narrows D15**

After play‑testing lessons 16–19, the user rejected the growing‑tree dungeon (D14/D15):
it "reads as a random maze generator, not a room generator" (it opened one 1×1 square at a
time at a random frontier spot), and lessons 17–19 handed him finished 12‑block machines with
five mystery variables he never built. He also flagged lesson 16's pre‑placed double‑negative
`if not (list contains …)` guard as unparseable, and that its payoff was invisible (the guest
zipped a 5×1 row in 3 ticks always saying "0" until solved), so it read as broken.

**New model (agreed over 3 Q&A rounds + two concept sketches from the user).** A **rolling,
recycling room generator**: each new room is generated FROM the previous one through a single
**gate**; once the guest steps into the new room, the room **behind seals shut** (all walls
closed → blank canvas) so the floor space recycles. A room may only be built into space that is
**blank (all walls closed)** or **flagged closing** (a guest is vacating) — never another
party's active room. Rooms are real multi‑tile shapes. The end‑vision (the user picked "full
multi‑party now") is many guest‑parties flowing through a floor that constantly re‑partitions
itself; the lessons build up to it.

**Decisions:**
- **Two new blocks, not an opaque "generate" block** (keeps D14's no‑opaque‑block principle):
  `seal_area` ("seal every wall from A to B" — closes every wall in a rectangle, the recycling
  counterpart of `open_area`) and `is_area_sealed` ("is every wall from A to B closed?" — the
  "blank canvas / buildable" test the user described). Everything else composes from existing
  blocks + lists.
- **Rooms are 2×2 blocks addressed arithmetic‑free** by composing `neighbour_of` (`roomFar =
  east of south of anchor`; `roomAt(dir) = dir of dir of anchor`), so a non‑coder can read the
  block tree. **Gates use `carve_corridor` between the two touching cells** — not a single
  `set_wall`, because `set_wall` opens only one side and `reset_all_walls(closed)` closes both
  (an edge is closed if *either* side is), so a one‑sided open can't reopen a fully‑sealed edge.
- **Guest moves toward its GOAL, not toward the newest room**, and the goal sits a few rooms
  short of the grid edge — so the generator opens the path just ahead and the guest settles at
  the goal with no boundary/off‑grid artifacts (validated in node). Goal is placed on the rooms'
  spine row so every shape includes it.
- **Staged pedagogy the user explicitly asked for:** each lesson's *starter program is the
  previous lesson's finished program*, enforced structurally via shared stage‑builders (NOT by
  copying logic between lessons). Arc: L16 lists (forward‑taught) → L17 generate next room +
  gate → L18 seal behind (`seal_area`) → L19 generalise into the rolling loop (`room`/`ahead`
  vars, `is_area_sealed`) → L20 a menu of shapes (`random 1‑3`, 2×2/hallway/L, spine kept open).
- **Two new lessonRunner success checks:** `area_open` (interior edges of a rectangle open — a
  room got stamped) and `area_sealed` (every wall closed — a room got recycled).
- **Verification:** every solved lesson passes all its success checks in node (shapes across 20
  RNG seeds); 212 unit tests pass; oxlint clean; browser play‑test shows the floor sealing red,
  a green open‑room window rolling east with the guest, and the room behind re‑sealing red.

**Deferred (open, pending a density check with the user):** L21 *Lead to the Exit* (direction
toward goal + a visible `wanderChance` coin‑flip replacing the user's "randomness variable" —
below the roll beeline, above it wander) and L22 *Many Guests* (multi‑party recycler: per‑party
state in **parallel lists indexed by party number** since variables are global; a `closingRooms`
list so a party builds into blank‑or‑closing space and waits otherwise). Both need robust
off‑grid/bounds handling (random directions near edges) and per‑party state, which materially
affect lesson block‑count — the exact "too many blocks" concern that started this. The approved
plan reserved this check‑in. The rolling model's **seal‑behind is a CLOSE/RESHAPE generator**,
so D15's "no guard needed" explicitly does NOT apply here — the buildable guard (`is_area_sealed`
/ the closing flag) is the safety mechanism, per D15's own load‑bearing warning.

**Rejected:** keeping the growing‑tree maze (user rejected as "a maze, not rooms"); an opaque
generate block (D14 principle); one‑`set_wall` gates (can't reopen a doubly‑sealed edge);
moving the guest toward the newest room (never settles at a goal); single room shape
(user picked a shape menu).

---

### D17 — A reversible "Show me the finished code" escape hatch, backed by first‑class Undo/Redo

**Context:** the learner (a total beginner) got stuck on Lesson 19 because its instructions leaned
on undefined in‑house slang ("the seed", "both corners", "the room helpers", "the window"). The
immediate fix is a rewrite (see TIMELINE 07‑12 later), but the deeper ask was a safety net: a way
to *see the finished answer* without losing the work‑in‑progress.

**Decision:**
- Add an optional `lesson.solutionProgram` and a **"Show me the finished code"** button that loads
  it into the workspace. Solutions are **the exact programs the test suite already verifies**, not
  freshly authored — so the answer shown is guaranteed to pass the lesson. Wired only for the
  dungeon lessons **16–20** (where a proven solved form exists / is cheap to lift); the button
  hides elsewhere rather than show an unverified or fabricated "answer".
- Make it reversible by giving the program **real Undo/Redo** (`useProgramHistory`: past/present/
  future reducer owned by App, the single source of truth the editor already reported edits to).
  Rapid slot edits coalesce into one undo step (450 ms window); discrete loads (starter/solution)
  force their own step and clear the redo stack. Buttons in the editor toolbar + Cmd/Ctrl+Z/​
  Shift+Z/​Ctrl+Y, suppressed while a text field is focused so native text‑undo still works.

**Why:** showing the answer is only safe pedagogy if the learner can get *their* version back with
one click — otherwise the button destroys their attempt. Undo/Redo was already a standing request,
so it doubles as a general editing safety net (mis‑drops, accidental Clear, deletions).

**Rejected:** authoring solutions for all 20 lessons now (unverified answers are worse than no
button — scope to lessons with a test‑proven solved form, extend on request); a one‑off
"restore my code" snapshot just for this button (a real history stack is more useful and was
already wanted); a confirm dialog before loading the solution (Undo makes it non‑destructive, so
a modal is friction the beginner doesn't need).

---

## Public repository

The complete source code, lessons, design docs, and test suite are now published at
**https://github.com/blakeschuwerk/Themepark-Queue** under the initial commit. The build includes:
- 20 lessons with verified solutions for lessons 16–20
- 85 block types across SENSING/MOTION/CONTROL/BUILD/VARIABLES/OPERATORS categories
- 214 passing unit tests (blocks, AST, editor state, interpreter, lessons, hints, narrator)
- Full `.claude/` project configuration (launch.json for the Vite dev server)
- Design documentation: BLOCKS_SPEC.md (language design), TIMELINE.md (build log),
  DECISIONS.md (rationale for key choices)
