import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_GRID,
  clampGrid,
  clampPartyToGrid,
  firstFreeCell,
  makeInitialParties,
  makeParty,
  violationRoomKeys,
} from '../src/hooks/engineHelpers.js'

test('clampGrid clamps width/height to 2-15 and other fields to their ranges', () => {
  const next = clampGrid(DEFAULT_GRID, { gap: 99, height: 1, roomSize: 0, wallHeight: 9, wallThickness: 0, width: 40 })
  assert.equal(next.width, 15)
  assert.equal(next.height, 2)
  assert.equal(next.gap, 0.6)
  assert.equal(next.roomSize, 0.4)
  assert.equal(next.wallHeight, 2.4)
  assert.equal(next.wallThickness, 0.03)
})

test('clampGrid leaves unspecified fields alone and only overrides patched ones', () => {
  const next = clampGrid(DEFAULT_GRID, { width: 8 })
  assert.equal(next.width, 8)
  assert.equal(next.height, DEFAULT_GRID.height)
  assert.equal(next.roomSize, DEFAULT_GRID.roomSize)
})

test('clampPartyToGrid normalizes start/position/goal onto a shrunk grid', () => {
  const grid = { height: 2, roomSize: 1, width: 2 }
  const party = {
    goal: { x: 9, y: 9 },
    id: 'p1',
    position: { x: 9, y: 0 },
    start: { x: -3, y: 1 },
  }
  const clamped = clampPartyToGrid(party, grid)
  assert.deepEqual(clamped.start, { x: 1, y: 1 })
  assert.deepEqual(clamped.position, { x: 2, y: 1 })
  assert.deepEqual(clamped.goal, { x: 2, y: 2 })
})

test('clampPartyToGrid keeps a null goal null', () => {
  const grid = { height: 3, roomSize: 1, width: 3 }
  const clamped = clampPartyToGrid({ goal: null, id: 'p1', position: { x: 0, y: 0 }, start: { x: 0, y: 0 } }, grid)
  assert.equal(clamped.goal, null)
})

test('firstFreeCell scans row-major and skips occupied cells', () => {
  const grid = { height: 2, roomSize: 1, width: 2 }
  const occupied = new Set(['1,1', '2,1'])
  assert.deepEqual(firstFreeCell(grid, occupied), { x: 1, y: 2 })
})

test('firstFreeCell falls back to (1,1) when the grid is entirely full', () => {
  const grid = { height: 1, roomSize: 1, width: 1 }
  const occupied = new Set(['1,1'])
  assert.deepEqual(firstFreeCell(grid, occupied), { x: 1, y: 1 })
})

test('makeParty places a new party at the first free cell with a diagonally-opposite default goal', () => {
  const grid = { height: 3, roomSize: 1, width: 3 }
  const party = makeParty('p1', 0, grid, new Set(['1,1']))
  assert.deepEqual(party.start, { x: 2, y: 1 })
  assert.deepEqual(party.position, { x: 2, y: 1 })
  assert.deepEqual(party.goal, { x: 2, y: 3 })
  assert.equal(party.id, 'p1')
})

test('makeInitialParties creates N non-overlapping parties', () => {
  let counter = 0
  const grid = { height: 3, roomSize: 1, width: 3 }
  const parties = makeInitialParties(() => `party-${counter++}`, grid, 4)
  assert.equal(parties.length, 4)
  const keys = new Set(parties.map((p) => `${p.start.x},${p.start.y}`))
  assert.equal(keys.size, 4, 'every party should start on a distinct cell')
})

test('violationRoomKeys returns the shared destination cell for a collision', () => {
  const violations = [{ cell: { x: 1, y: 0 }, kind: 'collision', partyIds: ['a', 'b'] }]
  const moves = [
    { from: { x: 0, y: 0 }, partyId: 'a', to: { x: 1, y: 0 } },
    { from: { x: 2, y: 0 }, partyId: 'b', to: { x: 1, y: 0 } },
  ]
  const keys = violationRoomKeys(violations, moves)
  assert.deepEqual([...keys], ['1,0'])
})

test('violationRoomKeys returns both origin cells for a swap, even if strict mode reverted the moves', () => {
  const violations = [{ edge: 'v-1-0', kind: 'swap', partyIds: ['a', 'b'] }]
  // Strict-mode-reverted moves: both parties waited (to === from).
  const moves = [
    { from: { x: 0, y: 0 }, partyId: 'a', to: { x: 0, y: 0 } },
    { from: { x: 1, y: 0 }, partyId: 'b', to: { x: 1, y: 0 } },
  ]
  const keys = violationRoomKeys(violations, moves)
  assert.deepEqual([...keys].sort(), ['0,0', '1,0'])
})
