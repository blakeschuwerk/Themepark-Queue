// The lesson track (BLOCKS_SPEC.md §7.1). Each lesson bundles a story, a
// tiny world, a starter program (a real, valid AST built with ast.js), a
// list of declarative success checks, and hints. Pure data + small builder
// functions — no React, no DOM.

import { createBlock, createProgram, createScript } from '../blocks/ast.js'
import { ensureRooms } from '../engine/pathfinding.js'

function lit(value) {
  return { literal: true, value }
}

/** Builds a block of `type` from its catalog defaults, then overrides the
 * given input slots (values must already be `lit(...)` or nested `b(...)`
 * blocks) and/or its body/elseBody. Mirrors examplePrograms.js's helper. */
function b(type, inputs = {}, extra = {}) {
  const block = createBlock(type)
  for (const [key, value] of Object.entries(inputs)) {
    block.inputs[key] = value
  }
  if (extra.body) block.body = extra.body
  if (extra.elseBody) block.elseBody = extra.elseBody
  return block
}

function tickScript(body) {
  return createProgram([createScript('event_tick', body)])
}

/** Builds a small world: a `width`x`height` grid, plain default rooms
 * (optionally patched by `roomOverrides`, a map of "x,y" -> partial room),
 * and a list of parties (id auto-assigned `p1`, `p2`, ...). */
function world({ width, height, parties, roomOverrides = {} }) {
  const grid = { width, height, roomSize: 1, gap: 0.08, wallHeight: 0.78, wallThickness: 0.06 }
  let rooms = ensureRooms(width, height, {})

  for (const [key, patch] of Object.entries(roomOverrides)) {
    const existing = rooms[key]
    if (!existing) continue
    rooms[key] = {
      ...existing,
      ...patch,
      wallRules: { ...existing.wallRules, ...(patch.wallRules ?? {}) },
    }
  }

  const builtParties = parties.map((p, index) => ({
    id: p.id ?? `p${index + 1}`,
    name: p.name ?? `Party ${index + 1}`,
    color: p.color ?? '#4cc9f0',
    position: p.start,
    start: p.start,
    goal: p.goal ?? null,
  }))

  return { grid, rooms, parties: builtParties, tick: 0 }
}

const firstParty = () => b('party_number', { n: lit(1) })
const posOf = (party = firstParty()) => b('party_position', { party })
const goalOf = (party = firstParty()) => b('party_goal', { party })

// ---------------------------------------------------------------------------
// Lesson 1 — Hello, Party
// ---------------------------------------------------------------------------

