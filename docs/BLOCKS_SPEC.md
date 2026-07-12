# Queue Brain — Block Logic Sandbox Specification

This document is the single source of truth for the rebuild of Themepark-queue from a
parameter dashboard into a Scratch-like block-programming sandbox with a built-in
teaching system. All coder agents build strictly to this spec. The user is a total
beginner to programming — every UX and API decision must serve learnability.

## 1. Vision

The user designs the routing "brain" of a dynamic theme-park queue by snapping
together visual blocks. The block program runs once per simulation tick and decides
how guest parties move through an N×M grid of rooms with dynamic walls. The 3D
viewport (existing React Three Fiber scene) visualizes the result in real time.

Two sacred constraints of the ride concept (they are MONITORED, not enforced,
so the user learns by seeing violations):
- **Isolation**: no two parties may ever occupy the same room.
- **No crossing**: no two parties may swap rooms head-on in the same tick.

## 2. Modes

- **Run**: program executes every `tickMs` milliseconds; agents animate smoothly
  between rooms over the tick duration.
- **Pause**: frozen.
- **Step**: execute exactly one tick, then show the execution trace (blocks that ran
  highlight in the editor; reporter blocks show the value they returned).
- **Strict toggle** (off by default = "learning mode"): when ON, moves that would
  violate the sacred constraints are converted to waits and flagged; when OFF the
  violation happens visibly and is flagged red in 3D + explained in the coach panel.

## 3. World model (mostly reuse existing code)

Reuse from `src/engine/pathfinding.js`: `roomKey`, `normalizeCell`, `DIRECTIONS`,
`WALL_RULES`, `ensureRooms`, `getWallRuleForEdge`, `canTraverse`, BFS (`findPath` —
export it). The old `planNextAgents` is REMOVED from the live path; its logic is
recreated as a loadable example block program.

World state shape (owned by the engine hook):

```js
{
  grid: { width, height, roomSize, gap, wallHeight, wallThickness },
  rooms: { "x,y": { x, y, label, tint, wallRules: {north,east,south,west} } },
  parties: [ { id, name, color, position: {x,y}, start: {x,y}, goal: {x,y}|null } ],
  tick: number,
}
```

Note: parties are simplified — no speed slider, no behavior dropdown. Their
brain is the user's block program. `goal` is an optional per-party cell set by
clicking a room in the viewport while that party is selected (and editable as
two number fields); blocks read it via `party goal`.

## 4. Block language

### 4.1 Value types
`number`, `boolean`, `cell` (`{x,y}` or `null` for invalid), `party` (party id
string), `direction` (`'north'|'east'|'south'|'west'`), `string`.

### 4.2 Program shape (AST)

```js
{
  version: 1,
  scripts: [ { id, hat: Block, body: Block[] } ]   // top-level stacks
}
Block = { id: string, type: string, inputs: { [slotName]: Literal | Block }, body?: Block[], elseBody?: Block[] }
Literal = { literal: true, value: any }
```

Block ids are unique nanoid-style strings. `src/blocks/ast.js` provides pure
helpers: `createBlock(type)`, `insertBlock`, `removeBlock`, `moveBlock`,
`setInput`, `findBlock`, `serialize/deserialize` (plain JSON), `validate`.

### 4.3 Block catalog (v1 — exact type ids)

Categories & editor colors: events `#f7c948`, control `#f2994a`, motion `#4cc9f0`,
sensing `#56ccf2`→use `#39c0c8`, operators `#7bd88f`, variables `#ff8fa3`,
walls `#c77dff`.

**Events (hats — a script must start with one):**
| type | label | semantics |
|---|---|---|
| `event_start` | `when simulation starts` | body runs once at tick 0 / on reset |
| `event_tick` | `every tick` | body runs every tick |

**Control (statements):**
| type | label | inputs / body |
|---|---|---|
| `for_each_party` | `for each party ▸` | body runs once per party in order; inside, `current party` refers to it |
| `if` | `if <cond> then` | inputs: `cond` (boolean); body |
| `if_else` | `if <cond> then … else …` | inputs: `cond`; body, elseBody |
| `repeat` | `repeat <n> times` | inputs: `n` (number); body |
| `stop_script` | `stop this script` | halts current script for this tick |

