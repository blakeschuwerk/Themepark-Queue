# Development Timeline

A running, chronological log of how **Queue Brain — Block Logic Sandbox**
(the Themepark‑queue project) has been built. Newest entries at the bottom of
each day. Paired with [`DECISIONS.md`](DECISIONS.md), which records *why* the
notable choices were made.

> This file was started on **2026‑07‑11**, after the initial build was already
> complete. Entries dated 07‑09/07‑10 are reconstructed from
> `orchestration_state.json`, `docs/BLOCKS_SPEC.md`, and the code itself, so
> they are milestone‑level rather than blow‑by‑blow. Everything from 07‑11
> onward is logged as it happens.

---

## 2026‑07‑09 — Project kickoff & core language

- Project reframed as a **Scratch‑like block sandbox** for programming the
  routing "brain" of a dynamic theme‑park queue. Full design captured in
  `docs/BLOCKS_SPEC.md`.
- Build run as a tiered orchestration (see `orchestration_state.json`):
  a planner/orchestrator laying out components, coder agents implementing them,
  debugger agents fixing failures. Five components scaffolded:
  - **C1 — block-core** (`src/blocks/`): catalog, AST helpers, the pure
    `runTick` interpreter, narrator, example programs, `engine/rules.js`, and a
    trimmed `engine/pathfinding.js` (BFS + wall helpers).
  - **C2 — block-editor** (`src/editor/`): palette, script view, block view,
    slot editing, drag/reorder, localStorage program library.
  - **C3 — engine-viewport** (`src/hooks/`, `src/components/`): the
    `useSandboxEngine` hook that owns world/sim state and drives the
    interpreter, plus the R3F 3D grid/agent rendering.
  - **C4 — teaching** (`src/teach/`): the 15‑lesson track, hint engine, Coach
    panel, Reference panel.
  - **C5 — shell-integration** (`src/App.jsx`): wires all four regions into the
    three‑pane app shell.
- **C1 coded + tested** — interpreter with move intents, reservations, the
  isolation/no‑swap rule monitor, op budget, and trace. `npm test` green.

## 2026‑07‑10 — UI, engine, teaching, integration

- **C3 engine-viewport coded + tested** — `useSandboxEngine` running ticks on an
  interval via "latest value" refs; 3D grid with hinged doors, room tiles,
  parties, compass labels.
- **C2 block-editor coded + tested** — full structured editor with autosave.
- **C4 teaching coded + tested** — 15 lessons from "Hello, Party" through the
  build track (Big Rooms → Hallways → Blank Canvas → Sealed Rooms → the
  self‑building park), declarative success checks, and hints.
- **C5 shell-integration coded + tested** — App shell live: toolbar
  (Run/Step/Reset/speed/strict), viewport, Coach/Reference/World tabs, and the
  block workspace, sharing one `program` between editor, engine, and coach.

## 2026‑07‑11 — Door visuals, reset correctness, lesson 15 rework

First session logged live in this file. Four issues raised from play‑testing
screenshots, all fixed and re‑play‑tested in the browser.

- **Doors now hinge to exactly 90°.** `OPEN_ANGLE` was `π · 0.48` (~86°), which
  left every open door skewed and never flush with the wall it should align to.
  Changed to `π / 2`. (`src/components/Grid.jsx`)
- **Doors drop into the floor instead of clogging a fused room.** When a door
  swings open onto an edge that is *itself* an open passage (e.g. the four
  inner doors of a fused big room), letting it swing just plants a leaf across
  the open space and makes it read as still‑blocked. Such doors now sink
  straight down through the floor and vanish (staying logically open), while
  doors that fold flush against a standing wall keep swinging 90° as before.
  New `landingEdgeId` helper computes which edge a door lands on; a door drops
  iff that edge is open. Verified against the live three.js scene (dropped
  leaves sit at `y ≈ −1.08`, below the floor). (`src/components/Grid.jsx`)
- **Reset now restores the loaded lesson's starting walls.** Previously Reset
  reset parties/tick/runtime but left `rooms` untouched, so walls built by a
  run — or left over when switching lessons while a sim was mid‑flight — stuck
  around until a full page refresh. `useSandboxEngine` now snapshots each
  loaded world's rooms (`baselineRef`) and Reset restores them, so restarting
  the sim truly restarts from the lesson's starting shape and re‑runs
  "when simulation starts". (`src/hooks/useSandboxEngine.js`)