const lesson1 = {
  id: 'hello-party',
  title: 'Hello, Party',
  story:
    "Meet your first park guest! A program only does something once it starts running. Press Run (or Step) and watch what happens.",
  instructions: [
    'Find the yellow "every tick" block already in your workspace. Everything you place inside it runs once each tick (one step of the simulation, like one frame of a movie).',
    'In the palette on the left, open the MOTION group and click "move party to cell". It drops inside "every tick".',
    'In that block\'s party slot, open the dropdown and simply choose "Party 1" (no extra block needed).',
    'In the room slot, click the green "choose a room ▾" button and pick "room … of …". Set its direction dropdown to "east".',
    'That "room … of …" block has its own room slot — click ITS "choose a room ▾" button and pick "position of …", then set its party dropdown to "Party 1". It now reads: room east of position of Party 1.',
    'Press Run (or tap Step a few times) and watch Party 1 walk east to the far wall.',
  ],
  world: world({
    width: 5,
    height: 3,
    parties: [{ start: { x: 1, y: 2 }, goal: { x: 5, y: 2 } }],
  }),
  starterProgram: tickScript([]),
  success: [
    { type: 'used_block', blockType: 'move_party', label: 'Use a "move party to" block' },
    { type: 'party_at', partyId: 'p1', cell: { x: 5, y: 2 }, label: 'Party 1 reaches the far wall' },
  ],
  hints: [
    'Where to find each block: "every tick" is in EVENTS · "move party to cell" is in MOTION · "room … of …" and "position of …" are both in SENSING.',
    'To put a block inside a slot, click that slot\'s green picker button — it reads "choose a room ▾" for room slots, "choose a check ▾" for yes/no slots, or "＋ block ▾" otherwise — and pick from the list (or drag a block from the palette straight onto the slot).',
    'The party slots are simple dropdowns — just choose "Party 1", you do not need a separate party block.',
    'Final shape: every tick → move Party 1 to ( room east of ( position of Party 1 ) ).',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 2 — Walk the line
// ---------------------------------------------------------------------------

const lesson2Program = tickScript([
  b('move_party', { party: firstParty(), cell: b('neighbor_of', { direction: lit('east'), cell: posOf() }) }),
])

const lesson2 = {
  id: 'walk-the-line',
  title: 'Walk the Line',
  story:
    'Your party is marching east every tick — but the wall at the end of the hallway is closed! Watch it try (and fail) to walk through, then teach it to check first.',
  instructions: [
    'Run the program and watch Party 1 march east until it bumps against a closed wall forever (a blocked move is just ignored).',
    'From the CONTROL group, click "if … then". It drops into "every tick".',
    'Drag your existing "move party to cell" block onto the empty strip INSIDE the "if" block, so the move only happens when the "if" is true.',
    'In the "if" block\'s condition slot, click "choose a check ▾" and pick "is wall … of … open?". Set its direction to "east", and fill its room slot ("choose a room ▾") with "position of …" set to Party 1.',
    'Run again — Party 1 now stops cleanly right before the closed wall.',
  ],
  world: world({
    width: 5,
    height: 3,
    parties: [{ start: { x: 1, y: 2 }, goal: { x: 4, y: 2 } }],
    roomOverrides: { '4,2': { wallRules: { east: 'closed' } } },
  }),
  starterProgram: lesson2Program,
  success: [
    { type: 'used_block', blockType: 'is_wall_open', label: 'Check whether a wall is open' },
    { type: 'party_at', partyId: 'p1', cell: { x: 4, y: 2 }, label: 'Party 1 stops right before the closed wall' },
  ],
  hints: [
    'Where to find each block: "if … then" is in CONTROL · "is wall … of … open?" and "position of …" are both in SENSING.',
    'The "if" block\'s condition slot wants a yes/no block — use its "choose a check ▾" button to drop "is wall … of … open?" inside it.',
    'To move your existing move-block inside the "if", drag it by its front edge onto the empty strip inside the "if".',
    'Final shape: if ( is wall east of position of Party 1 open? ) then → move Party 1 to ( room east of position of Party 1 ).',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 3 — Getting somewhere
// ---------------------------------------------------------------------------

const lesson3Program = tickScript([
  b('move_party', { party: firstParty(), cell: posOf() }),
])

const lesson3 = {
  id: 'getting-somewhere',
  title: 'Getting Somewhere',
  story:
    "Every party has a goal — the room it's trying to reach. Instead of you picking directions by hand, let the sandbox work out the way there.",
  instructions: [
    'Party 1 has a goal room (the flag marker in the 3D view). Right now the starter tells it to move to where it already is, so it never leaves.',
    'In the "move party to cell" block, replace the room slot: click its "choose a room ▾" button and pick "next free step for … toward …" — the smart block that figures out the next safe step for you.',
    'Set that block\'s party dropdown to "Party 1". In its "toward" slot, click "choose a room ▾" → "goal of …" and choose Party 1.',
    'Run — Party 1 finds its own way to the goal, one step per tick, dodging walls automatically.',
  ],
  world: world({
    width: 6,
    height: 4,
    parties: [{ start: { x: 1, y: 1 }, goal: { x: 6, y: 4 } }],
  }),
  starterProgram: lesson3Program,
  success: [
    { type: 'used_block', blockType: 'next_step_toward', label: 'Use "next free step toward"' },
    { type: 'party_at', partyId: 'p1', cell: { x: 6, y: 4 }, label: 'Party 1 reaches its goal' },
  ],
  hints: [
    'Where to find each block: "next free step for … toward …" and "goal of …" are both in SENSING.',
    'You do not have to work out the whole path yourself — "next free step toward" does it for you, one step at a time.',
    'Put "goal of Party 1" into the "toward" slot using that slot\'s "choose a room ▾" button.',
    'Final shape: move Party 1 to ( next free step for Party 1 toward ( goal of Party 1 ) ).',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 4 — If this, then that
// ---------------------------------------------------------------------------

const lesson4Program = tickScript([
  b('move_party', {
    party: firstParty(),
    cell: b('next_step_toward', { party: firstParty(), cell: goalOf() }),
  }),
])

const lesson4 = {
  id: 'if-this-then-that',
  title: 'If This, Then That',
  story:
    'A dummy party is parked in the hallway. "next free step" will route around most obstacles, but let\'s practice checking "is it occupied?" and waiting on purpose.',
  instructions: [
    'Party 2 is parked in the middle of the hallway, blocking the direct path.',
    'From CONTROL, add "if … then … else …" inside "every tick". (You can delete the starter move block first, or build alongside it and delete it after.)',
    'In the condition slot, use "choose a check ▾" → "is … occupied?". Fill its room slot ("choose a room ▾") with "room … of …" set to east, and inside that another "choose a room ▾" → "position of …", Party 1.',
    'In the "then" part (runs when occupied), add MOTION → "make party wait" and choose Party 1.',
    'In the "else" part (runs when the room is clear), add "move party to cell" → Party 1 → the same "room east of position of Party 1".',
    'Run — Party 1 waits politely beside Party 2 instead of trying to share a room.',
  ],
  world: world({
    width: 6,
    height: 3,
    parties: [
      { start: { x: 1, y: 2 }, goal: { x: 6, y: 2 } },
      { start: { x: 4, y: 2 }, goal: { x: 4, y: 2 } },
    ],
  }),
  starterProgram: lesson4Program,
  success: [
    { type: 'used_block', blockType: 'if_else', label: 'Use an if/else block' },
    { type: 'used_block', blockType: 'is_occupied', label: 'Check "is occupied?"' },
    { type: 'no_violations', label: 'No collisions happen' },
  ],
  hints: [
    'Where to find each block: "if … then … else …" in CONTROL · "is … occupied?", "room … of …", "position of …" in SENSING · "make party wait" and "move party to cell" in MOTION.',
    '"is … occupied?" is a yes/no block — drop it into the if\'s condition slot with its "choose a check ▾" button.',
    'The "then" part runs when the answer is YES (occupied); the "else" part runs when NO.',
    'Two parties can never share the same room — that is one of the sandbox\'s sacred rules.',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 5 — Two parties, one hallway
// ---------------------------------------------------------------------------

const lesson5StarterBody = [
  b('move_party', {
    party: firstParty(),
    cell: b('neighbor_of', { direction: lit('east'), cell: posOf() }),
  }),
]

const lesson5 = {
  id: 'two-parties-one-hallway',
  title: 'Two Parties, One Hallway',
  story:
    'Now two parties are both moving on their own, straight toward each other in a narrow hallway. Watch what happens when nobody checks first.',
  instructions: [
    'This program has two separate "every tick" scripts — one drives Party 1 east, the other drives Party 2 west, straight toward each other.',
    'Run it and watch the red collision flash when they both grab the same middle room.',
    'Fix BOTH scripts the same way you did last lesson: wrap each move in "if … then … else …" that checks "is … occupied?" on the room ahead, and waits if so.',
    'Party 1\'s room ahead is "room east of position of Party 1"; Party 2\'s is "room west of position of Party 2" (set that direction dropdown to west).',
    'Run again — no more collision. (They may end up politely stuck facing each other; that is fine here — the next lesson fixes it properly.)',
  ],
  world: world({
    width: 5,
    height: 3,
    parties: [
      { start: { x: 1, y: 2 }, goal: { x: 5, y: 2 } },
      { start: { x: 4, y: 2 }, goal: { x: 1, y: 2 } },
    ],
  }),
  starterProgram: {
    version: 1,
    scripts: [
      createScript('event_tick', lesson5StarterBody),
      createScript('event_tick', [
        b('move_party', {
          party: b('party_number', { n: lit(2) }),
          cell: b('neighbor_of', { direction: lit('west'), cell: posOf(b('party_number', { n: lit(2) })) }),
        }),
      ]),
    ],
  },
  success: [
    { type: 'used_block', blockType: 'is_occupied', label: 'Check "is occupied?" before moving' },
    { type: 'no_violations', label: 'No collisions or swaps happen' },
  ],
  hints: [
    'Where to find each block: "if … then … else …" in CONTROL · "is … occupied?", "room … of …", "position of …" in SENSING · "make party wait", "move party to cell" in MOTION.',
    'Both parties need the check — if only one is careful, the other still walks into it.',
    'In Party 2\'s script, set the "room … of …" direction dropdown to "west", and choose Party 2 in its blocks.',
    'Two scripts run in the same tick, one per party — they do not automatically know about each other.',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 6 — Reservations 101 (the heart of the whole concept)
// ---------------------------------------------------------------------------

const lesson6Starter = tickScript([
  b('for_each_party', {}, {
    body: [
      // Scaffolding: the shape is here, the key insight (reserve, then move)
      // is left for the learner to fill in.
      b('set_var', { name: lit('next'), value: b('next_step_toward', { party: b('current_party'), cell: b('party_goal', { party: b('current_party') }) }) }),
    ],
  }),
])

const lesson6 = {
  id: 'reservations-101',
  title: 'Reservations 101',
  story:
    'Here it is — the heart of the whole sandbox. Instead of checking one obstacle at a time, every party calls "dibs" on its next room before moving, so nobody ever steps on anyone else.',
  instructions: [
    '"for each party" (CONTROL) runs its inside blocks once for every party. Inside it, "current party" means whoever is being handled right now.',
    'The starter already works out each party\'s next step and stores it in a variable named "next" — but it does NOT move anyone yet. If you press Run now, nobody budges. That is your job in the next two steps.',
    'Add WALLS → "reserve cell" as the next block inside the loop. In its room slot, click "choose a room ▾" → "value of a variable", then open its name dropdown and choose "next". This calls dibs on that room for the rest of the tick.',
    'Add MOTION → "move party to cell". For its party, open the party dropdown and choose "current party". In its room slot, click "choose a room ▾" → "value of a variable", then choose "next" from its name dropdown.',
    'Press Run. All 4 parties cross to opposite corners and nobody ever collides — because each one reserves its next room before anyone actually moves.',
  ],
  world: world({
    width: 5,
    height: 5,
    parties: [
      { start: { x: 1, y: 1 }, goal: { x: 5, y: 5 } },
      { start: { x: 5, y: 1 }, goal: { x: 1, y: 5 } },
      { start: { x: 1, y: 5 }, goal: { x: 5, y: 1 } },
      { start: { x: 5, y: 5 }, goal: { x: 1, y: 1 } },
    ],
  }),
  starterProgram: lesson6Starter,
  success: [
    { type: 'used_block', blockType: 'reserve_cell', label: 'Reserve the next room' },
    { type: 'used_block', blockType: 'for_each_party', label: 'Use "for each party"' },
    { type: 'all_parties_at_goal', label: 'Every party reaches its goal' },
    { type: 'no_violations', label: 'No collisions or swaps ever happen' },
    { type: 'within_ticks', n: 40, label: 'Everyone arrives within 40 ticks' },
  ],
  hints: [
    'Where to find each block: "for each party" in CONTROL · "reserve cell" in WALLS · "move party to cell" in MOTION · "current party" in SENSING · the "value of a variable" block is in VARIABLES (in any slot\'s picker menu it is the option literally named "value of a variable").',
    'To read the "next" variable, click a slot\'s "choose a room ▾" (or "＋ block ▾") button → "value of a variable", then pick "next" from its name dropdown (no typing — it is already listed).',
    'For any party slot inside "for each party", just open the party dropdown and choose "current party" — no extra block needed.',
    'Reserve BEFORE you move, so the next party in the loop sees the room is already taken.',
    'Reservations clear at the start of every tick, so each party reserves fresh — you never have to un-reserve.',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 7 — The swap trap
// ---------------------------------------------------------------------------

const lesson7Starter = tickScript([
  b('for_each_party', {}, {
    body: [
      b('set_var', { name: lit('next'), value: b('next_step_toward', { party: b('current_party'), cell: b('party_goal', { party: b('current_party') }) }) }),
      b('reserve_cell', { cell: b('get_var', { name: lit('next') }) }),
      b('move_party', { party: b('current_party'), cell: b('get_var', { name: lit('next') }) }),
    ],
  }),
])

const lesson7 = {
  id: 'swap-trap',
  title: 'The Swap Trap',
  story:
    'Two parties face each other in a one-room-wide hallway. Reserving your next room stops you from walking into someone — but it does not stop two people from trading places head-on!',
  instructions: [
    'Run the starter — it already reserves each party\'s next room before moving. Watch for a "swap" flash: two parties trade places head-on in one tick.',
    'Reserving only your destination cannot stop a swap — the other party\'s destination is the room you are standing in, which nobody reserved.',
    'Add a SECOND "reserve cell" inside the loop, before the move. In its room slot use "choose a room ▾" → "position of …", and set that block\'s party dropdown to "current party". This reserves the room you are standing in.',
    'Run again — a party trying to swap into your room now sees it reserved and waits instead.',
  ],
  world: world({
    width: 5,
    height: 3,
    parties: [
      { start: { x: 1, y: 2 }, goal: { x: 5, y: 2 } },
      { start: { x: 5, y: 2 }, goal: { x: 1, y: 2 } },
    ],
  }),
  starterProgram: lesson7Starter,
  success: [
    { type: 'used_block', blockType: 'reserve_cell', label: 'Reserve rooms' },
    { type: 'no_violations', label: 'No swap violations happen' },
  ],
  hints: [
    'Where to find each block: "reserve cell" in WALLS · "position of …" and "current party" in SENSING.',
    'A "swap" happens when two parties trade rooms in one tick — reserving only your destination cannot catch it.',
    'Also reserve your OWN room: reserve ( position of current party ), placed before the move block.',
    'So the two reserve blocks come first (next room, then your own room), and the move block comes last.',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 8 — Open sesame
// ---------------------------------------------------------------------------

const lesson8Starter = tickScript([
  b('for_each_party', {}, {
    body: [
      b('set_var', { name: lit('next'), value: b('next_step_toward', { party: b('current_party'), cell: b('party_goal', { party: b('current_party') }) }) }),
      b('reserve_cell', { cell: b('get_var', { name: lit('next') }) }),
      b('move_party', { party: b('current_party'), cell: b('get_var', { name: lit('next') }) }),
    ],
  }),
])

const lesson8 = {
  id: 'open-sesame',
  title: 'Open Sesame',
  story:
    'A wall is sealed shut, blocking the direct path to the goal. "next free step" will route around it on its own, as long as another way exists.',
  instructions: [
    'Run the starter (your reservation brain from before) exactly as-is.',
    'A wall on the direct path is sealed shut — watch Party 1 automatically take the long way around, because "next free step" routes around closed walls on its own.',
    'If you would rather force the wall open instead, use WALLS → "set wall … of … to …": pick the direction, put the room in with "choose a room ▾" → "room at x: y:", and set the last dropdown to "open".',
    'Goal: Party 1 reaches its goal despite the closed wall.',
  ],
  world: world({
    width: 5,
    height: 5,
    parties: [{ start: { x: 1, y: 1 }, goal: { x: 5, y: 1 } }],
    roomOverrides: {
      '3,1': { wallRules: { east: 'closed' } },
      '4,1': { wallRules: { west: 'closed' } },
    },
  }),
  starterProgram: lesson8Starter,
  success: [
    { type: 'party_at', partyId: 'p1', cell: { x: 5, y: 1 }, label: 'Party 1 reaches its goal despite the closed wall' },
    { type: 'within_ticks', n: 30, label: 'Arrives within 30 ticks' },
  ],
  hints: [
    'Where to find each block: "set wall … of … to …" and "reserve cell" in WALLS · "room at x: y:" and "next free step …" in SENSING.',
    '"next free step toward" already knows how to route around closed walls — you may not need to change anything, just give it time to walk the long way.',
    'To force a wall open on purpose: set wall east of ( room at x:3 y:1 ) to open.',
    'The sealed wall in this lesson sits between x:3 and x:4 on the bottom row (y:1).',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 9 — Zones
// ---------------------------------------------------------------------------

const lesson9Starter = tickScript([
  b('if_else', {
    cond: b('get_var', { name: lit('visitedFirst') }),
  }, {
    body: [
      b('move_party', {
        party: firstParty(),
        cell: b('next_step_toward', { party: firstParty(), cell: b('cell_at', { x: lit(5), y: lit(5) }) }),
      }),
    ],
    elseBody: [
      b('move_party', {
        party: firstParty(),
        cell: b('next_step_toward', { party: firstParty(), cell: b('cell_at', { x: lit(3), y: lit(1) }) }),
      }),
    ],
  }),
])

const lesson9 = {
  id: 'zones',
  title: 'Zones',
  story:
    'Variables can remember more than numbers for scoring — use one to remember whether a party has already visited its first stop, then send it on to the next zone.',
  instructions: [
    'The starter sends Party 1 toward Zone A (room x:3 y:1) forever, because the variable "visitedFirst" starts empty (counts as no) and never changes.',
    'Add a new "if … then" (CONTROL) ABOVE the existing if/else block.',
    'Its condition: click "choose a check ▾" → "… = …" (from OPERATORS). On its left slot click "＋ block ▾" → "position of …" (Party 1); on its right click "＋ block ▾" → "room at x: y:" set to x:3 y:1.',
    'Inside that new "if", add VARIABLES → "set name to value". Open its name dropdown and choose "visitedFirst" — it is already listed because the if/else below reads it, and picking it (instead of retyping) guarantees both blocks point at the SAME variable. Then set the value to 1.',
    'Run — Party 1 visits Zone A, the variable flips to 1, and the existing if/else then sends it on to Zone B (x:5 y:5).',
  ],
  world: world({
    width: 5,
    height: 5,
    parties: [{ start: { x: 1, y: 1 }, goal: { x: 5, y: 5 } }],
  }),
  starterProgram: lesson9Starter,
  success: [
    { type: 'used_block', blockType: 'set_var', label: 'Use a variable to remember progress' },
    { type: 'party_at', partyId: 'p1', cell: { x: 5, y: 5 }, label: 'Party 1 ends up at zone B' },
    { type: 'within_ticks', n: 25, label: 'Finishes within 25 ticks' },
  ],
  hints: [
    'Where to find each block: "if … then" in CONTROL · the "… = …" block in OPERATORS · "position of …" and "room at x: y:" in SENSING · "set name to value" in VARIABLES.',
    'Use the "=" block to compare Party 1\'s position to the Zone A room ( room at x:3 y:1 ).',
    'Set the variable to the number 1 (any non-zero number counts as "yes" to the if/else).',
    'Put this new "if" ABOVE the existing if/else so it checks first each tick.',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 10 — The full brain
// ---------------------------------------------------------------------------

const lesson10Starter = tickScript([
  b('for_each_party', {}, {
    body: [
      b('set_var', { name: lit('next'), value: b('next_step_toward', { party: b('current_party'), cell: b('party_goal', { party: b('current_party') }) }) }),
      b('reserve_cell', { cell: b('get_var', { name: lit('next') }) }),
      b('reserve_cell', { cell: b('party_position', { party: b('current_party') }) }),
      b('move_party', { party: b('current_party'), cell: b('get_var', { name: lit('next') }) }),
    ],
  }),
])

const lesson10 = {
  id: 'full-brain',
  title: 'The Full Brain',
  story:
    'This is it — four parties, crossing goals, and the two sacred rules: no two parties ever share a room, and no two parties ever swap through each other. Get everyone home safely.',
  instructions: [
    'The starter already combines everything you have learned: for each party — reserve your next step, reserve your own room (to stop swaps), then move.',
    'Press Run with all 4 parties crossing to opposite corners, and watch the whole brain work.',
    'This is the exact routing brain from the very first prototype — except now you understand every block in it. Try opening "Explain my program" to read it back in plain English.',
    'Goal: everyone reaches their goal, with zero violations, within 40 ticks.',
  ],
  world: world({
    width: 6,
    height: 6,
    parties: [
      { start: { x: 1, y: 1 }, goal: { x: 6, y: 6 } },
      { start: { x: 6, y: 1 }, goal: { x: 1, y: 6 } },
      { start: { x: 1, y: 6 }, goal: { x: 6, y: 1 } },
      { start: { x: 6, y: 6 }, goal: { x: 1, y: 1 } },
    ],
  }),
  starterProgram: lesson10Starter,
  success: [
    { type: 'all_parties_at_goal', label: 'Every party reaches its goal' },
    { type: 'no_violations', label: 'No collisions or swaps ever happen' },
    { type: 'within_ticks', n: 40, label: 'Everyone arrives within 40 ticks' },
  ],
  hints: [
    'Where to find each block: "for each party" in CONTROL · "reserve cell" in WALLS · "move party to cell" in MOTION · "current party", "position of …", "next free step …", "goal of …" in SENSING · "value of a variable" / "set name to value" in VARIABLES.',
    'You have already built every piece needed: "for each party", "next free step", and two reservations (next room + your own room).',
    'Reserving both your next room AND your current room stops both collisions and swaps.',
    'If a party seems stuck, it is waiting for a reservation that clears next tick — that patience is exactly what keeps everyone safe.',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 11 — Big Rooms (open_area)
// ---------------------------------------------------------------------------
// From here on the theme shifts from *routing* guests to *building* the space
// they move through. A room does not have to be a single square: "open room
// from … to …" hinges open every inside wall of a rectangle, fusing the little
// squares into one big room.

const at = (x, y) => b('cell_at', { x: lit(x), y: lit(y) })
const moveToward = (target) =>
  b('move_party', { party: firstParty(), cell: b('next_step_toward', { party: firstParty(), cell: target }) })
const closeWall = (direction, x, y) =>
  b('set_wall', { direction: lit(direction), cell: at(x, y), state: lit('closed') })

// The four sealed inside walls of the 2×2 corner block are written out as real
// blocks the learner can see (rather than baked invisibly into the world) so it
// is obvious *why* Party 1 starts trapped — and that "open room" simply undoes
// them. (They render red in the 3D view once they run.)
const lesson11Starter = {
  version: 1,
  scripts: [
    createScript('event_start', [
      closeWall('east', 1, 1),
      closeWall('south', 1, 1),
      closeWall('east', 1, 2),
      closeWall('south', 2, 1),
    ]),
    createScript('event_tick', [moveToward(at(2, 2))]),
  ],
}

const lesson11 = {
  id: 'big-rooms',
  title: 'Big Rooms',
  story:
    "Until now every room was one square. But real spaces are bigger. The 'when simulation starts' block shuts the four inside walls of the corner (watch them turn red on Run), boxing Party 1 in — knock them back out to fuse four squares into one open room it can cross.",
  instructions: [
    'Press Run first. The four "set wall … to closed" blocks slam shut the inside walls of the 2×2 corner (they glow red), so Party 1 cannot take a single step toward the target at x:2 y:2.',
    'Those red walls are not magic — they are exactly the four "set wall … to closed" blocks already sitting in "when simulation starts". This is the building\'s starting shape, written out so you can see it.',
    'From the new BUILD group (brown blocks), add "open room from … to …" as the LAST block inside "when simulation starts", after the four seal blocks.',
    'Fill its first room slot with "choose a room ▾" → "room at x: y:" set to x:1 y:1, and its second the same way with x:2 y:2 — the two opposite corners of the block.',
    'Press Run again. "open room" knocks all four inside walls back down, the squares fuse into one open room, and Party 1 walks across to x:2 y:2.',
  ],
  world: world({
    width: 4,
    height: 4,
    parties: [{ start: { x: 1, y: 1 } }],
  }),
  starterProgram: lesson11Starter,
  success: [
    { type: 'used_block', blockType: 'open_area', label: 'Use "open room from … to …"' },
    { type: 'party_at', partyId: 'p1', cell: { x: 2, y: 2 }, label: 'Party 1 crosses the new big room' },
    { type: 'within_ticks', n: 10, label: 'Arrives within 10 ticks' },
  ],
  hints: [
    'Where to find each block: "open room from … to …" is in the new BUILD group · "room at x: y:" is in SENSING.',
    'The red walls come from the "set wall … to closed" blocks in "when simulation starts" — "open room" is the block that undoes them all at once.',
    'Put "open room" AFTER the four seal blocks, so it opens the walls back up rather than being closed over.',
    'The two corners cover all four squares: x:1 y:1 and x:2 y:2.',
    'Final shape: when simulation starts → (four set-wall-closed blocks) → open room from ( room at x:1 y:1 ) to ( room at x:2 y:2 ).',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 12 — Hallways (carve_corridor)
// ---------------------------------------------------------------------------

// The dividing wall is written as three visible "set wall east … to closed"
// blocks (one per row of column 2) rather than hidden in the world, so the red
// barrier the learner sees has an obvious cause in the code.
const lesson12Starter = {
  version: 1,
  scripts: [
    createScript('event_start', [
      closeWall('east', 3, 1),
      closeWall('east', 3, 2),
      closeWall('east', 3, 3),
    ]),
    createScript('event_tick', [moveToward(at(4, 2))]),
  ],
}

const lesson12 = {
  id: 'hallways',
  title: 'Hallways',
  story:
    'A solid wall splits the floor in two. The "when simulation starts" block shuts the whole line between column 3 and column 4 (it glows red on Run), so Party 1 on the left has no way across to its target on the right. Carve a corridor to connect the two halves.',
  instructions: [
    'Run first: the three "set wall east … to closed" blocks slam a red wall down the middle (between column 3 and column 4), so Party 1 can never reach the target at x:4 y:2.',
    'That red barrier is exactly those three blocks in "when simulation starts" — the floor\'s starting shape, in plain sight.',
    'From the BUILD group, drop "carve corridor from … to …" as the LAST block in "when simulation starts".',
    'Set its first room to "room at x: y:" x:2 y:2 (where Party 1 stands) and its second room to "room at x: y:" x:4 y:2 (the target).',
    'Run again. The corridor punches one doorway through the red barrier, and Party 1 walks straight across to the target.',
  ],
  world: world({
    width: 5,
    height: 3,
    parties: [{ start: { x: 2, y: 2 } }],
  }),
  starterProgram: lesson12Starter,
  success: [
    { type: 'used_block', blockType: 'carve_corridor', label: 'Use "carve corridor from … to …"' },
    { type: 'party_at', partyId: 'p1', cell: { x: 4, y: 2 }, label: 'Party 1 crosses to the far side' },
    { type: 'within_ticks', n: 10, label: 'Arrives within 10 ticks' },
  ],
  hints: [
    'Where to find each block: "carve corridor from … to …" is in BUILD · "room at x: y:" is in SENSING.',
    'A corridor opens a line of doors straight across, then up or down, connecting the two rooms you name — punching one gap through the red barrier.',
    'Put it AFTER the three seal blocks so it opens a doorway through them.',
    'Start the corridor where Party 1 stands (x:2 y:2) and end it at the target (x:4 y:2).',
    'Final shape: carve corridor from ( room at x:2 y:2 ) to ( room at x:4 y:2 ).',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 13 — Blank Canvas (reset_all_walls + carve_corridor)
// ---------------------------------------------------------------------------

const lesson13Starter = {
  version: 1,
  scripts: [
    createScript('event_start', []),
    createScript('event_tick', [moveToward(at(5, 5))]),
  ],
}

const lesson13 = {
  id: 'blank-canvas',
  title: 'Blank Canvas',
  story:
    'Real floor plans start from nothing. Seal the entire building into a grid of closed boxes, then carve exactly the one path you want — the start of designing a layout instead of just using one.',
  instructions: [
    'The floor is wide open right now, so Party 1 could already wander to the target at x:5 y:5. This time YOU design the route.',
    'In "when simulation starts", first drop BUILD → "set every wall to …" and leave it on "closed". This seals every room into its own box — a blank canvas.',
    'Below it (still inside "when simulation starts"), add "carve corridor from … to …" from x:1 y:1 to x:5 y:5. Order matters: seal everything first, THEN carve.',
    'Run. Party 1 has exactly one legal route — the corridor you carved — and follows it to the corner.',
  ],
  world: world({
    width: 5,
    height: 5,
    parties: [{ start: { x: 1, y: 1 } }],
  }),
  starterProgram: lesson13Starter,
  success: [
    { type: 'used_block', blockType: 'reset_all_walls', label: 'Seal the whole floor with "set every wall to closed"' },
    { type: 'used_block', blockType: 'carve_corridor', label: 'Carve the one route you want' },
    { type: 'party_at', partyId: 'p1', cell: { x: 5, y: 5 }, label: 'Party 1 follows your carved route' },
    { type: 'within_ticks', n: 15, label: 'Arrives within 15 ticks' },
  ],
  hints: [
    'Where to find each block: "set every wall to …" and "carve corridor from … to …" are both in BUILD.',
    'Sealing must come first — if you carve and then seal, the seal closes your corridor right back up.',
    'The corridor goes from Party 1\'s corner (x:1 y:1) to the far corner (x:5 y:5).',
    'Final shape: when simulation starts → set every wall to closed → carve corridor from ( room at x:1 y:1 ) to ( room at x:5 y:5 ).',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 14 — Sealed Rooms & Doors (close_border + set_wall)
// ---------------------------------------------------------------------------

const lesson14Starter = {
  version: 1,
  scripts: [
    createScript('event_start', []),
    createScript('event_tick', [moveToward(at(3, 3))]),
  ],
}

const lesson14 = {
  id: 'sealed-rooms',
  title: 'Sealed Rooms & Doors',
  story:
    'Not every room should be wide open. Wall off a private room in the middle of the floor — but leave a single door, or even Party 1 (whose target is inside it) can never get in.',
  instructions: [
    'In "when simulation starts", add BUILD → "wall off room from … to …", from x:2 y:2 to x:4 y:4. This seals a 3×3 room around the target at x:3 y:3.',
    'Run now and watch: Party 1 can reach the outside of the room but never gets in — a fully sealed room has no door.',
    'Below the "wall off" block, add WALLS → "set wall … of … to …": direction "west", room "room at x: y:" x:2 y:3, state "open". That hinges one wall back open as a door.',
    'Run again. Party 1 walks around to the door on the west side and steps into the sealed room to reach x:3 y:3.',
  ],
  world: world({
    width: 5,
    height: 5,
    parties: [{ start: { x: 1, y: 1 } }],
  }),
  starterProgram: lesson14Starter,
  success: [
    { type: 'used_block', blockType: 'close_border', label: 'Wall off a private room' },
    { type: 'used_block', blockType: 'set_wall', label: 'Leave one door open' },
    { type: 'party_at', partyId: 'p1', cell: { x: 3, y: 3 }, label: 'Party 1 enters through the door' },
    { type: 'within_ticks', n: 12, label: 'Arrives within 12 ticks' },
  ],
  hints: [
    'Where to find each block: "wall off room from … to …" is in BUILD · "set wall … of … to …" is in WALLS · "room at x: y:" is in SENSING.',
    '"Wall off" closes the whole outside edge of the rectangle — a room with no door traps everyone out.',
    'One "set wall … to open" reopens a single edge as a door; west of ( room at x:2 y:3 ) makes a door on the left side.',
    'Order: wall off the room first, then open the one door.',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 15 — A Park That Rebuilds Itself (adaptive generation)
// ---------------------------------------------------------------------------
// The capstone of the build track: generation that runs again and again while
// the sim plays, guarded by a safety check so it never reshapes walls on top of
// a guest. The main corridor is pre-built for you; you add the living part.

// The floor is sealed and two corridors are carved — but they stop short of
// each other, one at the north-west corner of a 2×2 "gate room" (x:3 y:3) and
// one picking back up at its south-east corner (x:4 y:4). The gate room's
// inside walls start shut, so the two corridors are not yet connected: Party 1
// walks up to the gate and can go no further until the living generator opens
// the room for it. The tick script uses "next free step … (or as close as
// possible)" so Party 1 visibly walks up to the shut gate and waits at its
// threshold from tick 0, instead of standing frozen at the start.
const moveTowardClosest = (target) =>
  b('move_party', {
    party: firstParty(),
    cell: b('next_step_toward_or_closest', { party: firstParty(), cell: target }),
  })

const lesson15Starter = {
  version: 1,
  scripts: [
    createScript('event_start', [
      b('reset_all_walls', { state: lit('closed') }),
      b('carve_corridor', { cellA: at(1, 1), cellB: at(3, 3) }),
      b('carve_corridor', { cellA: at(4, 4), cellB: at(6, 6) }),
    ]),
    createScript('event_tick', [moveTowardClosest(at(6, 6))]),
    createScript('event_every_n_ticks', [], { hat: { inputs: { n: lit(3) } } }),
  ],
}

const lesson15 = {
  id: 'living-park',
  title: 'A Park That Rebuilds Itself',
  story:
    "The finale: a park that builds itself as it runs. The whole floor is sealed, and two corridors lead in from the start and out to the exit — but they stop on opposite corners of a shut gate room in the middle. Party 1 walks up to the shut gate and waits right at its threshold. Teach the park to open that gate as the sim plays, so Party 1 can pass through to the far corner. The catch: never reshape a wall on top of a guest, so open it only when the room is empty.",
  instructions: [
    'Run "when simulation starts" once. It seals the whole floor, then carves two corridors: one from the start (x:1 y:1) to x:3 y:3, and one from x:4 y:4 out to the exit (x:6 y:6). Party 1 walks in and stops at x:3 y:3 — the shut gate room between the two corridors blocks the way. (Notice it walks right up to the gate and waits there, rather than sitting frozen at the start — that is the "or as close as possible" move block doing its job.)',
    'The empty "every 3 ticks" block is where the living generation goes. Inside it, add CONTROL → "if … then".',
    'For the "if" condition, use "choose a check ▾" → "is area … to … empty?" (in SENSING), from x:3 y:3 to x:4 y:4. This is the safety check: only open the gate when no guest is standing inside it.',
    'Inside that "if", add BUILD → "open room from … to …" for the same corners, x:3 y:3 to x:4 y:4. Now the gate room fuses open while it is still empty, joining the two corridors.',
    'Run. The park opens the gate room for itself, and Party 1 walks straight through it to the exit at x:6 y:6. (If a guest were standing in the room, the safety check would refuse to rebuild those walls on top of it.)',
  ],
  world: world({
    width: 6,
    height: 6,
    parties: [{ start: { x: 1, y: 1 }, goal: { x: 6, y: 6 } }],
  }),
  starterProgram: lesson15Starter,
  success: [
    { type: 'used_block', blockType: 'is_area_clear', label: 'Check the gate room is empty first' },
    { type: 'used_block', blockType: 'open_area', label: 'Open the gate room' },
    { type: 'party_at', partyId: 'p1', cell: { x: 6, y: 6 }, label: 'Party 1 passes through to the exit' },
    { type: 'within_ticks', n: 20, label: 'Arrives within 20 ticks' },
  ],
  hints: [
    'Where to find each block: "if … then" is in CONTROL · "is area … to … empty?" is in SENSING · "open room from … to …" is in BUILD.',
    'The safety check goes in the "if" condition; the building block goes inside the "if" so it only runs when the check is true.',
    'Both blocks use the same two corners: x:3 y:3 and x:4 y:4 — the shut gate room between the two carved corridors.',
    'The two corridors are already built in "when simulation starts" — you only need to add the "every 3 ticks" generation that opens the gate between them.',
    'The tick script already uses "next free step … (or as close as possible)", which is why Party 1 waits at the gate instead of freezing — once you open the gate, the very same block walks it the rest of the way.',
  ],
}

// ---------------------------------------------------------------------------
// Lesson 16 — Lists: Remembering Many Things
// ---------------------------------------------------------------------------
// Teaches the list primitive in isolation, and — crucially — the learner
// BUILDS it forward instead of being handed a finished double-negative guard.
// Step 1: add the room to a "trail" list every tick and watch the said length
// climb 1→6 (immediate, visible payoff). Step 2: notice the guest standing
// still at the end keeps re-adding the same room (the number overshoots), and
// fix it with a "not already on the trail" guard so each room is remembered
// once. The starter is deliberately empty of both list blocks.

const lesson16Starter = tickScript([
  b('move_party', { party: firstParty(), cell: b('next_step_toward', { party: firstParty(), cell: goalOf() }) }),
  b('say', { party: firstParty(), text: b('list_length', { name: lit('trail') }) }),
])

const lesson16 = {
  id: 'lists-basics',
  title: 'Lists: Remembering Many Things',
  story:
    'A plain variable (from the earlier lessons) holds ONE thing. A list holds MANY things in a row — perfect for remembering every room a guest has visited. Party 1 walks east along a row of rooms, saying out loud how long its "trail" list is. Right now it always says 0, because nothing has been added yet. You will teach it to drop a breadcrumb each step — and then to remember each room only once.',
  instructions: [
    'The starter already moves Party 1 east and says the length of a list called "trail". A list starts empty, so the bubble says 0.',
    'STEP 1 — remember each room. As the FIRST block inside "every tick", add VARIABLES → "add … to list …". For its value, click "＋ block ▾" → SENSING "position of …" and choose Party 1. For the list name, type (or pick) "trail". Press Run: the bubble now climbs 1, 2, 3, 4, 5, 6 as Party 1 drops a breadcrumb into the list each step.',
    'Watch what goes wrong: when Party 1 reaches the last room it just stands there, still adding that SAME room every tick — so the number shoots past 6 and never stops. A trail should list each room only ONCE.',
    'STEP 2 — only remember NEW rooms. Wrap your "add" block inside CONTROL → "if … then". For the "if" check, click "choose a check ▾" → OPERATORS "not …", and inside that "not" put VARIABLES "list … contains …?" set to list "trail" with value "position of Party 1". Read it out loud: "if my room is NOT already on the trail, then add it." ("not" just flips a yes/no answer, so "not already on the trail" means "this room is new".)',
    'Run again. Each room is now remembered exactly once: the trail fills to 6 and stops. You have used a list to record a whole journey.',
  ],
  world: world({
    width: 6,
    height: 1,
    parties: [{ start: { x: 1, y: 1 }, goal: { x: 6, y: 1 } }],
  }),
  starterProgram: lesson16Starter,
  success: [
    { type: 'used_block', blockType: 'list_add', label: 'Add each room to the trail list' },
    { type: 'used_block', blockType: 'list_contains', label: 'Only remember NEW rooms (the "contains?" guard)' },
    { type: 'list_length_at_least', name: 'trail', n: 6, label: 'The trail remembers all 6 rooms' },
    { type: 'party_at', partyId: 'p1', cell: { x: 6, y: 1 }, label: 'Party 1 reaches the end of the row' },
    { type: 'within_ticks', n: 16, label: 'Finishes within 16 ticks' },
  ],
  hints: [
    'Where to find each block: "add … to list …" and "list … contains …?" are in VARIABLES · "not …" is in OPERATORS · "position of …" is in SENSING.',
    'STEP 1 is just the "add" block on its own — run it first and watch the number climb before you worry about the guard.',
    'The value you add is the party\'s CURRENT room — use "position of Party 1". Use the same list name "trail" everywhere so the blocks share one list.',
    'The guard reads "if NOT (list trail contains position of Party 1) then add it" — it stops the same room being remembered twice, so the length climbs by one per NEW room instead of forever.',
  ],
}

// ---------------------------------------------------------------------------
// Dungeon track (Lessons 17–20) — a rolling, recycling ROOM generator
// ---------------------------------------------------------------------------
// Replaces the old growing-tree maze lessons. Instead of opening one square at
// a time at a random spot (which reads as a maze, not rooms), the guest carries
// a moving window of real multi-tile rooms: each new room is generated FROM the
// previous one through a single gate; once the guest steps into the new room,
// the room BEHIND seals shut (blank canvas again) so the space can be reused.
// Every lesson's starter program is the previous lesson's FINISHED program,
// grown one idea at a time from these shared builders — so nothing arrives
// pre-built that the learner has not already built themselves.

const gv = (name) => b('get_var', { name: lit(name) })
// A room is a 2×2 block anchored at its top-left cell. These helpers stay
// arithmetic-free by composing "neighbour of", so they read plainly as blocks.
const nbrOf = (dir, cell) => b('neighbor_of', { direction: typeof dir === 'string' ? lit(dir) : dir, cell })
const roomFar = (anchor) => nbrOf('east', nbrOf('south', anchor)) // opposite corner: anchor + (1,1)
const roomAt = (anchor, dir) => nbrOf(dir, nbrOf(dir, anchor)) // the 2×2 room two cells over in dir
const moveToGoal = () =>
  b('move_party', { party: firstParty(), cell: b('next_step_toward_or_closest', { party: firstParty(), cell: goalOf() }) })

// --- Lesson 17: generate one next room + a gate, from a pre-built seed room --
const lesson17Seed = () => [
  b('reset_all_walls', { state: lit('closed') }),
  b('open_area', { cellA: at(1, 1), cellB: at(2, 2) }), // the seed room the guest starts inside
]
const lesson17Starter = {
  version: 1,
  scripts: [
    createScript('event_start', lesson17Seed()),
    createScript('event_tick', [moveToGoal()]),
  ],
}

const lesson17 = {
  id: 'the-next-room',
  title: 'Generate the Next Room',
  story:
    "Here begins a park that builds itself as guests move through it. The whole floor is sealed into closed boxes except one seed room, where Party 1 waits. A real room is not one square — it is several squares fused together. Teach the park to GENERATE the next room right beside this one and connect it with a single doorway (a “gate”), so Party 1 can walk on into brand-new space.",
  instructions: [
    'Press Run first. The floor is sealed into closed boxes; only the 2×2 seed room (corners x:1 y:1 to x:2 y:2) is open, so Party 1 can shuffle inside it but has nowhere to go.',
    'You will build the NEXT room and a gate into it, both inside "when simulation starts", after the seed room.',
    'From BUILD, add "open room from … to …" from x:3 y:1 to x:4 y:2 (fill each room slot with SENSING "room at x: y:"). That fuses four sealed squares into a second 2×2 room, right next to the first.',
    'The two rooms are still separated by a wall. From BUILD add "carve corridor from … to …" from x:2 y:1 to x:3 y:1 — that opens ONE doorway (a gate) between them.',
    'Run again. Party 1 walks through the gate into the freshly generated room and reaches its goal at x:4 y:2. You just generated a room and connected it — the seed of the whole dungeon.',
  ],
  world: world({
    width: 6,
    height: 3,
    parties: [{ start: { x: 1, y: 1 }, goal: { x: 4, y: 2 } }],
  }),
  starterProgram: lesson17Starter,
  success: [
    { type: 'used_block', blockType: 'open_area', label: 'Generate the next room with "open room"' },
    { type: 'used_block', blockType: 'carve_corridor', label: 'Connect it with a gate' },
    { type: 'area_open', cellA: { x: 3, y: 1 }, cellB: { x: 4, y: 2 }, label: 'The next room is open' },
    { type: 'party_at', partyId: 'p1', cell: { x: 4, y: 2 }, label: 'Party 1 walks into the new room' },
    { type: 'within_ticks', n: 12, label: 'Arrives within 12 ticks' },
  ],
  hints: [
    'Where to find each block: "open room from … to …" and "carve corridor from … to …" are both in BUILD · "room at x: y:" is in SENSING.',
    'Both new blocks go inside "when simulation starts", AFTER the seed room that is already there.',
    'The new room is the 2×2 from x:3 y:1 to x:4 y:2. The gate connects the seed room\'s edge (x:2 y:1) to the new room (x:3 y:1).',
    'Final shape: when simulation starts → open seed room → open room x:3 y:1 to x:4 y:2 → carve corridor x:2 y:1 to x:3 y:1.',
  ],
}

// --- Lesson 18: seal the room behind once the guest has left it --------------
const lesson18Starter = {
  version: 1,
  scripts: [
    createScript('event_start', [
      ...lesson17Seed(),
      b('open_area', { cellA: at(3, 1), cellB: at(4, 2) }),
      b('carve_corridor', { cellA: at(2, 1), cellB: at(3, 1) }),
    ]),
    createScript('event_tick', [moveToGoal()]),
  ],
}
// Lesson 18 solved = its starter + the "seal behind once empty" recycle. This
// exact program is Lesson 19's starter (starter(N+1) === solved(N)).
const lesson18Solved = {
  version: 1,
  scripts: [
    createScript('event_start', [
      ...lesson17Seed(),
      b('open_area', { cellA: at(3, 1), cellB: at(4, 2) }),
      b('carve_corridor', { cellA: at(2, 1), cellB: at(3, 1) }),
    ]),
    createScript('event_tick', [
      b('if', { cond: b('is_area_clear', { cellA: at(1, 1), cellB: at(2, 2) }) }, {
        body: [b('seal_area', { cellA: at(1, 1), cellB: at(2, 2) })],
      }),
      moveToGoal(),
    ]),
  ],
}

const lesson18 = {
  id: 'seal-behind',
  title: 'Seal the Room Behind',
  story:
    "A rolling park does not just build ahead — it cleans up behind. Once Party 1 has left the seed room, that room is wasted space. Teach the park to seal it back into blank canvas the moment the guest is gone, so the floor can be reused later. This “open ahead, close behind” idea is the heart of a park that rebuilds itself.",
  instructions: [
    'The starter is your finished program from last lesson: it generates the second room, gates it, and Party 1 walks through to x:4 y:2.',
    'This time, seal the FIRST room shut once Party 1 has walked out of it.',
    'Inside "every tick", ABOVE the move block, add CONTROL → "if … then". For its check, use "choose a check ▾" → SENSING "is area … to … empty?" from x:1 y:1 to x:2 y:2 — this asks "has the guest left the seed room yet?".',
    'Inside that "if", add BUILD → "seal every wall from … to …" from x:1 y:1 to x:2 y:2. When the seed room is empty, this closes every one of its walls, turning it back into blank sealed squares.',
    'Run. Party 1 walks into room two, and the instant it clears the seed room, the seed room snaps shut behind it — recycled back to blank canvas.',
  ],
  world: world({
    width: 6,
    height: 3,
    parties: [{ start: { x: 1, y: 1 }, goal: { x: 4, y: 2 } }],
  }),
  starterProgram: lesson18Starter,
  success: [
    { type: 'used_block', blockType: 'seal_area', label: 'Seal the room behind with "seal every wall"' },
    { type: 'used_block', blockType: 'is_area_clear', label: 'Only seal once the guest has left' },
    { type: 'area_sealed', cellA: { x: 1, y: 1 }, cellB: { x: 2, y: 2 }, label: 'The seed room is blank canvas again' },
    { type: 'party_at', partyId: 'p1', cell: { x: 4, y: 2 }, label: 'Party 1 reaches the new room' },
    { type: 'within_ticks', n: 12, label: 'Finishes within 12 ticks' },
  ],
  hints: [
    'Where to find each block: "is area … to … empty?" is in SENSING · "seal every wall from … to …" is in BUILD.',
    'The "if" guard matters: sealing a room while the guest is still inside would trap it. "is area … empty?" waits until it has left.',
    'Both the check and the seal use the SAME corners as the seed room: x:1 y:1 to x:2 y:2.',
    'Order: put the "if … seal" ABOVE the move, so the seal happens the tick after the guest steps out.',
  ],
}

// --- Lesson 19: generalise the fixed two rooms into a loop that keeps rolling -
// Solved form = the rolling window. `room` is the guest's current room anchor;
// `ahead` is the next room two cells over. Each tick: if the guest has left the
// current room, seal it and advance the window; otherwise, if the space ahead
// is blank canvas, stamp the next room + gate. The guest always walks toward its
// goal, so the generator opens the path just ahead of it. This exact program is
// Lesson 20's starter.
const lesson19Solved = {
  version: 1,
  scripts: [
    createScript('event_start', [
      b('reset_all_walls', { state: lit('closed') }),
      b('set_var', { name: lit('room'), value: at(1, 1) }),
      b('open_area', { cellA: gv('room'), cellB: roomFar(gv('room')) }),
    ]),
    createScript('event_tick', [
      b('set_var', { name: lit('ahead'), value: roomAt(gv('room'), lit('east')) }),
      b('if_else', { cond: b('is_area_clear', { cellA: gv('room'), cellB: roomFar(gv('room')) }) }, {
        body: [
          b('seal_area', { cellA: gv('room'), cellB: roomFar(gv('room')) }),
          b('set_var', { name: lit('room'), value: gv('ahead') }),
        ],
        elseBody: [
          b('if', { cond: b('is_area_sealed', { cellA: gv('ahead'), cellB: roomFar(gv('ahead')) }) }, {
            body: [
              b('open_area', { cellA: gv('ahead'), cellB: roomFar(gv('ahead')) }),
              b('carve_corridor', { cellA: nbrOf('east', gv('room')), cellB: gv('ahead') }),
            ],
          }),
        ],
      }),
      moveToGoal(),
    ]),
  ],
}

const lesson19 = {
  id: 'keep-it-rolling',
  title: 'Keep It Rolling',
  story:
    "Your last program made exactly ONE new room, by hand, at fixed spots. A real park keeps rolling — room after room, forever, wherever the guest goes. The trick is a VARIABLE that remembers which room the guest is in right now, so the same few blocks work for every room instead of just the first. Turn your one-off into a machine.",
  instructions: [
    'Press Run first. This is your finished "seal behind" program from last time, but the floor is longer now. It builds ONE extra room, Party 1 walks into it, and then gets stuck — there are no more rooms ahead. Your job is to turn this one-time builder into a loop that keeps making rooms as the guest walks.',
    'The whole trick is one VARIABLE, named "room", that remembers which room the guest is standing in right now. Because it is a variable, the SAME few blocks can build every room, not just the first one. A room is always a 2×2 square of cells.',
    'Set up that variable. In the "when simulation starts" script, drag in a VARIABLES block "set ___ to ___" and drop it just under "set every wall to closed". Type the name "room". For its value, use SENSING "room at x:1 y:1" (that is the cell the guest starts in). Now "room" points at the guest\'s first room.',
    'Make the first "open room from ___ to ___" block follow the variable instead of fixed numbers. Right now its two boxes say x:1 y:1 and x:2 y:2. Change them to:  first box → VARIABLES "value of a variable" set to "room";  second box → SENSING "room east of ( room south of ( room ) )". That second box just means "from room, step one down, then one right" — which lands on the opposite (bottom-right) corner of the 2×2. To build it: drag one "room ___ of ___" block into another, then drop a "value of a variable → room" into the innermost box. Now this block opens a 2×2 room wherever "room" points.',
    'Delete the leftover hand-made room. Remove the SECOND "open room" block (the one for x:3 y:1 to x:4 y:2) and the "carve corridor" block right under it. Those built the one extra room by hand — the loop will build rooms for us now, so we do not need them here.',
    'Now switch to the "every tick" script. At the very TOP, add another VARIABLES "set ___ to ___". Name this one "ahead" — it will point at where the NEXT room should go, which is two cells east of "room". Set its value to SENSING "room east of ( room east of ( room ) )", with a "value of a variable → room" in the innermost box.',
    'Change the "if … then" you already have (the one that seals the room once it is empty) into CONTROL "if … then … else …". This lets you do one thing when the guest has LEFT its room and a different thing while it is still inside. For the check, use the variable: SENSING "is area ( room ) to ( room east of ( room south of ( room ) ) ) empty?" — this asks "has the guest walked out of its room yet?".',
    'Fill the "then" part (guest HAS left its room): keep the "seal every wall" block, but point it at the variable — "seal every wall from ( room ) to ( room east of ( room south of ( room ) ) )". Under it add VARIABLES "set room to ( value of a variable → ahead )". Together this recycles the room the guest just left and moves the "room" marker forward to the next one.',
    'Fill the "else" part (guest is STILL in its room): add CONTROL "if … then" with the check SENSING "is every wall from ( ahead ) to ( room east of ( room south of ( ahead ) ) ) closed?" — this asks "is the space ahead still blank, unbuilt canvas?". Inside that "if", add two BUILD blocks: "open room from ( ahead ) to ( room east of ( room south of ( ahead ) ) )" to build the next 2×2 room, and "carve corridor from ( room east of ( room ) ) to ( ahead )" to cut a doorway from the current room into it.',
    'Leave the move block ("move party 1 to next free step toward goal of party 1") as the LAST block in "every tick", and keep it pointed at the GOAL — not at "ahead". The guest keeps heading for the exit while the generator opens the path in front of it.',
    'Press Run. Party 1 now rolls room by room all the way across the floor: a fresh room opens just ahead of it, and each room it leaves seals shut behind it — a park that rebuilds itself as the guest travels. (Stuck? Use "Show me the finished code" below to see the whole answer, then Undo to get your own version back.)',
  ],
  world: world({
    width: 12,
    height: 3,
    parties: [{ start: { x: 1, y: 1 }, goal: { x: 9, y: 1 } }],
  }),
  starterProgram: lesson18Solved,
  success: [
    { type: 'used_block', blockType: 'seal_area', label: 'Seal each room behind' },
    { type: 'area_sealed', cellA: { x: 1, y: 1 }, cellB: { x: 2, y: 2 }, label: 'The first room recycled' },
    { type: 'area_sealed', cellA: { x: 5, y: 1 }, cellB: { x: 6, y: 2 }, label: 'A middle room recycled behind the guest' },
    { type: 'party_at', partyId: 'p1', cell: { x: 9, y: 1 }, label: 'Party 1 rolls all the way to the exit' },
    { type: 'within_ticks', n: 18, label: 'Keeps a healthy pace' },
  ],
  hints: [
    'Where to find each block: "set … to …" and "value of a variable" are in VARIABLES · "room … of …", "is area … empty?", "is every wall … closed?" are in SENSING · "open room", "carve corridor", "seal every wall" are in BUILD · "if … then" and "if … then … else …" are in CONTROL.',
    '"room … of …" (for example "room east of …") points at the room next door in that direction. Chaining them lets you describe a room by stepping from another one, instead of typing fixed x/y numbers.',
    '"room east of ( room south of ( room ) )" is just: from a room, step one down, then one right — that lands on the bottom-right corner of its 2×2 box. You reuse this same shape wherever a block needs the room\'s far corner.',
    'The big idea: "room" is wherever the guest is right now; "ahead" is the room two cells east of it. Because both are variables, the very same blocks build every room, not just the first one.',
    'Each tick asks one question: has the guest LEFT its room yet? If YES → seal that room and set "room" to "ahead" (move forward). If NO → build "ahead", but only if that space is still blank canvas.',
    'Keep the move block pointed at the GOAL (not at "ahead"), so the guest heads for the exit while the generator opens the way in front of it.',
  ],
}

// --- Lesson 20: a menu of room shapes (2×2 / hallway / L) --------------------
// The solved form is Lesson 19's roller with the single "open room" stamp
// replaced by a random pick among three shapes; every shape keeps the east-west
// spine open (cells at the anchor row) so the guest can always pass through, and
// all fit inside the 2×2 box that seal_area recycles.
const lesson20 = {
  id: 'a-menu-of-shapes',
  title: 'A Menu of Room Shapes',
  story:
    "Every room so far has been the same boring 2×2 square. Real dungeons mix it up — big rooms, little hallways, L-shaped corners. Give your generator a MENU: each time it builds the next room, it rolls a die and picks one of three shapes. Same rolling machine, but now every run of the park looks different.",
  instructions: [
    'Press Run first. This is your finished rolling generator from last lesson. Every time it builds the next room it opens the same 2×2 square. This time you will let it roll a die and pick a different shape each time.',
    'Find the "open room" block that builds the next room — it lives inside the "if is every wall of ahead closed?" part of "every tick". Just ABOVE it, add VARIABLES "set shape to ( random 1 to 3 )". Now "shape" holds a 1, 2, or 3, chosen at random each time.',
    'Replace that single "open room" with THREE choices, so the die decides which shape gets built. Wrap each in its own CONTROL "if … then", with the check OPERATORS "shape = 1" (then "shape = 2", then "shape = 3"):  if shape = 1 → "open room from ( ahead ) to ( room east of ( room south of ( ahead ) ) )" (a 2×2 square);  if shape = 2 → "open room from ( ahead ) to ( room east of ( ahead ) )" (a short 1-tall hallway);  if shape = 3 → "open room from ( ahead ) to ( room east of ( ahead ) )", then a second "open room from ( room east of ( ahead ) ) to ( room south of ( room east of ( ahead ) ) )" (an L-shape).',
    'Leave the "carve corridor" block right after the three choices. Every shape opens the same left-hand cell, so the doorway lands in the same spot no matter which shape was picked — the guest always gets through.',
    'Run it a few times (press Reset, then Run again between tries). Party 1 still rolls all the way to the exit, but the rooms it passes through are a different mix of squares, hallways and L-shapes each run. (Want the full answer? Use "Show me the finished code" below, then Undo to return to yours.)',
  ],
  world: world({
    width: 12,
    height: 3,
    parties: [{ start: { x: 1, y: 1 }, goal: { x: 9, y: 1 } }],
  }),
  starterProgram: lesson19Solved,
  success: [
    { type: 'used_block', blockType: 'random_number', label: 'Roll a die to pick a shape' },
    { type: 'party_at', partyId: 'p1', cell: { x: 9, y: 1 }, label: 'Party 1 still rolls to the exit' },
    { type: 'area_sealed', cellA: { x: 1, y: 1 }, cellB: { x: 2, y: 2 }, label: 'Rooms still recycle behind it' },
    { type: 'within_ticks', n: 22, label: 'Keeps a healthy pace' },
  ],
  hints: [
    'Where to find each block: "random 1 to 3" is "random number" in SENSING · "shape = 1" uses "=" in OPERATORS · "open room" is in BUILD · "if … then" is in CONTROL.',
    'Every shape has to include the row the guest walks along (the same row "ahead" sits on), or the guest cannot get through. That is why all three shapes start at "ahead" and open eastward from there.',
    'You only need ONE "carve corridor" block, after all three "if shape = …" choices. The doorway is in the same place for every shape, so it does not need to change.',
    'You do not touch the sealing at all. "seal every wall" still recycles the whole 2×2 box, and every shape fits inside that box, so each one gets cleaned up behind the guest just like before.',
  ],
}

// --- Worked-out solutions (used by the "Show me the finished code" button) ---
// Each is a real, valid program that passes its lesson's success checks (the
// same programs the test suite runs in scripts/lessons.test.mjs). Only lessons
// that have one wired below show the button; the rest simply hide it.

// Lesson 16 solved = the trail starter with the "only add a cell the first time
// the guest visits it" guard filled in.
const lesson16Solved = createProgram([
  createScript('event_tick', [
    b('if', { cond: b('op_not', { a: b('list_contains', { name: lit('trail'), value: posOf() }) }) }, {
      body: [b('list_add', { value: posOf(), name: lit('trail') })],
    }),
    b('move_party', { party: firstParty(), cell: b('next_step_toward', { party: firstParty(), cell: goalOf() }) }),
    b('say', { party: firstParty(), text: b('list_length', { name: lit('trail') }) }),
  ]),
])

// Lesson 20 solved = Lesson 19's roller, but the single "open room" stamp is
// replaced by a die roll (random 1..3) that picks one of three room shapes.
const lesson20Solved = {
  version: 1,
  scripts: [
    createScript('event_start', [
      b('reset_all_walls', { state: lit('closed') }),
      b('set_var', { name: lit('room'), value: at(1, 1) }),
      b('open_area', { cellA: gv('room'), cellB: roomFar(gv('room')) }),
    ]),
    createScript('event_tick', [
      b('set_var', { name: lit('ahead'), value: roomAt(gv('room'), lit('east')) }),
      b('if_else', { cond: b('is_area_clear', { cellA: gv('room'), cellB: roomFar(gv('room')) }) }, {
        body: [
          b('seal_area', { cellA: gv('room'), cellB: roomFar(gv('room')) }),
          b('set_var', { name: lit('room'), value: gv('ahead') }),
        ],
        elseBody: [
          b('if', { cond: b('is_area_sealed', { cellA: gv('ahead'), cellB: roomFar(gv('ahead')) }) }, {
            body: [
              b('set_var', { name: lit('shape'), value: b('random_number', { min: lit(1), max: lit(3) }) }),
              b('if', { cond: b('op_equals', { a: gv('shape'), b: lit(1) }) }, {
                body: [b('open_area', { cellA: gv('ahead'), cellB: roomFar(gv('ahead')) })],
              }),
              b('if', { cond: b('op_equals', { a: gv('shape'), b: lit(2) }) }, {
                body: [b('open_area', { cellA: gv('ahead'), cellB: nbrOf('east', gv('ahead')) })],
              }),
              b('if', { cond: b('op_equals', { a: gv('shape'), b: lit(3) }) }, {
                body: [
                  b('open_area', { cellA: gv('ahead'), cellB: nbrOf('east', gv('ahead')) }),
                  b('open_area', { cellA: nbrOf('east', gv('ahead')), cellB: nbrOf('south', nbrOf('east', gv('ahead'))) }),
                ],
              }),
              b('carve_corridor', { cellA: nbrOf('east', gv('room')), cellB: gv('ahead') }),
            ],
          }),
        ],
      }),
      moveToGoal(),
    ]),
  ],
}

// Wire each lesson's finished program. Done here (after every lesson + solved
// form is defined) so we never reference a `const` before its declaration.
lesson16.solutionProgram = lesson16Solved
lesson17.solutionProgram = lesson18Starter // finishing L17 == L18's starter
lesson18.solutionProgram = lesson18Solved
lesson19.solutionProgram = lesson19Solved
lesson20.solutionProgram = lesson20Solved

export const LESSONS = [
  lesson1,
  lesson2,
  lesson3,
  lesson4,
  lesson5,
  lesson6,
  lesson7,
  lesson8,
  lesson9,
  lesson10,
  lesson11,
  lesson12,
  lesson13,
  lesson14,
  lesson15,
  lesson16,
  lesson17,
  lesson18,
  lesson19,
  lesson20,
]

export function getLessonById(id) {
  return LESSONS.find((lesson) => lesson.id === id) ?? null
}

export function getLessonIndex(id) {
  return LESSONS.findIndex((lesson) => lesson.id === id)
}

export default LESSONS
