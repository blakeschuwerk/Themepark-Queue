import test from 'node:test'
import assert from 'node:assert/strict'

import { computeHints, createHintTracker } from '../src/teach/hints.js'
import { createBlock, createProgram, createScript } from '../src/blocks/ast.js'

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

const GRID = { width: 4, height: 4 }
function rooms() {
  const r = {}
  for (let y = 1; y <= GRID.height; y += 1) {
    for (let x = 1; x <= GRID.width; x += 1) {
      r[`${x},${y}`] = { wallRules: { north: 'auto', east: 'auto', south: 'auto', west: 'auto' } }
    }
  }
  return r
}

function baseWorld(parties) {
  return { grid: GRID, rooms: rooms(), parties, tick: 0 }
}

function tickResult(overrides = {}) {
  return {
    world: baseWorld([]),
    moves: [],
    violations: [],
    problems: [],
    trace: [],
    sayings: [],
    error: null,
    ...overrides,
  }
}

test('no-hat-script fires when the program has no runnable hat', () => {
  const program = createProgram([])
  const hints = computeHints(program, [], {})
  assert.ok(hints.some((h) => h.id === 'no-hat-script'))
})

test('no-hat-script does not fire once an event_tick script exists', () => {
  const program = createProgram([createScript('event_tick', [])])
  const hints = computeHints(program, [], {})
  assert.ok(!hints.some((h) => h.id === 'no-hat-script'))
})

test('no-move-block fires when a started program never moves a party', () => {
  // mirrors lesson 6's incomplete starter: a for_each_party that only sets a var
  const program = createProgram([
    createScript('event_tick', [
      b('for_each_party', {}, { body: [b('set_var', { name: lit('next'), value: lit(0) })] }),
    ]),
  ])
  const hints = computeHints(program, [], {})
  assert.ok(hints.some((h) => h.id === 'no-move-block'))
})

test('no-move-block does NOT fire on an empty workspace, nor once a move exists', () => {
  const empty = createProgram([createScript('event_tick', [])])
  assert.ok(!computeHints(empty, [], {}).some((h) => h.id === 'no-move-block'))

  const withMove = createProgram([
    createScript('event_tick', [
      b('for_each_party', {}, { body: [b('move_party', { party: b('current_party'), cell: b('cell_at', { x: lit(0), y: lit(0) }) })] }),
    ]),
  ])
  assert.ok(!computeHints(withMove, [], {}).some((h) => h.id === 'no-move-block'))
})

test('current-party-outside-for-each fires when current_party is used outside for_each_party', () => {
  const program = createProgram([
    createScript('event_tick', [
      b('move_party', { party: b('current_party'), cell: b('cell_at', { x: lit(0), y: lit(0) }) }),
    ]),
  ])
  const hints = computeHints(program, [], {})
  assert.ok(hints.some((h) => h.id === 'current-party-outside-for-each'))
})

test('current-party-outside-for-each does not fire inside for_each_party', () => {
  const program = createProgram([
    createScript('event_tick', [
      b('for_each_party', {}, {
        body: [b('move_party', { party: b('current_party'), cell: b('cell_at', { x: lit(0), y: lit(0) }) })],
      }),
    ]),
  ])
  const hints = computeHints(program, [], {})
  assert.ok(!hints.some((h) => h.id === 'current-party-outside-for-each'))
})

test('collision-detected fires from the latest tick result', () => {
  const program = createProgram([createScript('event_tick', [])])
  const history = [
    tickResult({ violations: [{ kind: 'collision', partyIds: ['p1', 'p2'], cell: { x: 1, y: 1 } }] }),
  ]
  const hints = computeHints(program, history, {})
  assert.ok(hints.some((h) => h.id === 'collision-detected'))
})

test('swap-trap fires from the latest tick result', () => {
  const program = createProgram([createScript('event_tick', [])])
  const history = [
    tickResult({ violations: [{ kind: 'swap', partyIds: ['p1', 'p2'], edge: 'h-0-0' }] }),
  ]
  const hints = computeHints(program, history, {})
  assert.ok(hints.some((h) => h.id === 'swap-trap'))
})

test('stuck-party fires when a party has not moved in 10+ ticks and is not at goal', () => {
  const program = createProgram([createScript('event_tick', [])])
  const stuckParty = { id: 'p1', name: 'Party 1', position: { x: 0, y: 0 }, goal: { x: 3, y: 3 } }
  const history = Array.from({ length: 10 }, () => tickResult({ world: baseWorld([stuckParty]) }))
  const hints = computeHints(program, history, {})
  assert.ok(hints.some((h) => h.id === 'stuck-party'))
})