- **Lesson 15 ("A Park That Rebuilds Itself") redesigned.** The old version
  carved a straight top‑row corridor to the exit and opened a side room in an
  unused corner — the generated room was disconnected from the guest's path, so
  the opening looked like meaningless doors floating in a sealed floor, and it
  only opened once (never visibly "rebuilding"). Rebuilt as a **gate room**:
  the floor is sealed and two corridors are carved that stop on opposite
  corners of a shut 2×2 room (x:2 y:2 → x:3 y:3); the learner's guarded
  `every 3 ticks → if is_area_clear then open_area` opens that gate so the guest
  can pass through to the far corner (x:5 y:5). Now the generation visibly gates
  progress. Story, instructions, world, starter program, success checks, and the
  lessons test were updated. Deterministic sim confirms the guest arrives at
  **tick 11** (budget 20). (`src/teach/lessons.js`, `scripts/lessons.test.mjs`)
- `npm run lint` clean; `npm test` 168/168 green.

## 2026‑07‑11 (later) — 1‑indexed grid, number‑input fixes, closest‑approach block

A second 07‑11 session, four changes:

- **Number inputs no longer trap a leading zero, and click‑to‑replace works.**
  `WorldPanel.jsx`'s fully‑controlled numeric fields snapped back to "0" the
  instant you backspaced them, so you could never empty the box to type over it.
  Rewrote `NumberField` to use the same focused‑string‑buffer pattern
  `SlotEditor`'s `NumberLiteralEditor` already used (empty allowed while
  focused; blur reverts to the last committed value, no data loss). Added
  `onFocus={e => e.target.select()}` to both `NumberField` and
  `NumberLiteralEditor` so the first keystroke overwrites a default instead of
  appending. Verified in‑browser: typing "8" over "5" gives 8 (not 58); the box
  can be emptied while focused and reverts to its committed value on blur.
  (`src/components/WorldPanel.jsx`, `src/editor/SlotEditor.jsx`)
- **Grid coordinates are now 1‑indexed.** Valid cell coordinates run 1..width /
  1..height instead of 0..width‑1 — cell (1,1) is the first cell — so a label
  like "x:3 y:2" now matches the intuitive "3rd column, 2nd row". The grid's
  physical size and 3D layout are unchanged; only the addressing shifted +1.
  Touched the engine (`normalizeCell`, `ensureRooms`, `roomsArray`, `inBounds`,
  `edgeIdBetween` in `pathfinding.js`; `inBounds`/`normalizeRect`/corridor
  clamps/`coerceCell` fallback in `interpreter.js`), the hooks
  (`engineHelpers.js` first‑free‑cell + default goal; `useSandboxEngine.js`
  initial selected room `'1,1'`), rendering (`Grid.jsx` `roomToWorld` converts
  1‑based → geometry; wall/post loops keep 0‑based geometry indices and wall ids
  but emit 1‑based cell refs for room lookups; `edgeIdBetween` converts back down
  so wall ids and `landingEdgeId` stay untouched), the catalog (`cell_at` and
  `cellSlot` defaults 0 → 1), and every lesson coordinate + instruction/hint
  string in `lessons.js` (widths/heights, which are cell counts, deliberately
  left unchanged). Verified in‑browser: default selected room reads "Cell 1, 1"
  and lesson 1's party reads "Current 1, 2" / Start X 1 / Goal X 5.
- **New `next_step_toward_or_closest` block.** Additive sensing block, same slot
  shape as `next_step_toward`, that never freezes: when no path reaches the
  target it steps toward the reachable cell closest to the target (grid‑step /
  Manhattan proximity, so it still works when the target is walled off entirely),
  waiting at the last free cell until a path opens. Backed by a new
  `findPathOrClosest` in `pathfinding.js`. `next_step_toward`'s stay‑put contract
  is untouched (lessons 3–14 unaffected).
- **Lesson 15 uses the new block.** Its tick script now routes with
  `next_step_toward_or_closest`, so the guest visibly walks up to the shut gate
  room (x:3 y:3) and waits at the threshold from tick 0 instead of sitting frozen
  at the start; once the learner's guarded `open_area` opens the gate, the same
  block walks it the rest of the way to the exit (x:6 y:6). Deterministic sim
  confirms arrival at tick 10 (budget 20); the unsolved starter parks the guest
  at x:3 y:3 and holds.
