// Pure helpers for useSandboxEngine.js — no React, no DOM, so they're cheap
// to unit-test directly (see scripts/engineHook.test.mjs). Kept separate from
// the hook so the hook file stays focused on wiring state to runTick.

import { clamp, normalizeCell, roomKey } from '../engine/pathfinding.js'

export const PARTY_COLORS = [
  '#ff4d6d',
  '#ffb703',
  '#4cc9f0',
  '#7bd88f',
  '#c77dff',
  '#f77f00',
  '#00b4d8',
  '#f72585',
  '#80ed99',
  '#ffd166',
  '#90be6d',
  '#bde0fe',
]

export const DEFAULT_GRID = {
  gap: 0.08,
  height: 5,
  roomSize: 1,
  wallHeight: 0.78,
  wallThickness: 0.06,
  width: 5,
}

export const DEFAULT_SIMULATION = {
  running: false,
  strict: false,
  tickMs: 1400,
}

/** Clamps a grid patch onto `current`, mirroring the ranges the old engine
 * enforced: width/height 2-15, gap 0-0.6, roomSize 0.4-3, wallHeight
 * 0.2-2.4, wallThickness 0.03-0.3. */
export function clampGrid(current, patch = {}) {
  return {
    ...current,
    ...patch,
    gap: clamp(patch.gap ?? current.gap, 0, 0.6),
    height: clamp(patch.height ?? current.height, 2, 15),
    roomSize: clamp(patch.roomSize ?? current.roomSize, 0.4, 3),
    wallHeight: clamp(patch.wallHeight ?? current.wallHeight, 0.2, 2.4),
    wallThickness: clamp(patch.wallThickness ?? current.wallThickness, 0.03, 0.3),
    width: clamp(patch.width ?? current.width, 2, 15),
  }
}

/** Re-clamps a party's cells (start/position/goal) onto a (possibly resized)
 * grid. `goal` stays null if it was null. */
export function clampPartyToGrid(party, grid) {
  return {
    ...party,
    goal: party.goal ? normalizeCell(party.goal, grid.width, grid.height) : null,
    position: normalizeCell(party.position, grid.width, grid.height),
    start: normalizeCell(party.start, grid.width, grid.height),
  }
}

/** Finds the first free cell (row-major scan) for a new party's start,
 * given a Set of already-occupied roomKey strings. Falls back to a
 * wrapped index-based cell if the grid is entirely full. */
export function firstFreeCell(grid, occupied) {
  for (let y = 1; y <= grid.height; y += 1) {
    for (let x = 1; x <= grid.width; x += 1) {
      const key = roomKey({ x, y })
      if (!occupied.has(key)) return { x, y }
    }
  }
  return { x: 1, y: 1 }
}

/** Builds a brand-new party placed at the first free cell, with a goal at
 * the diagonally-opposite cell (a friendly default so example programs have
 * somewhere to walk toward out of the box). `index` only picks the color. */
export function makeParty(id, index, grid, occupied = new Set()) {
  const start = firstFreeCell(grid, occupied)
  // Diagonally-opposite cell, in 1-based coords (1..width / 1..height).
  const goal = { x: grid.width + 1 - start.x, y: grid.height + 1 - start.y }

  return {
    color: PARTY_COLORS[index % PARTY_COLORS.length],
    goal,
    id,
    name: `Party ${index + 1}`,
    position: start,
    start,
  }
}

export function makeInitialParties(idGenerator, grid, count = 4) {
  const occupied = new Set()
  const parties = []

  for (let index = 0; index < count; index += 1) {
    const party = makeParty(idGenerator(), index, grid, occupied)
    occupied.add(roomKey(party.start))
    parties.push(party)
  }

  return parties
}

/** Given this tick's violations + the (post rule-monitor) moves, returns the
 * Set of roomKey strings that should flash red. Collisions flash the shared
 * destination cell directly; swaps flash both parties' *origin* cells (the
 * two rooms that were trying to trade places) — using `from` rather than
 * `to` keeps this correct whether or not strict mode already reverted the
 * move back to a wait. */
export function violationRoomKeys(violations, moves) {
  const keys = new Set()
  const moveByParty = new Map(moves.map((move) => [move.partyId, move]))

  for (const violation of violations) {
    if (violation.kind === 'collision' && violation.cell) {
      keys.add(roomKey(violation.cell))
    } else if (violation.kind === 'swap') {
      for (const partyId of violation.partyIds) {
        const move = moveByParty.get(partyId)
        if (move) keys.add(roomKey(move.from))
      }
    }
  }

  return keys
}
