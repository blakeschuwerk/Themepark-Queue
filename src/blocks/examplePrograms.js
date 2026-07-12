// Three example/starter programs (spec §4.6), built as valid ASTs using the
// ast.js block constructors. Loadable from the program library, and used as
// the "answer key" for the final lesson.

import { createBlock, createProgram, createScript } from './ast.js'

function lit(value) {
  return { literal: true, value }
}

/** Builds a block of `type`, starting from its catalog defaults, then
 * overriding the given input slots (values must already be `lit(...)` or
 * nested `b(...)` reporter blocks) and/or its body/elseBody. */
function b(type, inputs = {}, extra = {}) {
  const block = createBlock(type)
  for (const [key, value] of Object.entries(inputs)) {
    block.inputs[key] = value
  }
  if (extra.body) block.body = extra.body
  if (extra.elseBody) block.elseBody = extra.elseBody
  return block
}

const firstParty = () => b('party_number', { n: lit(1) })

// ---------------------------------------------------------------------------
// simple-walker: one party marches straight toward its goal, one axis at a
// time. No occupancy or reservation checks at all — deliberately unsafe, the
// starting point for the lesson track.
// ---------------------------------------------------------------------------

function simpleWalkerProgram() {
  const posOf = () => b('party_position', { party: firstParty() })
  const goalOf = () => b('party_goal', { party: firstParty() })
  const posX = () => b('cell_x', { cell: posOf() })
  const posY = () => b('cell_y', { cell: posOf() })
  const goalX = () => b('cell_x', { cell: goalOf() })
  const goalY = () => b('cell_y', { cell: goalOf() })
  const step = (direction) =>
    b('move_party', {
      party: firstParty(),
      cell: b('neighbor_of', { direction: lit(direction), cell: posOf() }),
    })

  const chain = b(
    'if_else',
    { cond: b('op_less', { a: goalY(), b: posY() }) },
    { body: [step('north')], elseBody: [b('party_wait', { party: firstParty() })] },
  )
  const chain2 = b(
    'if_else',
    { cond: b('op_greater', { a: goalY(), b: posY() }) },
    { body: [step('south')], elseBody: [chain] },
  )
  const chain3 = b(
    'if_else',
    { cond: b('op_less', { a: goalX(), b: posX() }) },
    { body: [step('west')], elseBody: [chain2] },
  )
  const chain4 = b(
    'if_else',
    { cond: b('op_greater', { a: goalX(), b: posX() }) },
    { body: [step('east')], elseBody: [chain3] },
  )

  return createProgram([createScript('event_tick', [chain4])])
}

// ---------------------------------------------------------------------------
// polite-walker: same greedy walk, but computes its desired next step into a
// variable, checks `is_occupied`, and waits instead of walking into another
// party. Introduces variables + is_occupied + if_else + party_wait.
// ---------------------------------------------------------------------------

function politeWalkerProgram() {
  const posOf = () => b('party_position', { party: firstParty() })
  const goalOf = () => b('party_goal', { party: firstParty() })
  const posX = () => b('cell_x', { cell: posOf() })
  const posY = () => b('cell_y', { cell: posOf() })
  const goalX = () => b('cell_x', { cell: goalOf() })
  const goalY = () => b('cell_y', { cell: goalOf() })
  const desired = () => b('get_var', { name: lit('desired') })
  const neighbor = (direction) => b('neighbor_of', { direction: lit(direction), cell: posOf() })
  const setDesired = (direction) => b('set_var', { name: lit('desired'), value: neighbor(direction) })

  const decideNorth = b(
    'if_else',
    { cond: b('op_less', { a: goalY(), b: posY() }) },
    { body: [setDesired('north')], elseBody: [] },
  )
  const decideSouth = b(
    'if_else',
    { cond: b('op_greater', { a: goalY(), b: posY() }) },
    { body: [setDesired('south')], elseBody: [decideNorth] },
  )
  const decideWest = b(
    'if_else',
    { cond: b('op_less', { a: goalX(), b: posX() }) },
    { body: [setDesired('west')], elseBody: [decideSouth] },
  )
  const decideEast = b(
    'if_else',
    { cond: b('op_greater', { a: goalX(), b: posX() }) },
    { body: [setDesired('east')], elseBody: [decideWest] },
  )

  const initDesired = b('set_var', { name: lit('desired'), value: posOf() })

  const actOnDesired = b(
    'if_else',
    { cond: b('is_occupied', { cell: desired() }) },
    {
      body: [b('party_wait', { party: firstParty() })],
      elseBody: [b('move_party', { party: firstParty(), cell: desired() })],
    },
  )

  return createProgram([createScript('event_tick', [initDesired, decideEast, actOnDesired])])
}

// ---------------------------------------------------------------------------
// reservation-brain: the full recreation of the old MAPF logic. For each
// party, in order, find the next free step toward its goal (which already
// avoids other parties and anything reserved so far this tick), reserve it,
// then move there. This is the "answer key" for the final lesson.
// ---------------------------------------------------------------------------

function reservationBrainProgram() {
  const currentParty = () => b('current_party')
  const goalOfCurrent = () => b('party_goal', { party: currentParty() })
  const nextStep = () => b('next_step_toward', { party: currentParty(), cell: goalOfCurrent() })
  const nextVar = () => b('get_var', { name: lit('next') })

  const forEach = b('for_each_party', {}, {
    body: [
      b('set_var', { name: lit('next'), value: nextStep() }),
      b('reserve_cell', { cell: nextVar() }),
      b('move_party', { party: currentParty(), cell: nextVar() }),
    ],
  })

  return createProgram([createScript('event_tick', [forEach])])
}

export const simpleWalker = simpleWalkerProgram()
export const politeWalker = politeWalkerProgram()
export const reservationBrain = reservationBrainProgram()

export const EXAMPLE_PROGRAMS = [
  { id: 'simple-walker', name: 'Simple Walker', description: 'Marches straight toward its goal with no safety checks.', program: simpleWalker },
  { id: 'polite-walker', name: 'Polite Walker', description: 'Waits instead of walking into an occupied room.', program: politeWalker },
  { id: 'reservation-brain', name: 'Reservation Brain', description: 'Routes every party safely using reservations — the full brain.', program: reservationBrain },
]

export default EXAMPLE_PROGRAMS
