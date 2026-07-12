import test from 'node:test'
import assert from 'node:assert/strict'

import { LESSONS, getLessonById, getLessonIndex } from '../src/teach/lessons.js'
import { evaluateChecks, isLessonComplete, startAttempt, advanceAttempt, resetAttempt } from '../src/teach/lessonRunner.js'
import { validate, createBlock, createProgram, createScript } from '../src/blocks/ast.js'
import { findPath } from '../src/engine/pathfinding.js'
import { runTick } from '../src/blocks/interpreter.js'

function lit(value) {
  return { literal: true, value }
}

function b(type, inputs = {}, extra = {}) {
  const block = createBlock(type)
  for (const [key, value] of Object.entries(inputs)) {
    block.inputs[key] = value
  }
  if (extra.body) block.body = extra.body
  if (extra.elseBody) block.elseBody = extra.elseBody
  return block
}

function runProgram(program, world, ticks, runtime = { strict: false }) {
  let currentWorld = world
  const history = []
  for (let i = 0; i < ticks; i += 1) {
    const result = runTick(program, currentWorld, runtime)
    if (result.error) throw new Error(`interpreter error at tick ${i}: ${JSON.stringify(result.error)}`)
    currentWorld = result.world
    history.push(result)
  }
  return { world: currentWorld, history }
}

// -- structural checks: every lesson --------------------------------------

test('there are 20 lessons', () => {
  assert.equal(LESSONS.length, 20)
})

test('getLessonById / getLessonIndex work', () => {
  assert.equal(getLessonById('hello-party').id, 'hello-party')
  assert.equal(getLessonById('nope'), null)
  assert.equal(getLessonIndex('hello-party'), 0)
  assert.equal(getLessonIndex('full-brain'), 9)
})

for (const lesson of LESSONS) {
  test(`lesson "${lesson.id}": starter program is a valid AST`, () => {
    const result = validate(lesson.starterProgram)
    assert.equal(result.valid, true, JSON.stringify(result.errors))
  })

  test(`lesson "${lesson.id}": world is well-formed and parties are in bounds`, () => {
    const { grid, rooms, parties } = lesson.world
    assert.ok(grid.width > 0 && grid.height > 0)
    assert.ok(Object.keys(rooms).length === grid.width * grid.height)
    assert.ok(parties.length > 0)
    for (const party of parties) {
      assert.ok(party.position.x >= 1 && party.position.x <= grid.width, `${party.id} x in bounds`)
      assert.ok(party.position.y >= 1 && party.position.y <= grid.height, `${party.id} y in bounds`)
      if (party.goal) {
        assert.ok(party.goal.x >= 1 && party.goal.x <= grid.width, `${party.id} goal x in bounds`)
        assert.ok(party.goal.y >= 1 && party.goal.y <= grid.height, `${party.id} goal y in bounds`)
      }
    }
  })

  test(`lesson "${lesson.id}": every party with a goal can reach it (BFS)`, () => {
    const { grid, rooms, parties } = lesson.world
    for (const party of parties) {
      if (!party.goal) continue
      const path = findPath(party.position, [party.goal], grid, rooms, new Set())
      assert.ok(path, `${party.id} (${lesson.id}) should have a path from start to goal`)
    }
  })

  test(`lesson "${lesson.id}": has instructions, hints, and success checks`, () => {
    assert.ok(lesson.instructions.length > 0)
    assert.ok(lesson.hints.length > 0)
    assert.ok(lesson.success.length > 0)
  })
}

// -- lessons 1-6: intended solutions actually complete ----------------------

test('lesson 1 (hello-party): intended solution reaches the goal', () => {
  const lesson = getLessonById('hello-party')
  const firstParty = () => b('party_number', { n: lit(1) })
  const posOf = () => b('party_position', { party: firstParty() })
  const program = createProgram([
    createScript('event_tick', [
      b('move_party', {
        party: firstParty(),
        cell: b('neighbor_of', { direction: lit('east'), cell: posOf() }),
      }),
    ]),
  ])
  assert.equal(validate(program).valid, true)

  const { world, history } = runProgram(program, lesson.world, 10)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
  assert.ok(isLessonComplete(lesson, world, history, program))
})

