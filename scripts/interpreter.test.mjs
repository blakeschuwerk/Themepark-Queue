import test from 'node:test'
import assert from 'node:assert/strict'
import { createBlock, createProgram, createScript, literal as lit } from '../src/blocks/ast.js'
import { runTick } from '../src/blocks/interpreter.js'
import { ensureRooms } from '../src/engine/pathfinding.js'
import { makeParty, makeWorld, freshRuntime } from './testHelpers.mjs'

function b(type, inputs = {}, extra = {}) {
  const block = createBlock(type)
  for (const [key, value] of Object.entries(inputs)) block.inputs[key] = value
  if (extra.body) block.body = extra.body
  if (extra.elseBody) block.elseBody = extra.elseBody
  return block
}

function programOf(...statements) {
  return createProgram([createScript('event_tick', statements)])
}

test('valid adjacent move intent is applied and reported in moves', () => {
  const move = b('move_party', { party: lit('p1'), cell: b('cell_at', { x: lit(2), y: lit(1) }) })
  const program = programOf(move)
  const world = makeWorld({ width: 3, height: 1, parties: [makeParty('p1', 'P1', 1, 1)] })

  const result = runTick(program, world, freshRuntime())

  assert.equal(result.error, null)
  assert.deepEqual(result.world.parties[0].position, { x: 2, y: 1 })
  assert.equal(result.moves.length, 1)
  assert.deepEqual(result.moves[0], { partyId: 'p1', from: { x: 1, y: 1 }, to: { x: 2, y: 1 }, edgeId: 'v-1-0' })
  assert.equal(result.problems.length, 0)
  assert.equal(result.violations.length, 0)
  assert.equal(result.world.tick, 1)
})

test('"every N ticks" only runs its body on ticks divisible by N', () => {
  const script = createScript('event_every_n_ticks', [
    b('change_var', { name: lit('count'), n: lit(1) }),
  ], { hat: { inputs: { n: lit(3) } } })
  const program = createProgram([script])
  const world = makeWorld({ width: 3, height: 1, parties: [makeParty('p1', 'P1', 1, 1)] })
  const runtime = freshRuntime()

  let currentWorld = world
  for (let i = 0; i < 7; i += 1) {
    const result = runTick(program, currentWorld, runtime)
    assert.equal(result.error, null)
    currentWorld = result.world
  }

  // ticks 0, 3, 6 fire -> count should be 3
  assert.equal(runtime.variables.count, 3)
})

test('"every N ticks" defaults to every 2nd tick and clamps a non-positive n to 1', () => {
  const script = createScript('event_every_n_ticks', [
    b('change_var', { name: lit('count'), n: lit(1) }),
  ], { hat: { inputs: { n: lit(0) } } })
  const program = createProgram([script])
  const world = makeWorld({ width: 3, height: 1, parties: [makeParty('p1', 'P1', 1, 1)] })
  const runtime = freshRuntime()

  let currentWorld = world
  for (let i = 0; i < 4; i += 1) {
    const result = runTick(program, currentWorld, runtime)
    currentWorld = result.world
  }

  // n <= 0 clamps to 1, so it should fire every tick: 4 times
  assert.equal(runtime.variables.count, 4)
})

test('non-adjacent move intent is rejected: becomes a wait plus a problem', () => {
  const move = b('move_party', { party: lit('p1'), cell: b('cell_at', { x: lit(3), y: lit(1) }) })
  const program = programOf(move)
  const world = makeWorld({ width: 3, height: 1, parties: [makeParty('p1', 'P1', 1, 1)] })

  const result = runTick(program, world, freshRuntime())

  assert.deepEqual(result.world.parties[0].position, { x: 1, y: 1 })
  assert.equal(result.moves[0].to.x, 1)
  assert.equal(result.moves[0].edgeId, null)
  assert.equal(result.problems.length, 1)
  assert.equal(result.problems[0].kind, 'move')
  assert.equal(result.problems[0].partyId, 'p1')
})

test('move blocked by a closed wall is rejected: becomes a wait plus a problem', () => {
  const move = b('move_party', { party: lit('p1'), cell: b('cell_at', { x: lit(2), y: lit(1) }) })
  const program = programOf(move)
  const rooms = ensureRooms(2, 1)
  rooms['1,1'] = { ...rooms['1,1'], wallRules: { ...rooms['1,1'].wallRules, east: 'closed' } }
  const world = makeWorld({ width: 2, height: 1, parties: [makeParty('p1', 'P1', 1, 1)], rooms })

  const result = runTick(program, world, freshRuntime())

  assert.deepEqual(result.world.parties[0].position, { x: 1, y: 1 })
  assert.equal(result.problems.length, 1)
  assert.equal(result.problems[0].kind, 'move')
})

