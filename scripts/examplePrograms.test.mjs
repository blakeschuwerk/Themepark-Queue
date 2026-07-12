import test from 'node:test'
import assert from 'node:assert/strict'
import { validate } from '../src/blocks/ast.js'
import { simpleWalker, politeWalker, reservationBrain } from '../src/blocks/examplePrograms.js'
import { runTick } from '../src/blocks/interpreter.js'
import { makeParty, makeWorld, freshRuntime } from './testHelpers.mjs'

test('all three example programs are structurally valid ASTs', () => {
  for (const program of [simpleWalker, politeWalker, reservationBrain]) {
    const result = validate(program)
    assert.equal(result.valid, true, JSON.stringify(result.errors))
  }
})

test('simple-walker runs 20 ticks without error', () => {
  let world = makeWorld({
    width: 5,
    height: 5,
    parties: [makeParty('party-1', 'Party 1', 1, 1, { x: 5, y: 5 })],
  })
  const runtime = freshRuntime()

  for (let i = 0; i < 20; i += 1) {
    const result = runTick(simpleWalker, world, runtime)
    assert.equal(result.error, null, `tick ${i} errored`)
    world = result.world
  }
})

test('polite-walker runs 20 ticks without error', () => {
  let world = makeWorld({
    width: 5,
    height: 5,
    parties: [makeParty('party-1', 'Party 1', 1, 1, { x: 5, y: 5 })],
  })
  const runtime = freshRuntime()

  for (let i = 0; i < 20; i += 1) {
    const result = runTick(politeWalker, world, runtime)
    assert.equal(result.error, null, `tick ${i} errored`)
    world = result.world
  }
})

test('reservation-brain runs 20 ticks without error (single party sanity check)', () => {
  let world = makeWorld({
    width: 5,
    height: 5,
    parties: [makeParty('party-1', 'Party 1', 1, 1, { x: 5, y: 5 })],
  })
  const runtime = freshRuntime()

  for (let i = 0; i < 20; i += 1) {
    const result = runTick(reservationBrain, world, runtime)
    assert.equal(result.error, null, `tick ${i} errored`)
    world = result.world
  }
})

test('reservation-brain routes 4 parties on crossing goals: zero violations, everyone arrives within 40 ticks', () => {
  let world = makeWorld({
    width: 5,
    height: 5,
    parties: [
      makeParty('party-1', 'Party 1', 1, 1, { x: 5, y: 5 }),
      makeParty('party-2', 'Party 2', 5, 5, { x: 1, y: 1 }),
      makeParty('party-3', 'Party 3', 1, 5, { x: 5, y: 1 }),
      makeParty('party-4', 'Party 4', 5, 1, { x: 1, y: 5 }),
    ],
  })
  const runtime = freshRuntime(false)
  let totalViolations = 0

  for (let i = 0; i < 40; i += 1) {
    const result = runTick(reservationBrain, world, runtime)
    assert.equal(result.error, null, `tick ${i} errored`)
    totalViolations += result.violations.length
    world = result.world
  }

  assert.equal(totalViolations, 0, 'reservation-brain must never produce a collision or swap')

  for (const party of world.parties) {
    assert.deepEqual(party.position, party.goal, `${party.id} did not reach its goal within 40 ticks`)
  }
})

test('reservation-brain also stays violation-free in strict mode with the same crossing scenario', () => {
  let world = makeWorld({
    width: 5,
    height: 5,
    parties: [
      makeParty('party-1', 'Party 1', 1, 1, { x: 5, y: 5 }),
      makeParty('party-2', 'Party 2', 5, 5, { x: 1, y: 1 }),
      makeParty('party-3', 'Party 3', 1, 5, { x: 5, y: 1 }),
      makeParty('party-4', 'Party 4', 5, 1, { x: 1, y: 5 }),
    ],
  })
  const runtime = freshRuntime(true)
  let totalViolations = 0

  for (let i = 0; i < 40; i += 1) {
    const result = runTick(reservationBrain, world, runtime)
    assert.equal(result.error, null, `tick ${i} errored`)
    totalViolations += result.violations.length
    world = result.world
  }

  assert.equal(totalViolations, 0)
  for (const party of world.parties) {
    assert.deepEqual(party.position, party.goal, `${party.id} did not reach its goal within 40 ticks`)
  }
})