- Test suites updated for the coordinate shift and the new block (interpreter,
  lessons, examplePrograms, engineHook, hints, catalog, ast, editorState). Added
  three unit tests for the new block (clear path ≡ `next_step_toward`; no path →
  advances toward closest; occupied/reserved cell still respected).
  `npm run lint` clean; `npm test` 171/171 green.

## 2026‑07‑11 (evening) — Documentation skill, and the real endgame clarified

- **Added `SKILL.md`** at the repo root: a standing documentation-discipline skill
  (modeled on Beaver 4.0's) that requires every future session to append to
  `TIMELINE.md` (always) and `DECISIONS.md` (when a judgment call was made) before
  ending a turn that changed code or design — including work done by spawned
  subagents. This session is the first to follow it.
- **The user pushed back on the "random winding corridor" brainstorm from earlier
  today** and clarified the actual long-term vision: this block-sandbox is explicitly
  a *logic-learning stage*, not the final product — the real endpoint is a fully
  rendered theme-park simulation with proper guest behavior. Two concrete
  corrections to the earlier brainstorm:
  1. **Generation must be live, not precomputed.** If a simulation runs for hours,
     new areas must generate as the sim plays, not be laid out once at
     `event_start`. A single "carve a winding path at start" block/lesson does not
     satisfy this.
  2. **The shape is real branching rooms, not one squiggly corridor.** The user drew
     two comparison diagrams: a single winding line to an endpoint (rejected — no
     exploration) versus a network of generated rooms that guests actually wander
     through, with side rooms, dead ends, and loops (the actual goal). See
     `docs/DECISIONS.md` D12 for the corrected design direction.
- No code changed this entry — this is a scope/vision correction, logged so a future
  session doesn't re-propose the rejected single-corridor approach.

## 2026‑07‑11 (later) — List value type + list blocks, `random direction`, lesson 16

Groundwork for the two upcoming generation/exploration lessons (D12): the block
language can now remember a growing collection, not just single scalars.

- **A variable can now hold a JS array (a "list").** Lists share the same
  name‑namespace as scalar variables (`ctx.variables[name]` holds whatever type
  was last written) — see D13. A new `coerceList(ctx, name)` helper reads the
  array at a name, treating a missing/non‑array value as `[]` (never throws),
  matching the file's coercion philosophy. (`src/blocks/interpreter.js`)
- **Eight new VARIABLES list blocks** (exact type‑ids / labels):
  - `list_add` — `add {value} to list {name}` (statement; appends, creating an
    empty list first if needed)
  - `list_length` — `length of list {name}` (number; 0 if not a list yet)
  - `list_item` — `item {index} of list {name}` (reporter, **1‑based**; out of
    range ⇒ problem + null)
  - `list_contains` — `list {name} contains {value}?` (boolean; uses
    `valuesEqual`, so cells match by x/y)
  - `list_random` — `random item of list {name}` (reporter; empty ⇒ problem +
    null)
  - `list_remove` — `remove item {index} from list {name}` (statement, **1‑based**;
    out of range ⇒ problem, no‑op)
  - `list_is_empty` — `list {name} is empty?` (boolean)
  - `list_clear` — `clear list {name}` (statement)
  Each has a plain‑English `docs.blurb`. (`src/blocks/catalog.js`,
  `src/blocks/interpreter.js`)
- **New SENSING block `random_direction`** — `random direction`, returns one of
  north/east/south/west uniformly at random (so a future lesson can pick a random
  neighbour without a lookup table). Returns type `direction`, no slots.
- **`runTick` now exposes the live variable store** as `world.variables` on the
  returned world (same object as `runtime.variables`). Lets success checks /
  the coach inspect list contents without a new channel. The budget‑abort early
  return still hands back the untouched input `world` (no `variables` key), so
  the "world unchanged on budget abort" test still holds.
- **Two new lessonRunner check types** — `list_length_at_least(name, n)` and
  `list_contains_cell(name, cell)` — read the variable store off `world.variables`
  (fallback: newest tick‑history entry's world). (`src/teach/lessonRunner.js`)
- **Lesson 16 "Lists: Remembering Many Things"** (id `breadcrumb-trail`). Party 1
  walks a 5×1 row toward the far end; each tick a pre‑placed `if not <list trail
  contains position>` guards a breadcrumb drop, a `say` shows the trail length,
  and the learner fills the one gap: `add <position> to list <trail>`. Success:
  used `list_add`, trail contains the start room, trail length ≥ 5, party reaches
  x:5, within 12 ticks. Deterministic sim fills the trail to exactly 5 (contains‑
  guard dedupes) and the party arrives well inside budget. (`src/teach/lessons.js`)
- **Tests:** 14 new interpreter unit tests (add/length/item/contains/random/
  remove/clear, empty‑list edges, cross‑tick persistence with one runtime, the
  `world.variables` exposure, and `random_direction`), catalog `expected` list +
  count updated, lesson‑count test 15→16, and two lesson‑16 tests (completed
  solution passes all checks; unsolved starter leaves the trail empty).
  `npm test` 189/189 green; `npm run lint` clean. Play‑tested in‑browser: lesson
  16 loads with its story + 5‑item checklist, and the palette renders all eight
  list blocks plus `random direction` with no console errors.

## 2026‑07‑11 (later) — Lessons 17 & 18: live generation + guest exploration (D12)

The two D12 lessons, built on the wave‑1 list/`random_direction` primitives. No
new blocks — both assemble their algorithm from existing primitives (per the
user's explicit "build it, don't call one opaque generate block" requirement).

- **Lesson 17 "Growing a Dungeon"** (`id: growing-dungeon`, 10×10 grid). The
  classic **growing‑tree** maze algorithm, live and incremental. `event_start`
  seals the floor (`reset_all_walls closed`) and seeds room (1,1) into two list
  variables: `visited` (every carved room) and `active` (the frontier — carved
  rooms that might still have an uncarved neighbour). An `event_every_n_ticks`
  (n=2) step: guard on `not list_is_empty(active)` → pick a frontier room by
  **random index** (`item (random 1..length) of active` — the branchy, Prim‑like
  default) → `repeat 4` tries of `random_direction` + `neighbor_of`, and for the
  first neighbour NOT in `visited`, `open_area` a doorway into it and record it in
  both lists → if nothing grew this round, `list_remove` the room from `active`
  (permanent dead end, so growth never stalls). The **learner's gap** is the two
  `list_add` memory blocks (record the new room in `visited` + `active`); without
  them the frontier never grows past the seed and only doors around (1,1) open.
  Off‑grid neighbours are handled by rebuilding the neighbour through
  `cell_at(cell_x(nb), cell_y(nb))` so a null collapses to (1,1), which is always
  `visited` and thus rejected by the guard — no "is it nothing?" block needed.
  Success: `used_block list_add` + `list_length_at_least(visited, 15)` within 80
  ticks. **Verified** via a seeded‑`Math.random` node sim across seeds: visited
  grows steadily (≈17–22 rooms by tick 40) and open doorways ≈ room count (a
  spanning tree). An ASCII render of the final maze confirms a **branching
  network with forks and dead ends** for the random default, vs. long winding
  **corridors** when the pick is swapped to `length of active` (depth‑first) —
  the documented tinkering knob, called out in the hints.
- **Lesson 18 "Guests Who Explore"** (`id: exploring-guests`, 7×7 grid). A
  per‑guest movement rule that prefers stepping into unvisited rooms and only
  beelines once nothing new is nearby. The maze is hand‑carved deterministically
  in `event_start` (seal, then a main hall x:1→7 y:4 with four side passages), so
  branches are guaranteed without depending on lesson 17. Each `event_tick`:
  `clear list candidates`; then **four near‑identical per‑direction `if`s** (no
  "for each direction" block was added — see D14) that add an open, not‑yet‑
  `myVisited` neighbour to `candidates`; then `if candidates not empty` → pick
  `list_random` and move there (learner adds the `add dest to myVisited` block —
  the gap), else fall back to `next_step_toward_or_closest` toward the goal.
  Borders are sealed so an off‑grid neighbour never passes the `is_wall_open`
  gate — no reconstruct trick needed here. Success: `used_block list_add` +
  `list_length_at_least(myVisited, 10)` + `party_at(exit)` within 45 ticks.
  **Verified** via seeded node sim across 5 seeds: the guest detours through side
  rooms (visits 13–19 distinct rooms vs. 7 on the straight line) and reaches the
  exit by tick 18–30, then holds at the goal.
- Appended both after lesson 16; `LESSONS.length` 16→18; two deterministic
  completed‑solution tests + two unsolved‑starter tests added (seeded LCG stubs
  `Math.random`; lesson 17's test also asserts real doorways opened, not just
  lists filled). Updated the lesson‑count assertion and BLOCKS_SPEC §7.1 lesson
  table. `npm test` 201/201 green; `npm run lint` clean. App confirmed loading
  both lessons in the lesson list (browser 3D canvas is unreliable in this
  embedded env, so the branching/exploration bar was met via the deterministic
  sims + ASCII maze render, the same node‑script approach used for lesson 15).
  Lesson 19 (concurrent generate‑while‑exploring) not attempted — kept scope to
  landing 17/18 cleanly (see D14).

## 2026‑07‑11 (later) — Lesson 19: generation + exploration running together (D12 capstone)

The end‑vision test case from D12 ("leave the sim running for two hours — new
area generates as it plays, and the guest explores it, not a fixed maze"), built
by running lessons 17 and 18 concurrently on one grid. No new blocks.

- **Lesson 19 "Explore a Growing Dungeon"** (`id: living-dungeon`, 12×12 grid).
  Lesson 17's live growing‑tree generator (`event_start` seeds (1,1) into
  `visited`/`active`; `event_every_n_ticks` n=2 carves one room per step) and
  lesson 18's wandering guest (`event_tick`, lists `myVisited`/`candidates`) run
  side by side. The two scripts share no list names, so they run completely
  independently — confirmed by both the interpreter's fire order (`event_start`
  → all `event_tick` → all `event_every_n_ticks` each `runTick`) and the sim.
  The generator is pre‑built (the learner completed it in L17); the **single
  learner gap** is the guest's `add dest to myVisited` block, exactly as in L18.
- **Success check (first lesson with no discrete finish line):** `used_block
  list_add` + `list_length_at_least(visited, 30)` (maze grew) + `list_length_at_least(myVisited, 15)`
  (guest explored) within 120 ticks. No goal‑arrival check — see D15 for why.
- **Verified** via a seeded‑`Math.random` node sim across 5 seeds (7/3/42/99/1234)
  to 120 ticks: maze `visited` climbs steadily to **45–57 rooms** and never
  stalls (frontier `active` stays 16–32, never empties); guest `myVisited` climbs
  to **17–24 distinct rooms** and the guest keeps moving (no oscillation/stall);
  zero interpreter errors across all 600 ticks. Growth is roughly linear‑then‑
  slightly‑decelerating as the grid fills — both curves are still rising at t120.
  Thresholds (visited≥30, myVisited≥15, 120 ticks) clear the worst seed by ~t100,
  a comfortable margin.
- **Generation never traps the guest — no guard needed.** Because the generator
  only ever `open_area`s (never closes/reshapes a wall), opening near the guest
  can only ADD a passage, never remove one, so a guest is physically impossible
  to trap. The guest's `candidates` list is rebuilt fresh every tick from its
  current position, so a maze with more open doors each tick is naturally fine.
  Confirmed in the sim; lesson 15's `is_area_clear` guard was deliberately NOT
  added (would be over‑guarding). See D15.
- Appended after lesson 18; `LESSONS.length` 18→19; two deterministic tests added
  (multi‑seed completed‑solution proving both mechanisms + real carved doorways;
  unsolved‑starter proving the maze still grows but `myVisited` stays tiny so the
  lesson is incomplete). Updated the lesson‑count assertion (18→19) and
  BLOCKS_SPEC §7.1 lesson table. `npm test` **207/207** green; `npm run lint`
  clean. Browser‑loaded: lesson 19 appears as #19, Coach shows the story +
  4‑item checklist, no console errors (3D canvas unreliable in this embedded
  env as before, so the growth/exploration bar was met via the deterministic
  multi‑seed sim).

## 2026‑07‑12 — Dungeon redesign: rolling recycling room generator + staged build‑up (supersedes growing‑tree)

After the user play‑tested lessons 16–19 and reported them poorly designed (the "dungeon" read
as a random maze not rooms; the late lessons handed him finished 12‑block machines he never
built; lesson 16's pre‑placed double‑negative guard read as broken), we redesigned the dungeon
track. Full rationale in `docs/DECISIONS.md` D16.

- **Two new blocks:** `seal_area` (BUILD — close every wall in a rectangle; recycling counterpart
  of `open_area`) and `is_area_sealed` (SENSING — every wall in a rectangle closed = blank
  canvas). Added to `interpreter.js`, `catalog.js`, and the `catalog.test.mjs` expected list.
- **Two new success checks** in `lessonRunner.js`: `area_open` (a room got stamped) and
  `area_sealed` (a room got recycled).
- **Lesson 16 rewritten** (`breadcrumb-trail` → `lists-basics`): learner adds `list_add` first
  and watches the said length climb, then builds the dedup guard themselves — forward, not
  pre‑placed. Fixes the "no numbers ever showed / couldn't complete it" report.
- **Lessons 17–19 (growing‑tree maze) replaced** by a staged rolling **room** generator, each
  lesson's starter = the previous lesson's finished program (shared stage‑builders): L17
  `the-next-room` (generate a room + gate), L18 `seal-behind` (recycle the room behind), L19
  `keep-it-rolling` (generalise into the rolling window with a `room` anchor variable), L20
  `a-menu-of-shapes` (random 2×2/hallway/L). Now 20 lessons.
- **Verified:** every solved lesson passes its success checks in node (shapes across 20 seeds);
  `npm test` 212/212; `npm run lint` clean; browser play‑test shows the floor sealing red and a
  green open‑room window rolling east with the guest, the room behind re‑sealing.
- **Deferred for a density check with the user:** L21 *Lead to the Exit* (direction toward goal +
  a visible `wanderChance` coin‑flip) and L22 *Many Guests* (multi‑party recycler with a
  `closingRooms` flag and per‑party parallel‑list state). These add off‑grid/bounds handling and
  per‑party state that materially raise block‑count — the exact concern that started this — so we
  align on them before building (the approved plan reserved this check‑in).

### Environment note
Mid‑session the working‑directory link `~/Documents/Themepark-queue` broke and was replaced by an
empty dir (stray `.vite` cache only). The real repo is `~/Themepark-queue` (git, all source);
no data was lost — edits followed through to the real files. Work continued against
`~/Themepark-queue`.

## 2026‑07‑12 (later) — Lesson 19 rewrite, "Show finished code" button, and Undo/Redo

Prompted by a report that Lesson 19's instructions were unreadable ("I don't know what the seed
is, the corners are, what the room helpers are").

- **Lesson 19 (`keep-it-rolling`) instructions rewritten** from 5 dense steps into ~11 plain
  ones. Killed the jargon: "seed / corners / room helpers / window" now spelled out as
  "the starting room / the two boxes in the open‑room block / the SENSING 'room … of …' blocks /
  the two halves of the if‑else". Each block is named by its exact on‑screen label and its palette
  colour, and `room east of ( room south of ( room ) )` is explained once as "step one down then
  one right → the opposite corner of the 2×2". Hints reworded to match.
- **Lesson 20 (`a-menu-of-shapes`) de‑jargoned** too (removed "stamp", "anchor row", "guarded by",
  "far corner"), same voice as L19.
- **"Show me the finished code" button** (Coach panel): loads the lesson's worked solution into the
  workspace. New optional `lesson.solutionProgram` field wired for the dungeon lessons **16–20**
  (each is the exact program the test suite already proves completes the lesson; L16 & L20 solved
  forms added, L17→L18‑starter, L18/L19 reuse existing solved consts). Button hides on lessons
  without a stored solution.
- **Undo / Redo** (long‑standing request): new `useProgramHistory` hook owns the program with a
  past/future stack (coalesces rapid slot edits into one step; discrete loads — starter/solution —
  are their own step). Buttons live in the editor toolbar under a "History" group; Cmd/Ctrl+Z /
  Shift+Z / Ctrl+Y shortcuts too, suppressed while typing in a field. So "Show finished code" is
  fully reversible — one Undo restores the learner's own work‑in‑progress.
- **Verified:** all wired solutions complete their lessons in node (L20 across 25 RNG draws);
  `npm test` 214/214; `npm run lint` clean; browser play‑test confirmed the button swaps in the
  solution and Undo/Redo round‑trips it back and forth with correct enabled/disabled states and no
  console errors.
- **Public repository:** initial commit pushed to **https://github.com/blakeschuwerk/Themepark-Queue**.
  Project is now in version control with full source, 20 lessons, 85 block types, 214 tests, and
  design documentation. `.claude/launch.json` configured for `npm run dev` preview (Vite on port
  5173, autoPort enabled).