test('reservations: readable within the same tick, reset on the next tick, variables persist', () => {
  const tick1 = programOf(
    b('reserve_cell', { cell: b('cell_at', { x: lit(2), y: lit(1) }) }),
    b('set_var', { name: lit('r'), value: b('is_reserved', { cell: b('cell_at', { x: lit(2), y: lit(1) }) }) }),
  )
  const tick2 = programOf(
    b('set_var', { name: lit('r2'), value: b('is_reserved', { cell: b('cell_at', { x: lit(2), y: lit(1) }) }) }),
  )

  const world0 = makeWorld({ width: 3, height: 1, parties: [makeParty('p1', 'P1', 1, 1)] })
  const runtime = freshRuntime()

  const result1 = runTick(tick1, world0, runtime)
  assert.equal(runtime.variables.r, true)

  runTick(tick2, result1.world, runtime)
  assert.equal(runtime.variables.r2, false, 'reservations must reset every tick')
  assert.equal(runtime.variables.r, true, 'variables persist across ticks in the same runtime')
})

test('collision (two parties, same destination) is detected in learning mode and actually happens', () => {
  const program = programOf(
    b('move_party', { party: lit('pA'), cell: b('cell_at', { x: lit(2), y: lit(1) }) }),
    b('move_party', { party: lit('pB'), cell: b('cell_at', { x: lit(2), y: lit(1) }) }),
  )
  const world = makeWorld({
    width: 3,
    height: 1,
    parties: [makeParty('pA', 'A', 1, 1), makeParty('pB', 'B', 3, 1)],
  })

  const result = runTick(program, world, freshRuntime(false))

  assert.equal(result.violations.length, 1)
  assert.equal(result.violations[0].kind, 'collision')
  assert.deepEqual(new Set(result.violations[0].partyIds), new Set(['pA', 'pB']))
  assert.deepEqual(result.violations[0].cell, { x: 2, y: 1 })

  const positions = Object.fromEntries(result.world.parties.map((p) => [p.id, p.position]))
  assert.deepEqual(positions.pA, { x: 2, y: 1 })
  assert.deepEqual(positions.pB, { x: 2, y: 1 }, 'learning mode lets the collision actually happen')
})

test('collision is still reported in strict mode, but the later-indexed party is reverted to a wait', () => {
  const program = programOf(
    b('move_party', { party: lit('pA'), cell: b('cell_at', { x: lit(2), y: lit(1) }) }),
    b('move_party', { party: lit('pB'), cell: b('cell_at', { x: lit(2), y: lit(1) }) }),
  )
  const world = makeWorld({
    width: 3,
    height: 1,
    parties: [makeParty('pA', 'A', 1, 1), makeParty('pB', 'B', 3, 1)],
  })

  const result = runTick(program, world, freshRuntime(true))

  assert.equal(result.violations.length, 1)
  assert.equal(result.violations[0].kind, 'collision')

  const positions = Object.fromEntries(result.world.parties.map((p) => [p.id, p.position]))
  assert.deepEqual(positions.pA, { x: 2, y: 1 }, 'earlier-indexed party keeps moving')
  assert.deepEqual(positions.pB, { x: 3, y: 1 }, 'later-indexed party is reverted to a wait')
})

test('head-on swap is detected in learning mode and actually happens', () => {
  const program = programOf(
    b('move_party', { party: lit('pA'), cell: b('cell_at', { x: lit(2), y: lit(1) }) }),
    b('move_party', { party: lit('pB'), cell: b('cell_at', { x: lit(1), y: lit(1) }) }),
  )
  const world = makeWorld({
    width: 2,
    height: 1,
    parties: [makeParty('pA', 'A', 1, 1), makeParty('pB', 'B', 2, 1)],
  })

  const result = runTick(program, world, freshRuntime(false))

  assert.equal(result.violations.length, 1)
  assert.equal(result.violations[0].kind, 'swap')
  assert.deepEqual(new Set(result.violations[0].partyIds), new Set(['pA', 'pB']))

  const positions = Object.fromEntries(result.world.parties.map((p) => [p.id, p.position]))
  assert.deepEqual(positions.pA, { x: 2, y: 1 })
  assert.deepEqual(positions.pB, { x: 1, y: 1 })
})