test('lesson 2 (walk-the-line): intended solution stops at the closed wall', () => {
  const lesson = getLessonById('walk-the-line')
  const firstParty = () => b('party_number', { n: lit(1) })
  const posOf = () => b('party_position', { party: firstParty() })
  const program = createProgram([
    createScript('event_tick', [
      b('if', {
        cond: b('is_wall_open', { direction: lit('east'), cell: posOf() }),
      }, {
        body: [
          b('move_party', {
            party: firstParty(),
            cell: b('neighbor_of', { direction: lit('east'), cell: posOf() }),
          }),
        ],
      }),
    ]),
  ])
  assert.equal(validate(program).valid, true)

  const { world, history } = runProgram(program, lesson.world, 10)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

test('lesson 3 (getting-somewhere): intended solution walks to goal via next_step_toward', () => {
  const lesson = getLessonById('getting-somewhere')
  const firstParty = () => b('party_number', { n: lit(1) })
  const goalOf = () => b('party_goal', { party: firstParty() })
  const program = createProgram([
    createScript('event_tick', [
      b('move_party', {
        party: firstParty(),
        cell: b('next_step_toward', { party: firstParty(), cell: goalOf() }),
      }),
    ]),
  ])
  assert.equal(validate(program).valid, true)

  const { world, history } = runProgram(program, lesson.world, 15)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

test('lesson 4 (if-this-then-that): intended solution waits beside the parked party', () => {
  const lesson = getLessonById('if-this-then-that')
  const firstParty = () => b('party_number', { n: lit(1) })
  const posOf = () => b('party_position', { party: firstParty() })
  const ahead = () => b('neighbor_of', { direction: lit('east'), cell: posOf() })
  const program = createProgram([
    createScript('event_tick', [
      b('if_else', {
        cond: b('is_occupied', { cell: ahead() }),
      }, {
        body: [b('party_wait', { party: firstParty() })],
        elseBody: [b('move_party', { party: firstParty(), cell: ahead() })],
      }),
    ]),
  ])
  assert.equal(validate(program).valid, true)

  const { world, history } = runProgram(program, lesson.world, 10)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

test('lesson 5 (two-parties-one-hallway): intended solution avoids the collision', () => {
  const lesson = getLessonById('two-parties-one-hallway')
  const firstParty = () => b('party_number', { n: lit(1) })
  const posOf1 = () => b('party_position', { party: firstParty() })
  const ahead1 = () => b('neighbor_of', { direction: lit('east'), cell: posOf1() })
  const secondParty = () => b('party_number', { n: lit(2) })
  const posOf2 = () => b('party_position', { party: secondParty() })
  const ahead2 = () => b('neighbor_of', { direction: lit('west'), cell: posOf2() })

  const program = createProgram([
    createScript('event_tick', [
      b('if_else', {
        cond: b('is_occupied', { cell: ahead1() }),
      }, {
        body: [b('party_wait', { party: firstParty() })],
        elseBody: [b('move_party', { party: firstParty(), cell: ahead1() })],
      }),
    ]),
    createScript('event_tick', [
      b('if_else', {
        cond: b('is_occupied', { cell: ahead2() }),
      }, {
        body: [b('party_wait', { party: secondParty() })],
        elseBody: [b('move_party', { party: secondParty(), cell: ahead2() })],
      }),
    ]),
  ])
  assert.equal(validate(program).valid, true)

  const { world, history } = runProgram(program, lesson.world, 10)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

test('lesson 6 (reservations-101): intended solution routes all 4 parties with zero violations', () => {
  const lesson = getLessonById('reservations-101')
  const currentParty = () => b('current_party')
  const goalOfCurrent = () => b('party_goal', { party: currentParty() })
  const nextStep = () => b('next_step_toward', { party: currentParty(), cell: goalOfCurrent() })
  const nextVar = () => b('get_var', { name: lit('next') })

  const program = createProgram([
    createScript('event_tick', [
      b('for_each_party', {}, {
        body: [
          b('set_var', { name: lit('next'), value: nextStep() }),
          b('reserve_cell', { cell: nextVar() }),
          b('move_party', { party: currentParty(), cell: nextVar() }),
        ],
      }),
    ]),
  ])
  assert.equal(validate(program).valid, true)

  const { world, history } = runProgram(program, lesson.world, 40)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

// -- lessons 7-10: intended solutions actually complete ---------------------

test('lesson 7 (swap-trap): reserving your own room stops the swap', () => {
  const lesson = getLessonById('swap-trap')
  const currentParty = () => b('current_party')
  const goalOfCurrent = () => b('party_goal', { party: currentParty() })
  const nextStep = () => b('next_step_toward', { party: currentParty(), cell: goalOfCurrent() })
  const nextVar = () => b('get_var', { name: lit('next') })
  const program = createProgram([
    createScript('event_tick', [
      b('for_each_party', {}, {
        body: [
          b('set_var', { name: lit('next'), value: nextStep() }),
          b('reserve_cell', { cell: nextVar() }),
          b('reserve_cell', { cell: b('party_position', { party: currentParty() }) }),
          b('move_party', { party: currentParty(), cell: nextVar() }),
        ],
      }),
    ]),
  ])
  assert.equal(validate(program).valid, true)
  const { world, history } = runProgram(program, lesson.world, 30)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

test('lesson 8 (open-sesame): the starter brain detours around the closed wall', () => {
  const lesson = getLessonById('open-sesame')
  // The intended solution IS the starter as-is (next_step_toward auto-routes).
  const program = lesson.starterProgram
  assert.equal(validate(program).valid, true)
  const { world, history } = runProgram(program, lesson.world, 30)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

test('lesson 9 (zones): flipping a variable at zone A sends the party to zone B', () => {
  const lesson = getLessonById('zones')
  const firstParty = () => b('party_number', { n: lit(1) })
  const posOf = () => b('party_position', { party: firstParty() })
  const program = createProgram([
    createScript('event_tick', [
      b('if', {
        cond: b('op_equals', { a: posOf(), b: b('cell_at', { x: lit(3), y: lit(1) }) }),
      }, {
        body: [b('set_var', { name: lit('visitedFirst'), value: lit(1) })],
      }),
      b('if_else', {
        cond: b('get_var', { name: lit('visitedFirst') }),
      }, {
        body: [b('move_party', { party: firstParty(), cell: b('next_step_toward', { party: firstParty(), cell: b('cell_at', { x: lit(5), y: lit(5) }) }) })],
        elseBody: [b('move_party', { party: firstParty(), cell: b('next_step_toward', { party: firstParty(), cell: b('cell_at', { x: lit(3), y: lit(1) }) }) })],
      }),
    ]),
  ])
  assert.equal(validate(program).valid, true)
  const { world, history } = runProgram(program, lesson.world, 25)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

test('lesson 10 (full-brain): the starter routes all 4 parties home with no violations', () => {
  const lesson = getLessonById('full-brain')
  // The intended solution IS the starter (reserve next + reserve own + move).
  const program = lesson.starterProgram
  assert.equal(validate(program).valid, true)
  const { world, history } = runProgram(program, lesson.world, 40)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

// -- lessons 11-15: build track, intended solutions complete ----------------

const at = (x, y) => b('cell_at', { x: lit(x), y: lit(y) })
const firstParty = () => b('party_number', { n: lit(1) })
const moveToward = (target) =>
  b('move_party', { party: firstParty(), cell: b('next_step_toward', { party: firstParty(), cell: target }) })
const closeWall = (direction, x, y) =>
  b('set_wall', { direction: lit(direction), cell: at(x, y), state: lit('closed') })

test('lesson 11 (big-rooms): open_area undoes the visible seal blocks so the party crosses', () => {
  const lesson = getLessonById('big-rooms')
  // Intended solution = starter's four seal blocks + open_area appended.
  const program = createProgram([
    createScript('event_start', [
      closeWall('east', 1, 1),
      closeWall('south', 1, 1),
      closeWall('east', 1, 2),
      closeWall('south', 2, 1),
      b('open_area', { cellA: at(1, 1), cellB: at(2, 2) }),
    ]),
    createScript('event_tick', [moveToward(at(2, 2))]),
  ])
  assert.equal(validate(program).valid, true)
  const { world, history } = runProgram(program, lesson.world, 6)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

test('lesson 11 (big-rooms): WITHOUT open_area the seal blocks trap the party (rule is real)', () => {
  const lesson = getLessonById('big-rooms')
  // Just the starter, unsolved: the seal blocks must actually strand the party.
  const { world } = runProgram(lesson.starterProgram, lesson.world, 6)
  const p1 = world.parties.find((p) => p.id === 'p1')
  assert.deepEqual(p1.position, { x: 1, y: 1 }, 'party should be stuck in the corner without open_area')
})

test('lesson 12 (hallways): carve_corridor punches through the visible barrier', () => {
  const lesson = getLessonById('hallways')
  const program = createProgram([
    createScript('event_start', [
      closeWall('east', 3, 1),
      closeWall('east', 3, 2),
      closeWall('east', 3, 3),
      b('carve_corridor', { cellA: at(2, 2), cellB: at(4, 2) }),
    ]),
    createScript('event_tick', [moveToward(at(4, 2))]),
  ])
  assert.equal(validate(program).valid, true)
  const { world, history } = runProgram(program, lesson.world, 6)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

test('lesson 12 (hallways): WITHOUT carve_corridor the barrier strands the party', () => {
  const lesson = getLessonById('hallways')
  const { world } = runProgram(lesson.starterProgram, lesson.world, 8)
  const p1 = world.parties.find((p) => p.id === 'p1')
  assert.ok(p1.position.x <= 3, 'party should be stuck on the left of the barrier without a corridor')
})

test('lesson 13 (blank-canvas): seal-then-carve gives the party one route', () => {
  const lesson = getLessonById('blank-canvas')
  const program = createProgram([
    createScript('event_start', [
      b('reset_all_walls', { state: lit('closed') }),
      b('carve_corridor', { cellA: at(1, 1), cellB: at(5, 5) }),
    ]),
    createScript('event_tick', [moveToward(at(5, 5))]),
  ])
  assert.equal(validate(program).valid, true)
  const { world, history } = runProgram(program, lesson.world, 12)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

test('lesson 14 (sealed-rooms): close_border + a door lets the party in', () => {
  const lesson = getLessonById('sealed-rooms')
  const program = createProgram([
    createScript('event_start', [
      b('close_border', { cellA: at(2, 2), cellB: at(4, 4) }),
      b('set_wall', { direction: lit('west'), cell: at(2, 3), state: lit('open') }),
    ]),
    createScript('event_tick', [moveToward(at(3, 3))]),
  ])
  assert.equal(validate(program).valid, true)
  const { world, history } = runProgram(program, lesson.world, 8)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

test('lesson 15 (living-park): guarded generation runs while the party reaches the exit', () => {
  const lesson = getLessonById('living-park')
  const program = createProgram([
    createScript('event_start', [
      b('reset_all_walls', { state: lit('closed') }),
      b('carve_corridor', { cellA: at(1, 1), cellB: at(3, 3) }),
      b('carve_corridor', { cellA: at(4, 4), cellB: at(6, 6) }),
    ]),
    createScript('event_tick', [
      b('move_party', {
        party: firstParty(),
        cell: b('next_step_toward_or_closest', { party: firstParty(), cell: at(6, 6) }),
      }),
    ]),
    createScript('event_every_n_ticks', [
      b('if', { cond: b('is_area_clear', { cellA: at(3, 3), cellB: at(4, 4) }) }, {
        body: [b('open_area', { cellA: at(3, 3), cellB: at(4, 4) })],
      }),
    ], { hat: { inputs: { n: lit(3) } } }),
  ])
  assert.equal(validate(program).valid, true)
  // Party walks up to the shut gate and waits, then passes through once it
  // opens; run enough ticks to arrive but stay inside the 20-tick budget.
  const { world, history } = runProgram(program, lesson.world, 16)
  const results = evaluateChecks(lesson, world, history, program)
  for (const r of results) assert.ok(r.passed, `${lesson.id}: "${r.label}" should pass`)
})

// -- lessons 16-20: lists + the rolling recycling ROOM generator -----------

/** Runs `fn` with Math.random replaced by a small deterministic LCG so the
 * randomised generation lessons produce a repeatable run. */
function withSeededRandom(seed, fn) {
  const orig = Math.random
  let s = seed
  Math.random = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  try {
    return fn()
  } finally {
    Math.random = orig
  }
}

// Shared dungeon builders (mirror the ones the lessons build up from).
const gv = (name) => b('get_var', { name: lit(name) })
const posOf = () => b('party_position', { party: firstParty() })
const goalOf = () => b('party_goal', { party: firstParty() })
const nbrOf = (dir, cell) => b('neighbor_of', { direction: typeof dir === 'string' ? lit(dir) : dir, cell })
const roomFar = (a) => nbrOf('east', nbrOf('south', a))
const roomAt = (a, dir) => nbrOf(dir, nbrOf(dir, a))
const moveGoal = () =>
  b('move_party', { party: firstParty(), cell: b('next_step_toward_or_closest', { party: firstParty(), cell: goalOf() }) })

/** True if the lesson's checks all pass within `maxTicks` (stops at the first
 * complete tick, so time-bounded checks like within_ticks are respected). */
function completesWithin(lesson, program, maxTicks) {
  let world = JSON.parse(JSON.stringify(lesson.world))
  const runtime = { variables: {}, strict: false }
  const history = []
  for (let t = 0; t < maxTicks; t += 1) {
    const r = runTick(program, world, runtime)
    if (r.error) throw new Error(`interpreter error at tick ${t}: ${JSON.stringify(r.error)}`)
    history.push(r)
    world = r.world
    if (isLessonComplete(lesson, world, history, program)) return true
  }
  return false
}

test('lesson 16 (lists-basics): add + dedup guard fills the trail to exactly the row length', () => {
  const lesson = getLessonById('lists-basics')
  // Completed solution = starter with the "if not contains → add" guard filled in.
  const program = createProgram([
    createScript('event_tick', [
      b('if', { cond: b('op_not', { a: b('list_contains', { name: lit('trail'), value: posOf() }) }) }, {
        body: [b('list_add', { value: posOf(), name: lit('trail') })],
      }),
      b('move_party', { party: firstParty(), cell: b('next_step_toward', { party: firstParty(), cell: goalOf() }) }),
      b('say', { party: firstParty(), text: b('list_length', { name: lit('trail') }) }),
    ]),
  ])
  assert.equal(validate(program).valid, true)
  assert.ok(completesWithin(lesson, program, 16), 'lists-basics solution should complete')
})

test('lesson 16 (lists-basics): WITHOUT the add block the trail stays empty', () => {
  const lesson = getLessonById('lists-basics')
  const { world, history } = runProgram(lesson.starterProgram, lesson.world, 10)
  const results = evaluateChecks(lesson, world, history, lesson.starterProgram)
  const byType = Object.fromEntries(results.map((r) => [r.check.type, r.passed]))
  assert.equal(byType.list_length_at_least, false)
})

test('lesson 17 (the-next-room): generating the room + gate lets the guest walk in', () => {
  const lesson = getLessonById('the-next-room')
  const program = {
    version: 1,
    scripts: [
      createScript('event_start', [
        b('reset_all_walls', { state: lit('closed') }),
        b('open_area', { cellA: at(1, 1), cellB: at(2, 2) }),
        b('open_area', { cellA: at(3, 1), cellB: at(4, 2) }),
        b('carve_corridor', { cellA: at(2, 1), cellB: at(3, 1) }),
      ]),
      createScript('event_tick', [moveGoal()]),
    ],
  }
  assert.equal(validate(program).valid, true)
  assert.ok(completesWithin(lesson, program, 12), 'the-next-room solution should complete')
})

test('lesson 17 (the-next-room): WITHOUT the generated room the guest is stuck in the seed', () => {
  const lesson = getLessonById('the-next-room')
  const { world } = runProgram(lesson.starterProgram, lesson.world, 12)
  // Only the seed room is open, so the guest can never reach x:4 y:2.
  assert.notEqual(world.parties[0].position.x, 4)
})

test('lesson 18 (seal-behind): the seed room recycles to blank canvas once the guest leaves', () => {
  const lesson = getLessonById('seal-behind')
  const program = {
    version: 1,
    scripts: [
      createScript('event_start', [
        b('reset_all_walls', { state: lit('closed') }),
        b('open_area', { cellA: at(1, 1), cellB: at(2, 2) }),
        b('open_area', { cellA: at(3, 1), cellB: at(4, 2) }),
        b('carve_corridor', { cellA: at(2, 1), cellB: at(3, 1) }),
      ]),
      createScript('event_tick', [
        b('if', { cond: b('is_area_clear', { cellA: at(1, 1), cellB: at(2, 2) }) }, {
          body: [b('seal_area', { cellA: at(1, 1), cellB: at(2, 2) })],
        }),
        moveGoal(),
      ]),
    ],
  }
  assert.equal(validate(program).valid, true)
  assert.ok(completesWithin(lesson, program, 12), 'seal-behind solution should complete (seed room sealed)')
})

test('lesson 18 (seal-behind): WITHOUT the seal the seed room stays open (check fails)', () => {
  const lesson = getLessonById('seal-behind')
  const { world, history } = runProgram(lesson.starterProgram, lesson.world, 10)
  const results = evaluateChecks(lesson, world, history, lesson.starterProgram)
  const sealed = results.find((r) => r.check.type === 'area_sealed')
  assert.equal(sealed.passed, false)
})

// A shared builder for the rolling generator, so the L19/L20 tests read clearly.
function rollerScripts(stampBody) {
  return [
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
          b('if', { cond: b('is_area_sealed', { cellA: gv('ahead'), cellB: roomFar(gv('ahead')) }) }, { body: stampBody }),
        ],
      }),
      moveGoal(),
    ]),
  ]
}

test('lesson 19 (keep-it-rolling): the guest rolls the whole floor, sealing rooms behind it', () => {
  const lesson = getLessonById('keep-it-rolling')
  const program = {
    version: 1,
    scripts: rollerScripts([
      b('open_area', { cellA: gv('ahead'), cellB: roomFar(gv('ahead')) }),
      b('carve_corridor', { cellA: nbrOf('east', gv('room')), cellB: gv('ahead') }),
    ]),
  }
  assert.equal(validate(program).valid, true)
  assert.ok(completesWithin(lesson, program, 18), 'keep-it-rolling solution should complete')
})

test('lesson 19 (keep-it-rolling): WITHOUT turning it into a loop it only makes one extra room', () => {
  const lesson = getLessonById('keep-it-rolling')
  // The starter is the fixed two-room program; on this longer floor the guest
  // stalls at the second room and never reaches the far exit.
  const { world } = runProgram(lesson.starterProgram, lesson.world, 18)
  assert.notEqual(world.parties[0].position.x, 9)
})

test('lesson 20 (a-menu-of-shapes): rolls to the exit for every random shape draw', () => {
  const lesson = getLessonById('a-menu-of-shapes')
  const program = {
    version: 1,
    scripts: rollerScripts([
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
    ]),
  }
  assert.equal(validate(program).valid, true)
  for (let seed = 1; seed <= 12; seed += 1) {
    assert.ok(withSeededRandom(seed * 7919, () => completesWithin(lesson, program, 24)), `a-menu-of-shapes should complete (seed ${seed})`)
  }
})

// -- attempt lifecycle -------------------------------------------------

test('attempt lifecycle: start/advance/reset', () => {
  const lesson = getLessonById('hello-party')
  const programWithMove = createProgram([
    createScript('event_tick', [
      b('move_party', { party: b('party_number', { n: lit(1) }), cell: b('cell_at', { x: lit(1), y: lit(1) }) }),
    ]),
  ])
  let attempt = startAttempt(lesson.id)
  assert.equal(attempt.ticks, 0)
  assert.equal(attempt.completed, false)

  const notThereWorld = lesson.world
  attempt = advanceAttempt(attempt, lesson, notThereWorld, [], programWithMove)
  assert.equal(attempt.ticks, 1)
  assert.equal(attempt.completed, false)

  const doneWorld = {
    ...lesson.world,
    parties: lesson.world.parties.map((p) => ({ ...p, position: { ...p.goal } })),
  }
  attempt = advanceAttempt(attempt, lesson, doneWorld, [], programWithMove)
  assert.equal(attempt.ticks, 2)
  assert.equal(attempt.completed, true)

  const reset = resetAttempt(attempt)
  assert.equal(reset.ticks, 0)
  assert.equal(reset.completed, false)
  assert.equal(reset.lessonId, lesson.id)
})
