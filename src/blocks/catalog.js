// The block catalog: every block type the sandbox understands. This is the
// single source of truth consumed by the editor (palette + slot editors),
// the interpreter (defaults + structural flags), and the reference panel
// (docs). Nothing here touches React or the DOM.

export const CATEGORY_COLORS = {
  events: '#f7c948',
  control: '#f2994a',
  motion: '#4cc9f0',
  sensing: '#39c0c8',
  operators: '#7bd88f',
  variables: '#ff8fa3',
  walls: '#c77dff',
  build: '#b08968',
}

const DIRECTION_OPTIONS = ['north', 'east', 'south', 'west']
const WALL_STATE_OPTIONS = ['open', 'closed', 'auto']

function slot(name, valueType, editor, defaultValue, extra = {}) {
  return { name, valueType, editor, default: defaultValue, ...extra }
}

function numberSlot(name, defaultValue = 0) {
  return slot(name, 'number', 'number', defaultValue)
}

function textSlot(name, defaultValue = '') {
  return slot(name, 'string', 'text', defaultValue)
}

/** A variable-name slot: same string value as a text slot, but the editor
 * renders a dropdown of names already used in the program (plus "new
 * variable…") so the same name is reused instead of retyped. */
function varNameSlot(name, defaultValue = '') {
  return slot(name, 'string', 'varname', defaultValue)
}

function partySlot(name) {
  return slot(name, 'party', 'party', null)
}

function cellSlot(name) {
  // Grid cells are addressed 1-based (cell (1,1) is the first cell).
  return slot(name, 'cell', 'reporter-accepting', { x: 1, y: 1 })
}

function boolSlot(name, defaultValue = false) {
  return slot(name, 'boolean', 'reporter-accepting', defaultValue)
}

function anySlot(name, defaultValue = 0) {
  return slot(name, 'any', 'reporter-accepting', defaultValue)
}

function directionSlot(name, defaultValue = 'north') {
  return slot(name, 'direction', 'dropdown', defaultValue, { options: DIRECTION_OPTIONS })
}

function wallStateSlot(name, defaultValue = 'auto') {
  return slot(name, 'string', 'dropdown', defaultValue, { options: WALL_STATE_OPTIONS })
}

function block(def) {
  return {
    hasBody: false,
    hasElseBody: false,
    isHat: false,
    isReporter: false,
    slots: [],
    ...def,
  }
}