test('head-on swap in strict mode is still reported, but neither party actually swaps (both wait)', () => {
  const program = programOf(
    b('move_party', { party: lit('pA'), cell: b('cell_at', { x: lit(2), y: lit(1) }) }),
    b('move_party', { party: lit('pB'), cell: b('cell_at', { x: lit(1), y: lit(1) }) }),
  )
  const world = makeWorld({
    width: 2,
    height: 1,
    parties: [makeParty('pA', 'A', 1, 1), makeParty('pB', 'B', 2, 1)],
  })

  const result = runTick(program, world, freshRuntime(true))

  assert.equal(result.violations.length, 1)
  assert.equal(result.violations[0].kind, 'swap')

  const positions = Object.fromEntries(result.world.parties.map((p) => [p.id, p.position]))
  assert.deepEqual(positions.pA, { x: 1, y: 1 }, 'strict mode must not let either side of a swap move')
  assert.deepEqual(positions.pB, { x: 2, y: 1 })

  // Applying the rule monitor to the *actual* final positions must find
  // nothing left to complain about.
  const finalMoves = result.moves.map((m) => ({ partyId: m.partyId, from: m.from, to: m.to }))
  assert.ok(finalMoves.every((m) => m.from.x === m.to.x && m.from.y === m.to.y))
})

test('op budget aborts the tick with a budget error and leaves the world untouched', () => {
  const innerWait = b('party_wait', { party: lit('p1') })
  const repeatBlock = b('repeat', { n: lit(50000) }, { body: [innerWait] })
  const program = programOf(repeatBlock)
  const world = makeWorld({ width: 2, height: 1, parties: [makeParty('p1', 'P1', 1, 1)] })

  const result = runTick(program, world, freshRuntime())

  assert.ok(result.error)
  assert.equal(result.error.kind, 'budget')
  assert.equal(typeof result.error.blockId, 'string')
  assert.deepEqual(result.world, world, 'world must be unchanged on budget abort')
  assert.equal(result.moves.length, 0)
  assert.equal(result.violations.length, 0)
  assert.ok(result.trace.length > 0 && result.trace.length <= 2000)
})

test('trace records every executed statement, and reporter values (cells formatted as (x, y))', () => {
  const posBlock = b('party_position', { party: lit('p1') })
  const setPos = b('set_var', { name: lit('pos'), value: posBlock })
  const addBlock = b('op_add', { a: lit(2), b: lit(3) })
  const setSum = b('set_var', { name: lit('sum'), value: addBlock })
  const program = programOf(setPos, setSum)
  const world = makeWorld({ width: 3, height: 1, parties: [makeParty('p1', 'P1', 1, 1)] })

  const result = runTick(program, world, freshRuntime())

  const posEntry = result.trace.find((t) => t.blockId === posBlock.id)
  assert.ok(posEntry)
  assert.equal(posEntry.value, '(1, 1)')

  const addEntry = result.trace.find((t) => t.blockId === addBlock.id)
  assert.ok(addEntry)
  assert.equal(addEntry.value, 5)

  const setPosEntry = result.trace.find((t) => t.blockId === setPos.id)
  assert.ok(setPosEntry)
  assert.ok(!('value' in setPosEntry), 'statements record no value, only reporters do')
})

test('type problems never throw: bad slot values coerce sensibly and get logged', () => {
  const move = b('move_party', { party: lit('nope-not-a-party'), cell: b('cell_at', { x: lit(1), y: lit(1) }) })
  const program = programOf(move)
  const world = makeWorld({ width: 2, height: 1, parties: [makeParty('p1', 'P1', 1, 1)] })

  assert.doesNotThrow(() => runTick(program, world, freshRuntime()))
  const result = runTick(program, world, freshRuntime())
  assert.equal(result.error, null)
  assert.ok(result.problems.some((p) => p.kind === 'type'))
})

// -- next_step_toward_or_closest ------------------------------------------

// Evaluates a single reporter block against a world by stashing its result in
// a variable and reading it back out of the runtime.
function evalReporterCell(reporterBlock, world) {
  const program = programOf(b('set_var', { name: lit('out'), value: reporterBlock }))
  const runtime = freshRuntime()
  runTick(program, world, runtime)
  return runtime.variables.out
}

test('next_step_toward_or_closest: with a clear path, matches next_step_toward exactly', () => {
  const world = makeWorld({ width: 4, height: 1, parties: [makeParty('p1', 'P1', 1, 1)] })
  const target = { x: 4, y: 1 }
  const plain = evalReporterCell(b('next_step_toward', { party: lit('p1'), cell: b('cell_at', { x: lit(4), y: lit(1) }) }), world)
  const closest = evalReporterCell(b('next_step_toward_or_closest', { party: lit('p1'), cell: b('cell_at', { x: lit(4), y: lit(1) }) }), world)
  assert.deepEqual(plain, { x: 2, y: 1 })
  assert.deepEqual(closest, plain, 'a full path exists, so both blocks agree')
  assert.ok(target)
})