**Motion (statements):**
| type | label | semantics |
|---|---|---|
| `move_party` | `move <party> to <cell>` | registers a move intent for this tick (last intent per party wins) |
| `party_wait` | `make <party> wait` | explicit stay-put intent |
| `say` | `<party> says <string>` | floating text over the party in 3D for ~1 tick + console line |

**Sensing (reporters):**
| type | label | returns |
|---|---|---|
| `party_position` | `position of <party>` | cell |
| `party_goal` | `goal of <party>` | cell (or party's current position if no goal set) |
| `at_goal` | `<party> at goal?` | boolean |
| `current_party` | `current party` | party (only valid inside `for_each_party`; error hint otherwise) |
| `party_number` | `party # <n>` | party (1-indexed; null-ish → hint if out of range) |
| `party_count` | `number of parties` | number |
| `is_occupied` | `is <cell> occupied?` | boolean (any party there now) |
| `is_reserved` | `is <cell> reserved?` | boolean (see reservations) |
| `is_wall_open` | `is wall <direction> of <cell> open?` | boolean (closed rule ⇒ false; open/auto ⇒ true) |
| `neighbor_of` | `room <direction> of <cell>` | cell or null (out of bounds) |
| `next_step_toward` | `next free step for <party> toward <cell>` | cell: first step of BFS path avoiding closed walls, other parties' positions, and reserved cells; returns party's own position if no path. This is the "smart block" — lessons later teach what's inside it. |
| `next_step_toward_or_closest` | `next free step for <party> toward <cell> (or as close as possible)` | cell: like `next_step_toward`, but when no path reaches the target it steps toward the reachable cell closest to the target (grid‑step proximity) and waits there, rather than staying put; resumes normal routing once a path opens. |
| `distance_between` | `distance from <cell> to <cell>` | number (manhattan) |
| `cell_at` | `room at x:<n> y:<n>` | cell (grid cells are 1‑indexed: 1..width / 1..height, so (1,1) is the first cell) |
| `cell_x` / `cell_y` | `x of <cell>` / `y of <cell>` | number |
| `tick_number` | `tick number` | number |
| `random_number` | `random <n> to <n>` | number (integer) |
| `random_direction` | `random direction` | direction: one of north/east/south/west, uniform random |

**Operators (reporters):** `op_add`, `op_subtract`, `op_multiply`, `op_equals`,
`op_greater`, `op_less`, `op_and`, `op_or`, `op_not` — standard semantics.
`op_equals` on cells compares x and y.

**Variables:** `set_var` (`set <name> to <value>`), `change_var`
(`change <name> by <n>`), `get_var` (reporter). Variables are global to the
program, reset on sim reset, name chosen via a small text input on the block.
Values can be any type.

**Lists (a variable that holds many values — shared name-namespace with
scalars; a name simply holds whatever was last written to it):**
| type | label | kind | semantics |
|---|---|---|---|
| `list_add` | `add <value> to list <name>` | statement | appends `value`; creates an empty list first if the name isn't a list yet |
| `list_length` | `length of list <name>` | number | item count; 0 if not a list yet |
| `list_item` | `item <index> of list <name>` | reporter (any) | **1‑based**; out of range ⇒ pushes a problem and returns null |
| `list_contains` | `list <name> contains <value>?` | boolean | uses `valuesEqual` (works for numbers, strings, and cells by x/y) |
| `list_random` | `random item of list <name>` | reporter (any) | uniform random member; empty ⇒ problem + null |
| `list_remove` | `remove item <index> from list <name>` | statement | **1‑based**; removes and shifts; out of range ⇒ problem, no‑op |
| `list_is_empty` | `list <name> is empty?` | boolean | true if length 0 (or not a list yet) |
| `list_clear` | `clear list <name>` | statement | resets the name to an empty list |

**Walls (statements):**
| type | label | semantics |
|---|---|---|
| `set_wall` | `set wall <direction> of <cell> to <open/closed/auto>` | writes the room's wallRule (persists until changed) |
| `reserve_cell` | `reserve <cell>` | adds to the per-tick reservation set (cleared at start of every tick). Purely program-side bookkeeping read back by `is_reserved` — this is how the user implements collision avoidance themselves. |

### 4.4 Interpreter contract (`src/blocks/interpreter.js`)

`runTick(program, world, runtime) -> TickResult` — pure function, no React.

- `runtime` carries persistent variables and tick number; reservations reset each tick.
- Execution order: all `event_start` scripts (only when tick === 0), then all
  `event_tick` scripts top-to-bottom.
- **Op budget**: 20,000 block evaluations per tick. Exceeding it aborts the tick
  with `result.error = { kind: 'budget', blockId }` (hint engine explains
  "probably an infinite loop").
- **Move intents**: collected during execution; applied after the program finishes:
  1. Intent must be to the party's own cell (wait) or an adjacent cell with a
     non-closed wall between; invalid intents become waits + a `problems` entry.
  2. Rule monitor then checks applied positions: same-room collisions and head-on
     swaps produce `violations: [{kind:'collision'|'swap', partyIds, cell|edge}]`.
     In strict mode the offending later-indexed party is reverted to a wait instead.
- **Trace** (for step mode): `trace: [{ blockId, value? }]` in execution order,
  capped at 2,000 entries. Every executed statement gets an entry; reporters record
  their returned value (cells rendered as `(x, y)`).
- `TickResult = { world: nextWorld, moves, violations, problems, trace, sayings, error }`
  (`moves` shaped like the old engine's moves so the 3D door animation keeps working:
  `{ agentId/partyId, from, to, edgeId }`).
- Type mismatches never throw: coerce sensibly, record a `problems` entry
  `{ kind:'type', blockId, message }` — the coach surfaces these gently.

### 4.5 Narrator (`src/blocks/narrator.js`)

`narrate(program) -> string` — recursive English rendering with indentation, e.g.:

```
Every tick:
  For each party:
    If the next free step toward its goal is not reserved:
      Reserve that room, and move the party there.
    Otherwise: make the party wait.
```

Template per block type; unfilled slots read as "(empty)".

### 4.6 Example programs (`src/blocks/examplePrograms.js`)

At least: `simple-walker` (one party marches to its goal, no safety),
`polite-walker` (waits if next cell occupied), `reservation-brain` (full
recreation of the old MAPF logic: for each party, reserve the next free BFS step,
never enter reserved/occupied cells — the "answer key" for the final lesson).

## 5. Block editor UX (`src/editor/`)

Not a free-form 2D canvas — a **structured vertical script editor** with a Scratch
look. This is a deliberate simplification for buildability and learnability:

- **Palette** (left column of the workspace): blocks grouped by category with the
  colors above; each palette entry shows the block's shape and label. Clicking a
  palette block appends it to the end of the selected script (or creates a new
  script if it's a hat). Dragging from the palette into the script area inserts at
  the drop position.
- **Script area**: scripts render as vertical stacks of rounded blocks; C-blocks
  (`if`, `repeat`, `for_each_party`) nest their body visually inset. Statement
  reordering by pointer drag with a drop-indicator line between blocks. Reporters
  render as pill chips inside slots.
- **Slots**: clicking a slot opens the right editor — number input, dropdown
  (direction, wall state, party picker), or text input. A slot expecting a value
  also accepts a dropped/chosen reporter block (palette reporters can be dragged
  onto slots, replacing the literal). A small `×` on a nested reporter pops it out.
- **Block actions**: right-click (or a "…" hover button) → duplicate / delete /
  help. Delete also via drag back to the palette.
- **Trace highlight**: after a Step, blocks that executed get a glow; hovering a
  glowing reporter shows its last value in a tooltip. (Editor consumes the
  interpreter trace.)
- **Persistence**: current program autosaves to localStorage; a simple program
  library (name + save/load/delete, plus the example programs and lesson starters).
- Implementation: plain React + CSS, pointer events for drag (no external DnD lib).

## 6. Engine integration (`src/hooks/useSandboxEngine.js` rewrite + viewport)

- The tick interval calls `runTick` with the current program; applies `world`,
  stores `moves`, `violations`, `problems`, `trace`, `sayings`.
- Smooth motion: parties animate (lerp/ease) between room centers across the full
  tick duration (existing `Agent.jsx` lerp — verify smoothness at 500–3000ms ticks).
- 3D violation feedback: a room where a collision happened flashes red
  (emissive pulse ~1s); swap violations flash both rooms.
- `say` renders as a small floating `Text` above the party.
- Doors/walls keep the existing hinge animation, driven by `moves` edge ids and
  wall rules exactly as today.
- Party selection: clicking a party sphere selects it; then clicking a room sets
  that party's `goal` (shown as a flag/marker mesh in that room in the party color).
- Keep the room click → room designer (label, tint, wall rules) but simplified
  into the new sidebar.

## 7. Teaching system (`src/teach/`) — no network, no API

### 7.1 Lessons (`lessons.js`)
Each lesson: `{ id, title, story, instructions: string[], world, starterProgram,
success: Check[], hints: string[] }`. Success checks are declarative, evaluated
by a lesson runner each tick: `party_at(partyId, cell)`, `all_parties_at_goal`,
`no_violations`, `within_ticks(n)`, `used_block(type)`,
`list_length_at_least(name, n)`, `list_contains_cell(name, cell)`. The two
list checks read the live variable store, which `runTick` now exposes as
`world.variables` on the returned world (fallback: newest tick‑history entry).

Lesson track (minimum the first 6 fully working; aim for all 10):
1. **Hello, Party** — one party, one `every tick` + `move to neighbor east`. Teaches run/step, what a tick is.
2. **Walk the line** — reach the far wall; introduces `if` + `is_wall_open` (or watching a party grind into a wall and fixing it).
3. **Getting somewhere** — `next_step_toward` + `party_goal`; set a goal by clicking.
4. **If this, then that** — `if_else`, `is_occupied`, `party_wait`; a parked dummy party blocks the corridor.
5. **Two parties, one hallway** — first real collision; learn to check before moving.
6. **Reservations 101** — `reserve_cell` + `is_reserved` + `for_each_party`; the heart of the whole concept.
7. **The swap trap** — head-on swap violation; fix with reservation of your own cell.
8. **Open sesame** — wall blocks; route around a forced-closed wall.
9. **Zones** — variables + goals to send parties to areas in sequence.
10. **The full brain** — 4 parties, crossing goals, `no_violations` + `all_parties_at_goal` within 40 ticks. Completing it = you rebuilt the MAPF brain yourself.

Build & data track (added after the core 10):
11. **Big Rooms** — `open_area` fuses a 2×2 corner into one room.
12. **Hallways** — `carve_corridor` punches a doorway through a sealed line.
13. **Blank Canvas** — `reset_all_walls` (seal) then carve the one route you want.
14. **Sealed Rooms & Doors** — `close_border` + one `set_wall` door.
15. **A Park That Rebuilds Itself** — guarded live generation: `every n ticks → if is_area_clear then open_area` opens a gate room only when empty.
16. **Lists: Remembering Many Things** (`lists-basics`) — the list primitive, taught *forward*: the learner adds `list_add` first and watches the said length climb 1→6 (visible payoff), then sees it overshoot when the guest idles at the end, and fixes it by building the `if not list_contains` dedup guard themselves. 6×1 row. (Replaced the old pre‑placed double‑negative guard that read as "broken.")

**Dungeon track (Lessons 17–20+) — a rolling, recycling ROOM generator.** Replaces the old growing‑tree maze (D14/D15) after the user's feedback that it "reads as a random maze, not rooms" and handed him finished 12‑block machines he never built. New model (see D16): each new room is generated FROM the previous one through a single gate; once the guest enters it, the room behind seals shut (blank canvas) so space recycles. Rooms are real 2×2 blocks (arithmetic‑free via `neighbour_of` composition). Each lesson's starter program is the previous lesson's *finished* program (shared stage‑builders), so nothing arrives pre‑built. Two new blocks: `seal_area` (BUILD — close every wall in a rectangle, the recycling counterpart of `open_area`) and `is_area_sealed` (SENSING — "is this blank canvas?", every wall in a rectangle closed).
17. **Generate the Next Room** (`the-next-room`) — from a pre‑built seed room, learner `open_area`s the next 2×2 + a `carve_corridor` gate; guest walks in. 6×3.
18. **Seal the Room Behind** (`seal-behind`) — starter = L17 solved; learner adds `if is_area_clear → seal_area` so the seed room recycles once the guest leaves. Introduces `seal_area`.
19. **Keep It Rolling** (`keep-it-rolling`) — starter = L18 solved (fixed two rooms). Learner generalises it into the rolling window with a `room` anchor variable: each tick, if the guest has left `room` seal it and advance to `ahead`, else if `ahead` is `is_area_sealed` stamp it + gate; move toward the goal. Guest rolls the whole 12×3 floor, rooms sealing behind. Introduces `is_area_sealed`.
20. **A Menu of Room Shapes** (`a-menu-of-shapes`) — starter = L19 solved; learner replaces the single stamp with `random 1‑3` → three shapes (2×2 / hallway / L), each keeping the east‑west spine open so the guest always passes. Verified across 20 seeds.
21+. **Planned:** *Lead to the Exit* (direction toward the party's goal modulated by a visible `wanderChance` coin‑flip — explore‑vs‑exploit knob) and *Many Guests* (multi‑party recycler: per‑party state in parallel lists, a `closingRooms` flag so a party builds only into blank‑or‑closing space and waits otherwise). These need robust off‑grid/bounds handling and per‑party state; deferred pending a density check with the user (see D16).

### 7.2 Hint engine (`hints.js`)
Pure function of `(program, recentTickResults, lessonState) -> Hint[]` where
`Hint = { id, severity: 'info'|'warn'|'alert', message, blockId? }`. Rules (min):
- no script with a hat block → "Blocks only run inside an *every tick* script…"
- collision violation occurred → explain isolation + point toward reservations
- swap violation → explain the swap trap
- party hasn't moved in 10+ ticks while not at goal → stuck hints
- budget error → infinite-loop explanation pointing at the loop block
- `current_party` used outside `for_each_party`
- goal unreachable (BFS returns null) → "a closed wall may be sealing the route"
- type problems from the interpreter, phrased gently
Deduplicate per rule id; a hint fires once until its condition re-triggers after clearing.

### 7.3 Coach panel (`CoachPanel.jsx`)
One sidebar tab: current lesson (story, numbered instructions, success checklist
with live ✓s, "next lesson" on completion), live hints feed, and the
"Explain my program" button rendering the narrator output. Friendly, short
sentences, no jargon without a one-line definition.

### 7.4 Block reference (`ReferencePanel.jsx`)
Every catalog block has `docs: { blurb, example }` in the catalog itself; the
reference panel lists them by category; hovering any block in palette/scripts
shows the blurb as a tooltip.

## 8. App shell & layout (`App.jsx` rewrite)

Three-region layout:
- **Top left ~55% width**: 3D viewport with a slim toolbar (Run/Pause, Step,
  Reset, tick speed slider, strict-mode toggle, tick counter).
- **Right column ~45%**: the block workspace (palette + scripts) — this is the
  star of the app now, it gets the most space.
- **Bottom-left under the viewport**: tabbed panel — Coach (default) | Reference |
  World (grid size, parties add/remove/name/color/goal, room designer).
Dark theme consistent with the existing look. Everything resizes sanely ≥1280px.

## 9. File layout

```
src/
  blocks/    catalog.js  ast.js  interpreter.js  narrator.js  examplePrograms.js
  engine/    pathfinding.js (trimmed helpers + BFS)  rules.js (violation monitor)
  editor/    Workspace.jsx  Palette.jsx  ScriptView.jsx  BlockView.jsx  SlotEditor.jsx  editorState.js  editor.css
  teach/     lessons.js  hints.js  CoachPanel.jsx  ReferencePanel.jsx
  components/  SandboxViewport.jsx  Grid.jsx  Agent.jsx  (adapted)
  hooks/     useSandboxEngine.js (rewritten)
  App.jsx  App.css
scripts/   (node --test test files)
```

## 10. Testing

`npm test` runs `node --test scripts/*.test.mjs`. Pure-JS layers (ast, catalog
integrity, interpreter semantics incl. reservations/violations/budget/trace,
narrator, hints, lesson success checks) must be covered. UI verified by running
the dev server and driving the browser.
