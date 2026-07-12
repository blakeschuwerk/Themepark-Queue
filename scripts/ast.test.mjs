import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createBlock,
  createProgram,
  createScript,
  deserialize,
  findBlock,
  insertBlock,
  literal,
  moveBlock,
  removeBlock,
  serialize,
  setInput,
  validate,
} from '../src/blocks/ast.js'
import { reservationBrain } from '../src/blocks/examplePrograms.js'

test('createBlock fills every slot with its catalog default', () => {
  const block = createBlock('move_party')
  assert.equal(block.type, 'move_party')
  assert.ok(block.inputs.party)
  assert.equal(block.inputs.party.literal, true)
  assert.equal(block.inputs.party.value, null)
  assert.deepEqual(block.inputs.cell.value, { x: 1, y: 1 })
})

test('createBlock adds body/elseBody for C-blocks only', () => {
  assert.ok(Array.isArray(createBlock('if').body))
  assert.equal(createBlock('if').elseBody, undefined)
  assert.ok(Array.isArray(createBlock('if_else').body))
  assert.ok(Array.isArray(createBlock('if_else').elseBody))
  assert.equal(createBlock('move_party').body, undefined)
})

test('insertBlock appends into a script top-level body', () => {
  const script = createScript('event_tick')
  const program = createProgram([script])
  const wait = createBlock('party_wait')

  const next = insertBlock(program, script.id, [], undefined, wait)
  assert.equal(next.scripts[0].body.length, 1)
  assert.equal(next.scripts[0].body[0].id, wait.id)
  // original program untouched (immutable-style)
  assert.equal(program.scripts[0].body.length, 0)
})

test('insertBlock can insert into a nested C-block body', () => {
  const ifBlock = createBlock('if')
  const script = createScript('event_tick', [ifBlock])
  const program = createProgram([script])
  const wait = createBlock('party_wait')

  const next = insertBlock(
    program,
    script.id,
    [{ blockId: ifBlock.id, slot: 'body' }],
    0,
    wait,
  )

  const foundIf = next.scripts[0].body[0]
  assert.equal(foundIf.body.length, 1)
  assert.equal(foundIf.body[0].id, wait.id)
})

test('insert/remove/move round trip preserves block identity', () => {
  const wait = createBlock('party_wait')
  const script = createScript('event_tick')
  let program = createProgram([script])

  program = insertBlock(program, script.id, [], undefined, wait)
  assert.ok(findBlock(program, wait.id))

  program = removeBlock(program, wait.id)
  assert.equal(findBlock(program, wait.id), null)
  assert.equal(program.scripts[0].body.length, 0)

  // re-insert, then move into a nested if-body
  const ifBlock = createBlock('if')
  program = insertBlock(program, script.id, [], undefined, ifBlock)
  program = insertBlock(program, script.id, [], undefined, wait)
  assert.equal(program.scripts[0].body.length, 2)

  program = moveBlock(program, wait.id, script.id, [{ blockId: ifBlock.id, slot: 'body' }], 0)
  assert.equal(program.scripts[0].body.length, 1, 'wait should have left the top-level body')
  const movedIf = program.scripts[0].body[0]
  assert.equal(movedIf.id, ifBlock.id)
  assert.equal(movedIf.body[0].id, wait.id)
})

test('removeBlock removes the whole subtree of a C-block', () => {
  const inner = createBlock('party_wait')
  const outer = createBlock('if')
  outer.body.push(inner)
  const script = createScript('event_tick', [outer])
  let program = createProgram([script])

  assert.ok(findBlock(program, inner.id))
  program = removeBlock(program, outer.id)
  assert.equal(findBlock(program, outer.id), null)
  assert.equal(findBlock(program, inner.id), null)
})

test('setInput sets a literal and a nested reporter block, and can be found again', () => {
  const move = createBlock('move_party')
  const script = createScript('event_tick', [move])
  let program = createProgram([script])

  program = setInput(program, move.id, 'cell', literal({ x: 2, y: 3 }))
  const found = findBlock(program, move.id)
  assert.deepEqual(found.inputs.cell.value, { x: 2, y: 3 })

  const reporter = createBlock('party_position')
  program = setInput(program, move.id, 'cell', reporter)
  const found2 = findBlock(program, move.id)
  assert.equal(found2.inputs.cell.type, 'party_position')

  // The nested reporter is itself discoverable via findBlock.
  const foundReporter = findBlock(program, reporter.id)
  assert.equal(foundReporter.id, reporter.id)
})

test('findBlock finds hats, nested statements, and nested reporter inputs', () => {
  const program = reservationBrain
  const script = program.scripts[0]

  assert.equal(findBlock(program, script.hat.id).type, 'event_tick')

  const forEach = script.body[0]
  assert.equal(forEach.type, 'for_each_party')
  assert.ok(findBlock(program, forEach.id))

  const setVar = forEach.body[0]
  assert.ok(findBlock(program, setVar.id))

  const nextStepReporter = setVar.inputs.value
  assert.equal(nextStepReporter.type, 'next_step_toward')
  assert.ok(findBlock(program, nextStepReporter.id))
})

test('serialize/deserialize round-trips a program exactly', () => {
  const json = serialize(reservationBrain)
  assert.equal(typeof json, 'string')
  const restored = deserialize(json)
  assert.deepEqual(restored, reservationBrain)
})

test('validate accepts a well-formed program', () => {
  const result = validate(reservationBrain)
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
})

test('validate rejects a script whose hat is not an event block', () => {
  const badScript = { id: 's1', hat: createBlock('move_party'), body: [] }
  const program = createProgram([badScript])
  const result = validate(program)
  assert.equal(result.valid, false)
  assert.ok(result.errors.length > 0)
})

test('validate rejects unknown block types', () => {
  const script = createScript('event_tick', [{ id: 'x1', type: 'not_a_real_block', inputs: {} }])
  const program = createProgram([script])
  const result = validate(program)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.message.includes('Unknown block type')))
})