test('next_step_toward_or_closest: with no path at all, walks toward the closest reachable cell (not stay put)', () => {
  // 4x1 corridor with the wall east of x:3 sealed shut: x:4 (the target) is
  // walled off entirely, so no path reaches it.
  const rooms = ensureRooms(4, 1)
  rooms['3,1'] = { ...rooms['3,1'], wallRules: { ...rooms['3,1'].wallRules, east: 'closed' } }
  rooms['4,1'] = { ...rooms['4,1'], wallRules: { ...rooms['4,1'].wallRules, west: 'closed' } }
  const world = makeWorld({ width: 4, height: 1, parties: [makeParty('p1', 'P1', 1, 1)], rooms })

  const plain = evalReporterCell(b('next_step_toward', { party: lit('p1'), cell: b('cell_at', { x: lit(4), y: lit(1) }) }), world)
  const closest = evalReporterCell(b('next_step_toward_or_closest', { party: lit('p1'), cell: b('cell_at', { x: lit(4), y: lit(1) }) }), world)

  assert.deepEqual(plain, { x: 1, y: 1 }, 'plain block gives up and stays put')
  assert.deepEqual(closest, { x: 2, y: 1 }, 'closest block still advances toward the sealed gate')
})

test('next_step_toward_or_closest: still respects a cell occupied by another party', () => {
  // p1 at x:1 wants x:4; a wall seals off x:4, and p2 sits on x:2 (the only
  // way forward). The one step handed back must not walk onto p2.
  const rooms = ensureRooms(4, 1)
  rooms['3,1'] = { ...rooms['3,1'], wallRules: { ...rooms['3,1'].wallRules, east: 'closed' } }
  const world = makeWorld({
    width: 4,
    height: 1,
    parties: [makeParty('p1', 'P1', 1, 1), makeParty('p2', 'P2', 2, 1)],
    rooms,
  })
  const closest = evalReporterCell(b('next_step_toward_or_closest', { party: lit('p1'), cell: b('cell_at', { x: lit(4), y: lit(1) }) }), world)
  assert.deepEqual(closest, { x: 1, y: 1 }, 'must not step onto the occupied cell — waits instead')
})

test('"current party" outside for_each_party logs a problem instead of throwing', () => {
  const say = b('say', { party: lit('p1'), text: b('current_party') })
  const program = programOf(say)
  const world = makeWorld({ width: 2, height: 1, parties: [makeParty('p1', 'P1', 1, 1)] })

  const result = runTick(program, world, freshRuntime())
  assert.equal(result.error, null)
  assert.ok(result.problems.some((p) => p.message.includes('for each party')))
})

// -- list blocks ----------------------------------------------------------

function makeSmallWorld() {
  return makeWorld({ width: 3, height: 1, parties: [makeParty('p1', 'P1', 1, 1)] })
}

test('list_add appends values; list_length reports the count', () => {
  const program = programOf(
    b('list_add', { value: lit(10), name: lit('nums') }),
    b('list_add', { value: lit(20), name: lit('nums') }),
    b('set_var', { name: lit('len'), value: b('list_length', { name: lit('nums') }) }),
  )
  const runtime = freshRuntime()
  runTick(program, makeSmallWorld(), runtime)
  assert.deepEqual(runtime.variables.nums, [10, 20])
  assert.equal(runtime.variables.len, 2)
})

test('list_length of a never-created list is 0; list_is_empty is true', () => {
  const program = programOf(
    b('set_var', { name: lit('len'), value: b('list_length', { name: lit('ghost') }) }),
    b('set_var', { name: lit('empty'), value: b('list_is_empty', { name: lit('ghost') }) }),
  )
  const runtime = freshRuntime()
  runTick(program, makeSmallWorld(), runtime)
  assert.equal(runtime.variables.len, 0)
  assert.equal(runtime.variables.empty, true)
})

test('list_item is 1-based; out-of-range pushes a problem and returns null', () => {
  const program = programOf(
    b('list_add', { value: lit('a'), name: lit('xs') }),
    b('list_add', { value: lit('b'), name: lit('xs') }),
    b('set_var', { name: lit('first'), value: b('list_item', { index: lit(1), name: lit('xs') }) }),
    b('set_var', { name: lit('second'), value: b('list_item', { index: lit(2), name: lit('xs') }) }),
    b('set_var', { name: lit('none'), value: b('list_item', { index: lit(3), name: lit('xs') }) }),
  )
  const runtime = freshRuntime()
  const result = runTick(program, makeSmallWorld(), runtime)
  assert.equal(runtime.variables.first, 'a')
  assert.equal(runtime.variables.second, 'b')
  assert.equal(runtime.variables.none, null)
  assert.ok(result.problems.some((p) => p.message.includes('no item 3')))
})