test('stuck-party does not fire if the party is at goal', () => {
  const program = createProgram([createScript('event_tick', [])])
  const atGoal = { id: 'p1', name: 'Party 1', position: { x: 3, y: 3 }, goal: { x: 3, y: 3 } }
  const history = Array.from({ length: 10 }, () => tickResult({ world: baseWorld([atGoal]) }))
  const hints = computeHints(program, history, {})
  assert.ok(!hints.some((h) => h.id === 'stuck-party'))
})

test('stuck-party does not fire if the party has been moving', () => {
  const program = createProgram([createScript('event_tick', [])])
  const history = Array.from({ length: 10 }, (_, i) =>
    tickResult({ world: baseWorld([{ id: 'p1', name: 'Party 1', position: { x: i % 4, y: 0 }, goal: { x: 3, y: 3 } }]) }),
  )
  const hints = computeHints(program, history, {})
  assert.ok(!hints.some((h) => h.id === 'stuck-party'))
})

test('budget-exceeded fires when the latest tick result has a budget error', () => {
  const loopBlock = b('repeat', { n: lit(3) }, { body: [] })
  const program = createProgram([createScript('event_tick', [loopBlock])])
  const history = [tickResult({ error: { kind: 'budget', blockId: loopBlock.id } })]
  const hints = computeHints(program, history, {})
  const hit = hints.find((h) => h.id === 'budget-exceeded')
  assert.ok(hit)
  assert.equal(hit.blockId, loopBlock.id)
})

test('unreachable-goal fires when BFS finds no path (sealed wall)', () => {
  const program = createProgram([createScript('event_tick', [])])
  const sealedRooms = rooms()
  sealedRooms['2,1'].wallRules.east = 'closed'
  sealedRooms['2,1'].wallRules.south = 'closed'
  sealedRooms['2,1'].wallRules.north = 'closed'
  sealedRooms['2,1'].wallRules.west = 'closed'
  const world = { grid: GRID, rooms: sealedRooms, parties: [{ id: 'p1', position: { x: 1, y: 1 }, goal: { x: 2, y: 1 } }], tick: 0 }
  const hints = computeHints(program, [], { world })
  assert.ok(hints.some((h) => h.id === 'unreachable-goal'))
})

test('unreachable-goal does not fire when a path exists', () => {
  const program = createProgram([createScript('event_tick', [])])
  const world = baseWorld([{ id: 'p1', position: { x: 1, y: 1 }, goal: { x: 4, y: 4 } }])
  const hints = computeHints(program, [], { world })
  assert.ok(!hints.some((h) => h.id === 'unreachable-goal'))
})

test('type-problem fires and rephrases the interpreter message gently', () => {
  const program = createProgram([createScript('event_tick', [])])
  const history = [tickResult({ problems: [{ kind: 'type', blockId: 'blk_1', message: 'Expected a room here — using (0, 0) instead.' }] })]
  const hints = computeHints(program, history, {})
  const hit = hints.find((h) => h.id === 'type-problem')
  assert.ok(hit)
  assert.equal(hit.blockId, 'blk_1')
  assert.match(hit.message, /room/)
})

// -- dedup lifecycle ---------------------------------------------------

test('hint tracker: a hint stays active while its condition holds, clears once it does not', () => {
  const program = createProgram([])
  const tracker = createHintTracker()

  const first = tracker.update(program, [], {})
  assert.ok(first.some((h) => h.id === 'no-hat-script'))
  assert.ok(tracker.isActive('no-hat-script'))

  const withHat = createProgram([createScript('event_tick', [])])
  const second = tracker.update(withHat, [], {})
  assert.ok(!second.some((h) => h.id === 'no-hat-script'))
  assert.ok(!tracker.isActive('no-hat-script'))
})

test('hint tracker: re-fires the same id after it clears and re-triggers', () => {
  const noHat = createProgram([])
  const withHat = createProgram([createScript('event_tick', [])])
  const tracker = createHintTracker()

  tracker.update(noHat, [], {})
  assert.ok(tracker.isActive('no-hat-script'))

  tracker.update(withHat, [], {})
  assert.ok(!tracker.isActive('no-hat-script'))

  tracker.update(noHat, [], {})
  assert.ok(tracker.isActive('no-hat-script'))
})

test('hint tracker: reset clears all active ids', () => {
  const tracker = createHintTracker()
  tracker.update(createProgram([]), [], {})
  assert.ok(tracker.isActive('no-hat-script'))
  tracker.reset()
  assert.ok(!tracker.isActive('no-hat-script'))
})
