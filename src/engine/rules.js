// The violation monitor: checks a tick's applied moves against the two
// "sacred constraints" (spec §1) — isolation (no two parties share a room)
// and no-crossing (no two parties swap rooms head-on). Pure, no React/DOM.
// Used by the interpreter, and later re-usable by the UI/coach.

import { edgeIdBetween, roomKey, sameCell } from './pathfinding.js'

/**
 * @param {Array<{partyId: string, from: {x,y}, to: {x,y}}>} moves
 *   Applied (adjacency/wall-validated) moves, one per party.
 * @returns {Array<{kind: 'collision'|'swap', partyIds: string[], cell?: {x,y}, edge?: string}>}
 */
export function detectViolations(moves) {
  const violations = []

  // Isolation: group by destination cell; any group of 2+ is a collision.
  const byDestination = new Map()
  for (const move of moves) {
    const key = roomKey(move.to)
    if (!byDestination.has(key)) byDestination.set(key, [])
    byDestination.get(key).push(move)
  }

  for (const group of byDestination.values()) {
    if (group.length > 1) {
      violations.push({
        kind: 'collision',
        partyIds: group.map((m) => m.partyId),
        cell: { x: group[0].to.x, y: group[0].to.y },
      })
    }
  }

  // No-crossing: any pair of parties whose from/to are mirror images of
  // each other, and who actually moved (not a coincidental wait).
  for (let i = 0; i < moves.length; i += 1) {
    for (let j = i + 1; j < moves.length; j += 1) {
      const a = moves[i]
      const b = moves[j]
      const aMoved = !sameCell(a.from, a.to)
      const bMoved = !sameCell(b.from, b.to)
      if (!aMoved || !bMoved) continue

      if (sameCell(a.from, b.to) && sameCell(a.to, b.from)) {
        violations.push({
          kind: 'swap',
          partyIds: [a.partyId, b.partyId],
          edge: edgeIdBetween(a.from, a.to),
        })
      }
    }
  }

  return violations
}