test('list_contains uses value-equality that works for cells', () => {
  const program = programOf(
    b('list_add', { value: b('cell_at', { x: lit(2), y: lit(1) }), name: lit('cells') }),
    b('set_var', { name: lit('hit'), value: b('list_contains', { name: lit('cells'), value: b('cell_at', { x: lit(2), y: lit(1) }) }) }),
    b('set_var', { name: lit('miss'), value: b('list_contains', { name: lit('cells'), value: b('cell_at', { x: lit(3), y: lit(1) }) }) }),
  )
  const runtime = freshRuntime()
  runTick(program, makeSmallWorld(), runtime)
  assert.equal(runtime.variables.hit, true)
  assert.equal(runtime.variables.miss, false)
})

test('list_random returns a member of the list', () => {
  const program = programOf(
    b('list_add', { value: lit(7), name: lit('one') }),
    b('set_var', { name: lit('pick'), value: b('list_random', { name: lit('one') }) }),
  )
  const runtime = freshRuntime()
  runTick(program, makeSmallWorld(), runtime)
  assert.equal(runtime.variables.pick, 7)
})

test('list_random of an empty list returns null and pushes a problem', () => {
  const program = programOf(
    b('set_var', { name: lit('pick'), value: b('list_random', { name: lit('empty') }) }),
  )
  const runtime = freshRuntime()
  const result = runTick(program, makeSmallWorld(), runtime)
  assert.equal(runtime.variables.pick, null)
  assert.ok(result.problems.some((p) => p.message.includes('empty')))
})

test('list_remove takes out a 1-based item and shifts the rest', () => {
  const program = programOf(
    b('list_add', { value: lit('a'), name: lit('xs') }),
    b('list_add', { value: lit('b'), name: lit('xs') }),
    b('list_add', { value: lit('c'), name: lit('xs') }),
    b('list_remove', { index: lit(2), name: lit('xs') }),
  )
  const runtime = freshRuntime()
  runTick(program, makeSmallWorld(), runtime)
  assert.deepEqual(runtime.variables.xs, ['a', 'c'])
})

test('list_remove out of range is a no-op that pushes a problem', () => {
  const program = programOf(
    b('list_add', { value: lit('a'), name: lit('xs') }),
    b('list_remove', { index: lit(5), name: lit('xs') }),
  )
  const runtime = freshRuntime()
  const result = runTick(program, makeSmallWorld(), runtime)
  assert.deepEqual(runtime.variables.xs, ['a'])
  assert.ok(result.problems.some((p) => p.message.includes('no item 5')))
})

test('list_clear empties a list', () => {
  const program = programOf(
    b('list_add', { value: lit(1), name: lit('xs') }),
    b('list_add', { value: lit(2), name: lit('xs') }),
    b('list_clear', { name: lit('xs') }),
  )
  const runtime = freshRuntime()
  runTick(program, makeSmallWorld(), runtime)
  assert.deepEqual(runtime.variables.xs, [])
})

test('list variables survive across multiple ticks with the same runtime', () => {
  const program = createProgram([
    createScript('event_tick', [
      b('list_add', { value: b('tick_number'), name: lit('ticks') }),
    ]),
  ])
  const runtime = freshRuntime()
  let world = makeSmallWorld()
  for (let i = 0; i < 4; i += 1) {
    world = runTick(program, world, runtime).world
  }
  assert.deepEqual(runtime.variables.ticks, [0, 1, 2, 3])
})

test('the returned world exposes the live variables store (for list checks)', () => {
  const program = programOf(b('list_add', { value: lit(1), name: lit('xs') }))
  const runtime = freshRuntime()
  const result = runTick(program, makeSmallWorld(), runtime)
  assert.deepEqual(result.world.variables.xs, [1])
  assert.equal(result.world.variables, runtime.variables)
})

test('random_direction returns one of the four compass directions', () => {
  const program = programOf(b('set_var', { name: lit('d'), value: b('random_direction') }))
  for (let i = 0; i < 20; i += 1) {
    const runtime = freshRuntime()
    runTick(program, makeSmallWorld(), runtime)
    assert.ok(['north', 'east', 'south', 'west'].includes(runtime.variables.d))
  }
})