const CATALOG_LIST = [
  // ---- events -------------------------------------------------------
  block({
    type: 'event_start',
    category: 'events',
    labelTemplate: 'when simulation starts',
    isHat: true,
    hasBody: true,
    docs: {
      blurb: "The very first thing that runs, just once, when the sandbox begins (or right after you hit Reset). Use it to set starting variables.",
      example: 'when simulation starts → set score to 0',
    },
  }),
  block({
    type: 'event_tick',
    category: 'events',
    labelTemplate: 'every tick',
    isHat: true,
    hasBody: true,
    docs: {
      blurb: 'A "tick" is one step of the simulation, like one frame of a game. Everything inside this block runs again and again, once per tick — this is where your parties decide where to move.',
      example: 'every tick → move party 1 to the room east of it',
    },
  }),
  block({
    type: 'event_every_n_ticks',
    category: 'events',
    labelTemplate: 'every {n} ticks',
    isHat: true,
    hasBody: true,
    slots: [numberSlot('n', 2)],
    docs: {
      blurb: 'Like "every tick", but skips most ticks — the blocks inside only run once every {n} ticks (tick 0, then {n}, then 2×{n}, and so on). Handy for slowing down just one part of your program without changing the whole simulation speed.',
      example: 'every 5 ticks → say "checking in"',
    },
  }),

  // ---- control --------------------------------------------------------
  block({
    type: 'for_each_party',
    category: 'control',
    labelTemplate: 'for each party',
    hasBody: true,
    docs: {
      blurb: 'Repeats the blocks inside once for every party in the park, one at a time. Inside this block you can use "current party" to mean whichever party is being handled right now.',
      example: 'for each party → move current party toward its goal',
    },
  }),
  block({
    type: 'if',
    category: 'control',
    labelTemplate: 'if {cond} then',
    hasBody: true,
    slots: [boolSlot('cond', false)],
    docs: {
      blurb: 'Only runs the blocks inside if the yes/no question in the socket is true. If it is false, the blocks inside are skipped.',
      example: 'if <is the room east occupied?> then → make the party wait',
    },
  }),
  block({
    type: 'if_else',
    category: 'control',
    labelTemplate: 'if {cond} then … else …',
    hasBody: true,
    hasElseBody: true,
    slots: [boolSlot('cond', false)],
    docs: {
      blurb: 'Checks a yes/no question. If it is true it runs the first set of blocks; if it is false it runs the second set instead. Exactly one side always runs.',
      example: 'if <cell occupied?> then → wait, else → move forward',
    },
  }),
  block({
    type: 'repeat',
    category: 'control',
    labelTemplate: 'repeat {n} times',
    hasBody: true,
    slots: [numberSlot('n', 1)],
    docs: {
      blurb: 'Runs the blocks inside over and over, the number of times you say. Careful: this happens instantly within one tick, not spread over several ticks.',
      example: 'repeat <3> times → say "hi!"',
    },
  }),
  block({
    type: 'stop_script',
    category: 'control',
    labelTemplate: 'stop this script',
    docs: {
      blurb: "Immediately stops running the rest of the current script for this tick. Nothing after it (in this script) happens until the next tick.",
      example: 'if <at goal?> then → stop this script',
    },
  }),

  // ---- motion --------------------------------------------------------
  block({
    type: 'move_party',
    category: 'motion',
    labelTemplate: 'move {party} to {cell}',
    slots: [partySlot('party'), cellSlot('cell')],
    docs: {
      blurb: 'Tells a party "try to be in this room after this tick." The room must be right next door (north/east/south/west) and not behind a closed wall, or the move is ignored and the party waits instead.',
      example: 'move party 1 to <room east of party 1>',
    },
  }),
  block({
    type: 'party_wait',
    category: 'motion',
    labelTemplate: 'make {party} wait',
    slots: [partySlot('party')],
    docs: {
      blurb: 'Tells a party to stay exactly where it is this tick, on purpose. Handy for saying "I mean to stand still" instead of leaving it to chance.',
      example: 'make party 1 wait',
    },
  }),
  block({
    type: 'say',
    category: 'motion',
    labelTemplate: '{party} says {text}',
    slots: [partySlot('party'), textSlot('text', 'Hi!')],
    docs: {
      blurb: 'Pops a little speech bubble over the party in the 3D scene for a moment, and prints the same text to the console. Great for debugging what your program is thinking.',
      example: 'party 1 says "waiting for the hallway"',
    },
  }),

  // ---- sensing --------------------------------------------------------
  block({
    type: 'party_position',
    category: 'sensing',
    labelTemplate: 'position of {party}',
    isReporter: true,
    returns: 'cell',
    slots: [partySlot('party')],
    docs: {
      blurb: 'Reports the room a party is standing in right now, as a room (cell).',
      example: '<position of party 1>',
    },
  }),
  block({
    type: 'party_goal',
    category: 'sensing',
    labelTemplate: 'goal of {party}',
    isReporter: true,
    returns: 'cell',
    slots: [partySlot('party')],
    docs: {
      blurb: "Reports the room a party is trying to reach. If no goal has been set for it yet, this just reports where it already is.",
      example: '<goal of party 1>',
    },
  }),
  block({
    type: 'at_goal',
    category: 'sensing',
    labelTemplate: '{party} at goal?',
    isReporter: true,
    returns: 'boolean',
    slots: [partySlot('party')],
    docs: {
      blurb: 'A yes/no question: is this party currently standing in its goal room?',
      example: 'if <party 1 at goal?> then → stop this script',
    },
  }),
  block({
    type: 'current_party',
    category: 'sensing',
    labelTemplate: 'current party',
    isReporter: true,
    returns: 'party',
    docs: {
      blurb: 'Only makes sense inside a "for each party" block — it means "whichever party this repeat is currently handling." Used outside of one, it does not know what to report.',
      example: 'for each party → move <current party> toward its goal',
    },
  }),
  block({
    type: 'party_number',
    category: 'sensing',
    labelTemplate: 'party # {n}',
    isReporter: true,
    returns: 'party',
    slots: [numberSlot('n', 1)],
    docs: {
      blurb: 'Reports a specific party by its number in the list (1 is the first party, 2 the second, and so on). If that many parties do not exist, it reports nothing.',
      example: '<party # 1>',
    },
  }),
  block({
    type: 'party_count',
    category: 'sensing',
    labelTemplate: 'number of parties',
    isReporter: true,
    returns: 'number',
    docs: {
      blurb: 'Reports how many parties are currently in the park.',
      example: '<number of parties>',
    },
  }),
  block({
    type: 'is_occupied',
    category: 'sensing',
    labelTemplate: 'is {cell} occupied?',
    isReporter: true,
    returns: 'boolean',
    slots: [cellSlot('cell')],
    docs: {
      blurb: 'A yes/no question: is any party standing in this room right now?',
      example: 'if <is <room east> occupied?> then → wait',
    },
  }),
  block({
    type: 'is_reserved',
    category: 'sensing',
    labelTemplate: 'is {cell} reserved?',
    isReporter: true,
    returns: 'boolean',
    slots: [cellSlot('cell')],
    docs: {
      blurb: 'A yes/no question: has any party already called "dibs" on this room this tick using a reserve block? Reservations are cleared at the start of every tick.',
      example: 'if <is <next step> reserved?> then → wait',
    },
  }),
  block({
    type: 'is_area_clear',
    category: 'sensing',
    labelTemplate: 'is area {cellA} to {cellB} empty?',
    isReporter: true,
    returns: 'boolean',
    slots: [cellSlot('cellA'), cellSlot('cellB')],
    docs: {
      blurb: 'A yes/no question: is the whole rectangle of rooms between these two corners empty of parties right now? Use it as a safety check before rebuilding a room, so you never reshape walls on top of a guest.',
      example: 'if <is area <room at x:1 y:3> to <room at x:2 y:4> empty?> then → open room …',
    },
  }),
  block({
    type: 'is_area_sealed',
    category: 'sensing',
    labelTemplate: 'is every wall from {cellA} to {cellB} closed?',
    isReporter: true,
    returns: 'boolean',
    slots: [cellSlot('cellA'), cellSlot('cellB')],
    docs: {
      blurb: 'A yes/no question: is every wall of every room in this rectangle closed — a blank, sealed canvas? True only when nothing can move through any of it. Use it to check a space is free to build into before you stamp a new room there.',
      example: 'if <is every wall from <room at x:1 y:1> to <room at x:2 y:2> closed?> then → open room …',
    },
  }),
  block({
    type: 'is_wall_open',
    category: 'sensing',
    labelTemplate: 'is wall {direction} of {cell} open?',
    isReporter: true,
    returns: 'boolean',
    slots: [directionSlot('direction'), cellSlot('cell')],
    docs: {
      blurb: 'A yes/no question: can you walk through the wall on this side of the room? Closed walls report false; open or automatic walls report true.',
      example: '<is wall east of <position of party 1> open?>',
    },
  }),
  block({
    type: 'neighbor_of',
    category: 'sensing',
    labelTemplate: 'room {direction} of {cell}',
    isReporter: true,
    returns: 'cell',
    slots: [directionSlot('direction'), cellSlot('cell')],
    docs: {
      blurb: 'Reports the room right next door in the direction you pick. If that would fall off the edge of the grid, it reports nothing.',
      example: '<room east of <position of party 1>>',
    },
  }),
  block({
    type: 'next_step_toward',
    category: 'sensing',
    labelTemplate: 'next free step for {party} toward {cell}',
    isReporter: true,
    returns: 'cell',
    slots: [partySlot('party'), cellSlot('cell')],
    docs: {
      blurb: "The smart block! It works out the first room to step into on the shortest safe path toward a target — avoiding closed walls, other parties, and any reserved rooms. If there is no safe path, it reports the party's own room (stay put).",
      example: '<next free step for current party toward <goal of current party>>',
    },
  }),
  block({
    type: 'next_step_toward_or_closest',
    category: 'sensing',
    labelTemplate: 'next free step for {party} toward {cell} (or as close as possible)',
    isReporter: true,
    returns: 'cell',
    slots: [partySlot('party'), cellSlot('cell')],
    docs: {
      blurb: "Almost the same as \"next free step toward\", but it never just gives up. If there is no clear path all the way to the target yet, it still steps as far as it can — right up to the last free room before the blockage — and waits there, instead of standing still. The moment a way opens up, it walks the rest of the journey on its own.",
      example: '<next free step for current party toward <goal of current party> (or as close as possible)>',
    },
  }),
  block({
    type: 'distance_between',
    category: 'sensing',
    labelTemplate: 'distance from {cellA} to {cellB}',
    isReporter: true,
    returns: 'number',
    slots: [cellSlot('cellA'), cellSlot('cellB')],
    docs: {
      blurb: 'Reports how many rooms apart two rooms are, counting only up/down/left/right steps (not diagonal).',
      example: '<distance from <position of party 1> to <goal of party 1>>',
    },
  }),
  block({
    type: 'cell_at',
    category: 'sensing',
    labelTemplate: 'room at x:{x} y:{y}',
    isReporter: true,
    returns: 'cell',
    slots: [numberSlot('x', 1), numberSlot('y', 1)],
    docs: {
      blurb: 'Builds a room out of an x and a y number, so you can refer to an exact spot on the grid. The first cell is x:1 y:1.',
      example: '<room at x:2 y:3>',
    },
  }),
  block({
    type: 'cell_x',
    category: 'sensing',
    labelTemplate: 'x of {cell}',
    isReporter: true,
    returns: 'number',
    slots: [cellSlot('cell')],
    docs: {
      blurb: 'Reports just the x (left-right) number of a room.',
      example: '<x of <position of party 1>>',
    },
  }),
  block({
    type: 'cell_y',
    category: 'sensing',
    labelTemplate: 'y of {cell}',
    isReporter: true,
    returns: 'number',
    slots: [cellSlot('cell')],
    docs: {
      blurb: 'Reports just the y (up-down) number of a room.',
      example: '<y of <position of party 1>>',
    },
  }),
  block({
    type: 'tick_number',
    category: 'sensing',
    labelTemplate: 'tick number',
    isReporter: true,
    returns: 'number',
    docs: {
      blurb: 'Reports how many ticks have happened since the simulation started (or since the last reset). The very first tick is number 0.',
      example: 'if <tick number> > 10 → say "still going"',
    },
  }),
  block({
    type: 'random_number',
    category: 'sensing',
    labelTemplate: 'random {min} to {max}',
    isReporter: true,
    returns: 'number',
    slots: [numberSlot('min', 1), numberSlot('max', 6)],
    docs: {
      blurb: 'Reports a random whole number between the two numbers you give it (both included).',
      example: '<random 1 to 4>',
    },
  }),

  block({
    type: 'random_direction',
    category: 'sensing',
    labelTemplate: 'random direction',
    isReporter: true,
    returns: 'direction',
    docs: {
      blurb: 'Reports one of the four directions — north, east, south, or west — picked at random each time. Handy for making a party wander instead of always heading the same way.',
      example: '<room <random direction> of <position of party 1>>',
    },
  }),

  // ---- operators --------------------------------------------------------
  block({
    type: 'op_add',
    category: 'operators',
    labelTemplate: '{a} + {b}',
    isReporter: true,
    returns: 'number',
    slots: [numberSlot('a', 0), numberSlot('b', 0)],
    docs: { blurb: 'Adds two numbers together.', example: '<2> + <3> reports 5' },
  }),
  block({
    type: 'op_subtract',
    category: 'operators',
    labelTemplate: '{a} - {b}',
    isReporter: true,
    returns: 'number',
    slots: [numberSlot('a', 0), numberSlot('b', 0)],
    docs: { blurb: 'Subtracts the second number from the first.', example: '<5> - <2> reports 3' },
  }),
  block({
    type: 'op_multiply',
    category: 'operators',
    labelTemplate: '{a} × {b}',
    isReporter: true,
    returns: 'number',
    slots: [numberSlot('a', 0), numberSlot('b', 0)],
    docs: { blurb: 'Multiplies two numbers together.', example: '<2> × <3> reports 6' },
  }),
  block({
    type: 'op_equals',
    category: 'operators',
    labelTemplate: '{a} = {b}',
    isReporter: true,
    returns: 'boolean',
    slots: [anySlot('a', 0), anySlot('b', 0)],
    docs: {
      blurb: 'A yes/no question: are these two values exactly the same? Works for numbers, text, and rooms (rooms match if their x and y are both the same).',
      example: '<position of party 1> = <goal of party 1>',
    },
  }),
  block({
    type: 'op_greater',
    category: 'operators',
    labelTemplate: '{a} > {b}',
    isReporter: true,
    returns: 'boolean',
    slots: [numberSlot('a', 0), numberSlot('b', 0)],
    docs: { blurb: 'A yes/no question: is the first number bigger than the second?', example: '<tick number> > <10>' },
  }),
  block({
    type: 'op_less',
    category: 'operators',
    labelTemplate: '{a} < {b}',
    isReporter: true,
    returns: 'boolean',
    slots: [numberSlot('a', 0), numberSlot('b', 0)],
    docs: { blurb: 'A yes/no question: is the first number smaller than the second?', example: '<tick number> < <10>' },
  }),
  block({
    type: 'op_and',
    category: 'operators',
    labelTemplate: '{a} and {b}',
    isReporter: true,
    returns: 'boolean',
    slots: [boolSlot('a', false), boolSlot('b', false)],
    docs: { blurb: 'A yes/no question: are both of these true?', example: '<at goal?> and <tick number> > <5>' },
  }),
  block({
    type: 'op_or',
    category: 'operators',
    labelTemplate: '{a} or {b}',
    isReporter: true,
    returns: 'boolean',
    slots: [boolSlot('a', false), boolSlot('b', false)],
    docs: { blurb: 'A yes/no question: is at least one of these true?', example: '<is occupied?> or <is reserved?>' },
  }),
  block({
    type: 'op_not',
    category: 'operators',
    labelTemplate: 'not {a}',
    isReporter: true,
    returns: 'boolean',
    slots: [boolSlot('a', false)],
    docs: { blurb: 'Flips a yes/no answer: true becomes false, and false becomes true.', example: 'not <is occupied?>' },
  }),

  // ---- variables --------------------------------------------------------
  block({
    type: 'set_var',
    category: 'variables',
    labelTemplate: 'set {name} to {value}',
    slots: [varNameSlot('name', 'my_variable'), anySlot('value', 0)],
    docs: {
      blurb: 'Creates a variable (a named box that holds a value) if it does not exist yet, and puts a value in it. Variables are shared by the whole program and reset when you hit Reset.',
      example: 'set <score> to <0>',
    },
  }),
  block({
    type: 'change_var',
    category: 'variables',
    labelTemplate: 'change {name} by {n}',
    slots: [varNameSlot('name', 'my_variable'), numberSlot('n', 1)],
    docs: {
      blurb: 'Adds a number to a variable (use a negative number to subtract). If the variable does not have a number in it yet, it starts from 0.',
      example: 'change <score> by <1>',
    },
  }),
  block({
    type: 'get_var',
    category: 'variables',
    labelTemplate: '{name}',
    menuLabel: 'value of a variable',
    isReporter: true,
    returns: 'any',
    slots: [varNameSlot('name', 'my_variable')],
    docs: {
      blurb: 'Reports whatever value is currently stored in a variable.',
      example: '<score>',
    },
  }),

  // ---- variables: lists (a variable that holds many things) ------------
  block({
    type: 'list_add',
    category: 'variables',
    labelTemplate: 'add {value} to list {name}',
    slots: [anySlot('value', 0), varNameSlot('name', 'my_list')],
    docs: {
      blurb: 'A list is a variable that holds many values in a row instead of just one. This block puts a new value at the end of the list, making the list one longer. If the list does not exist yet, it starts a fresh empty one first.',
      example: 'add <position of party 1> to list <visited>',
    },
  }),
  block({
    type: 'list_length',
    category: 'variables',
    labelTemplate: 'length of list {name}',
    isReporter: true,
    returns: 'number',
    slots: [varNameSlot('name', 'my_list')],
    docs: {
      blurb: 'Reports how many values are in a list right now. An empty list (or a name that is not a list yet) reports 0.',
      example: '<length of list <visited>>',
    },
  }),
  block({
    type: 'list_item',
    category: 'variables',
    labelTemplate: 'item {index} of list {name}',
    isReporter: true,
    returns: 'any',
    slots: [numberSlot('index', 1), varNameSlot('name', 'my_list')],
    docs: {
      blurb: 'Reports one value out of a list, counting from 1 — item 1 is the first thing added that is still in the list. Asking for an item that is not there reports nothing.',
      example: '<item <1> of list <visited>>',
    },
  }),
  block({
    type: 'list_contains',
    category: 'variables',
    labelTemplate: 'list {name} contains {value}?',
    isReporter: true,
    returns: 'boolean',
    slots: [varNameSlot('name', 'my_list'), anySlot('value', 0)],
    docs: {
      blurb: 'A yes/no question: is this value already somewhere in the list? Works for numbers, text, and rooms (rooms match if their x and y are both the same), so you can ask "have I already visited this room?".',
      example: 'if <list <visited> contains <position of party 1>?> then → …',
    },
  }),
  block({
    type: 'list_random',
    category: 'variables',
    labelTemplate: 'random item of list {name}',
    isReporter: true,
    returns: 'any',
    slots: [varNameSlot('name', 'my_list')],
    docs: {
      blurb: 'Reports one value picked at random from a list. If the list is empty it reports nothing.',
      example: '<random item of list <choices>>',
    },
  }),
  block({
    type: 'list_remove',
    category: 'variables',
    labelTemplate: 'remove item {index} from list {name}',
    slots: [numberSlot('index', 1), varNameSlot('name', 'my_list')],
    docs: {
      blurb: 'Takes one value out of a list by its position (counting from 1). Everything after it shifts up to fill the gap, so the list gets one shorter. Asking to remove an item that is not there does nothing.',
      example: 'remove item <1> from list <queue>',
    },
  }),
  block({
    type: 'list_is_empty',
    category: 'variables',
    labelTemplate: 'list {name} is empty?',
    isReporter: true,
    returns: 'boolean',
    slots: [varNameSlot('name', 'my_list')],
    docs: {
      blurb: 'A yes/no question: does this list have nothing in it? A brand-new list (or a name that is not a list yet) counts as empty.',
      example: 'if <list <queue> is empty?> then → stop this script',
    },
  }),
  block({
    type: 'list_clear',
    category: 'variables',
    labelTemplate: 'clear list {name}',
    slots: [varNameSlot('name', 'my_list')],
    docs: {
      blurb: 'Empties a list completely, throwing away everything in it so its length is 0 again. Handy for starting a list over.',
      example: 'clear list <visited>',
    },
  }),

  // ---- walls --------------------------------------------------------
  block({
    type: 'set_wall',
    category: 'walls',
    labelTemplate: 'set wall {direction} of {cell} to {state}',
    slots: [directionSlot('direction'), cellSlot('cell'), wallStateSlot('state')],
    docs: {
      blurb: "Changes whether a wall is open, closed, or automatic. This change sticks around until you change it again — great for building gates that open and close.",
      example: 'set wall east of <room at x:2 y:2> to <open>',
    },
  }),
  block({
    type: 'reserve_cell',
    category: 'walls',
    labelTemplate: 'reserve {cell}',
    slots: [cellSlot('cell')],
    docs: {
      blurb: "Calls \"dibs\" on a room for the rest of this tick, so other parties can check <is reserved?> before walking into the same spot. This is how you teach parties to take turns instead of colliding.",
      example: 'reserve <next free step for current party toward <goal of current party>>',
    },
  }),

  // ---- build (shape the building itself) ------------------------------
  block({
    type: 'open_area',
    category: 'build',
    labelTemplate: 'open room from {cellA} to {cellB}',
    slots: [cellSlot('cellA'), cellSlot('cellB')],
    docs: {
      blurb: 'Hinges open every inside wall of the rectangle between these two corner rooms, fusing all those little squares into one big open room. This is how you make rooms bigger than a single square.',
      example: 'open room from <room at x:1 y:1> to <room at x:2 y:2>',
    },
  }),
  block({
    type: 'seal_area',
    category: 'build',
    labelTemplate: 'seal every wall from {cellA} to {cellB}',
    slots: [cellSlot('cellA'), cellSlot('cellB')],
    docs: {
      blurb: 'The opposite of "open room": closes EVERY wall — inside and outside — of every room in the rectangle, turning it back into blank, sealed squares. Use it to recycle a room once a guest has left, so the space is empty canvas again for new building.',
      example: 'seal every wall from <room at x:1 y:1> to <room at x:2 y:2>',
    },
  }),
  block({
    type: 'close_border',
    category: 'build',
    labelTemplate: 'wall off room from {cellA} to {cellB}',
    slots: [cellSlot('cellA'), cellSlot('cellB')],
    docs: {
      blurb: 'Closes every wall around the outside edge of the rectangle between these two corners, sealing it off as its own room. Leave a way in with a "set wall … to open" door, or nobody can enter.',
      example: 'wall off room from <room at x:1 y:1> to <room at x:3 y:3>',
    },
  }),
  block({
    type: 'carve_corridor',
    category: 'build',
    labelTemplate: 'carve corridor from {cellA} to {cellB}',
    slots: [cellSlot('cellA'), cellSlot('cellB')],
    docs: {
      blurb: 'Hinges open a line of doors that connect the two rooms — straight across, then straight up or down — carving a hallway between them. Great for linking rooms after you seal them off.',
      example: 'carve corridor from <room at x:1 y:1> to <room at x:5 y:5>',
    },
  }),
  block({
    type: 'reset_all_walls',
    category: 'build',
    labelTemplate: 'set every wall to {state}',
    slots: [wallStateSlot('state', 'closed')],
    docs: {
      blurb: 'Sets every wall in the whole building at once — usually to "closed", giving you a blank grid of sealed squares to carve rooms and corridors out of. This is the "start from scratch" block for building floor plans.',
      example: 'set every wall to closed',
    },
  }),
]

export const BLOCK_CATALOG = Object.fromEntries(
  CATALOG_LIST.map((entry) => [entry.type, entry]),
)

export function getBlockDef(type) {
  return BLOCK_CATALOG[type] ?? null
}

export function listBlocksByCategory(category) {
  return CATALOG_LIST.filter((entry) => entry.category === category)
}

export const CATEGORIES = Array.from(new Set(CATALOG_LIST.map((entry) => entry.category)))

export default BLOCK_CATALOG
