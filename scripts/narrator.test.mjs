import test from 'node:test'
import assert from 'node:assert/strict'
import { narrate } from '../src/blocks/narrator.js'
import { reservationBrain, simpleWalker, politeWalker } from '../src/blocks/examplePrograms.js'
import { createBlock, createProgram, createScript } from '../src/blocks/ast.js'

test('narrate renders the reservation-brain example as indented English', () => {
  const text = narrate(reservationBrain)

  assert.equal(typeof text, 'string')
  assert.ok(text.length > 0)

  const lines = text.split('\n')
  assert.ok(lines[0].toLowerCase().startsWith('every tick'), `first line was: ${lines[0]}`)

  // for_each_party's line should be indented one level under the hat.
  const forEachLine = lines.find((l) => l.toLowerCase().includes('for each party'))
  assert.ok(forEachLine)
  assert.ok(forEachLine.startsWith('  '), 'for_each_party should be indented under the hat')

  // Its body (reserve/move/set) should be indented a further level.
  const reserveLine = lines.find((l) => l.toLowerCase().includes('reserve'))
  assert.ok(reserveLine)
  assert.ok(reserveLine.startsWith('    '), 'reserve should be indented under for_each_party')

  // Nothing should render as literally "undefined" or crash the template.
  assert.ok(!text.includes('undefined'))
})

test('narrate renders simple-walker and polite-walker without throwing', () => {
  assert.doesNotThrow(() => narrate(simpleWalker))
  assert.doesNotThrow(() => narrate(politeWalker))
  assert.ok(narrate(simpleWalker).length > 0)
  assert.ok(narrate(politeWalker).length > 0)
})

test('narrate renders "(empty)" for a genuinely unfilled slot', () => {
  const move = createBlock('move_party')
  delete move.inputs.cell // simulate a slot the user never filled in
  const program = createProgram([createScript('event_tick', [move])])

  const text = narrate(program)
  assert.ok(text.includes('(empty)'), text)
})
