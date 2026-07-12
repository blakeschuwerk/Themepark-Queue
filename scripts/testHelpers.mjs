// Shared fixtures for the block-core test suite. Not itself a test file
// (doesn't match node --test's *.test.mjs pattern).

import { ensureRooms } from '../src/engine/pathfinding.js'

export function makeGrid(width, height) {
  return { width, height, roomSize: 1, gap: 0.08, wallHeight: 0.78, wallThickness: 0.06 }
}

export function makeParty(id, name, x, y, goal = null, color = '#ffffff') {
  return { id, name, color, position: { x, y }, start: { x, y }, goal }
}

export function makeWorld({ width = 4, height = 4, parties = [], tick = 0, rooms } = {}) {
  return {
    grid: makeGrid(width, height),
    rooms: rooms ?? ensureRooms(width, height),
    parties,
    tick,
  }
}

export function freshRuntime(strict = false) {
  return { variables: {}, strict }
}
