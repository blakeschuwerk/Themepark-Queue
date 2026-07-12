// Pure lesson-success logic (BLOCKS_SPEC.md §7.1). No React, no DOM —
// node-testable in isolation. Consumes the same shapes the interpreter and
// engine hook already use: a `world` ({ grid, rooms, parties, tick }), a
// rolling `tickHistory` (an array of TickResult-shaped objects, oldest
// first, as produced by runTick / kept as `lastTickResults`), and a
// `program` AST.

import { DIRECTIONS, WALL_RULES, getWallRuleForEdge } from '../engine/pathfinding.js'

function sameCell(a, b) {
  return Boolean(a) && Boolean(b) && a.x === b.x && a.y === b.y
}

/** Iterates the integer cells of the min/max rectangle spanned by two corners. */
function rectCells(cellA, cellB) {
  const cells = []
  const minX = Math.min(cellA.x, cellB.x)
  const maxX = Math.max(cellA.x, cellB.x)
  const minY = Math.min(cellA.y, cellB.y)
  const maxY = Math.max(cellA.y, cellB.y)
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) cells.push({ x, y, maxX, maxY, minX, minY })
  }
  return cells
}

function findParty(world, partyId) {
  return (world?.parties ?? []).find((p) => p.id === partyId) ?? null
}

/** The live variable store for list-inspecting checks. The interpreter attaches
 * `variables` to each returned world; the live world App re-derives from engine
 * state may not carry it, so fall back to the newest tick-history entry. */
function readVariables(world, tickHistory) {
  if (world?.variables) return world.variables
  for (let i = tickHistory.length - 1; i >= 0; i -= 1) {
    if (tickHistory[i]?.world?.variables) return tickHistory[i].world.variables
  }
  return {}
}

/** True if any block of `blockType` appears anywhere in the program (hats,
 * statement bodies, elseBodies, and nested reporter input slots). */
function programUsesBlock(program, blockType) {
  function scanBlock(block) {
    if (!block || typeof block !== 'object') return false
    if (block.type === blockType) return true

    for (const value of Object.values(block.inputs ?? {})) {
      if (value && typeof value === 'object' && typeof value.type === 'string' && scanBlock(value)) {
        return true
      }
    }
    if ((block.body ?? []).some(scanBlock)) return true
    if ((block.elseBody ?? []).some(scanBlock)) return true
    return false
  }

  for (const script of program?.scripts ?? []) {
    if (scanBlock(script.hat)) return true
    if ((script.body ?? []).some(scanBlock)) return true
  }
  return false
}

/** Evaluates a single Check against the current world/history/program.
 * Returns a boolean. Unknown check types are treated as not-yet-passed
 * rather than throwing, so a lesson with a typo'd check degrades gracefully
 * instead of crashing the coach panel. */
function checkPasses(check, world, tickHistory, program) {
  switch (check.type) {
    case 'party_at': {
      const party = findParty(world, check.partyId)
      return Boolean(party) && sameCell(party.position, check.cell)
    }
    case 'all_parties_at_goal': {
      const parties = world?.parties ?? []
      if (parties.length === 0) return false
      return parties.every((p) => !p.goal || sameCell(p.position, p.goal))
    }
    case 'no_violations': {
      return tickHistory.every((result) => (result.violations ?? []).length === 0)
    }
    case 'within_ticks': {
      // Only meaningful in combination with a completion condition (goal
      // reached); on its own it just checks the attempt hasn't overrun its
      // tick budget yet.
      return (world?.tick ?? 0) <= check.n
    }
    case 'used_block': {
      return programUsesBlock(program, check.blockType)
    }
    case 'list_length_at_least': {
      // Inspects a list variable's live contents. The live `world` carries a
      // `variables` store (interpreter attaches it); fall back to the newest
      // tick-history entry's world when the live one predates any tick.
      const vars = readVariables(world, tickHistory)
      const list = vars[check.name]
      return Array.isArray(list) && list.length >= check.n
    }
    case 'list_contains_cell': {
      const vars = readVariables(world, tickHistory)
      const list = vars[check.name]
      return Array.isArray(list) && list.some((item) => sameCell(item, check.cell))
    }
    case 'area_open': {
      // A room got stamped: every INSIDE edge of the rectangle is open (not
      // closed), so the little squares are fused into one open room.
      const rooms = world?.rooms ?? {}
      return rectCells(check.cellA, check.cellB).every(({ x, y, maxX, maxY }) => {
        if (x < maxX && getWallRuleForEdge({ x, y }, { x: x + 1, y }, rooms) === WALL_RULES.closed) return false
        if (y < maxY && getWallRuleForEdge({ x, y }, { x, y: y + 1 }, rooms) === WALL_RULES.closed) return false
        return true
      })
    }
    case 'area_sealed': {
      // A room got recycled: EVERY wall of every cell in the rectangle is
      // closed — blank canvas again. Mirrors the interpreter's is_area_sealed.
      const rooms = world?.rooms ?? {}
      return rectCells(check.cellA, check.cellB).every(({ x, y }) =>
        DIRECTIONS.every(
          (dir) => getWallRuleForEdge({ x, y }, { x: x + dir.dx, y: y + dir.dy }, rooms) === WALL_RULES.closed,
        ),
      )
    }
    default:
      return false
  }
}

/** Evaluates every success check for a lesson and returns one result per
 * check, in the lesson's declared order: [{ check, label, passed }]. */
export function evaluateChecks(lesson, world, tickHistory = [], program) {
  return (lesson.success ?? []).map((check) => ({
    check,
    label: check.label ?? check.type,
    passed: checkPasses(check, world, tickHistory, program),
  }))
}

/** True once every declared check for the lesson has passed. */
export function isLessonComplete(lesson, world, tickHistory = [], program) {
  const results = evaluateChecks(lesson, world, tickHistory, program)
  return results.length > 0 && results.every((r) => r.passed)
}

// -- attempt lifecycle -------------------------------------------------
//
// A tiny piece of state the coach panel/host can carry across ticks:
// which lesson is active, whether it's been completed, and how many ticks
// have run since the attempt started. Kept here (not in React state) so it
// stays testable without a DOM.

export function startAttempt(lessonId) {
  return { lessonId, startedAt: Date.now(), ticks: 0, completed: false }
}

export function resetAttempt(attempt) {
  return startAttempt(attempt.lessonId)
}

/** Advances the attempt by one tick and re-evaluates completion. Returns a
 * new attempt object (never mutates the input). */
export function advanceAttempt(attempt, lesson, world, tickHistory = [], program) {
  const ticks = attempt.ticks + 1
  const completed = attempt.completed || isLessonComplete(lesson, world, tickHistory, program)
  return { ...attempt, ticks, completed }
}

export default {
  evaluateChecks,
  isLessonComplete,
  startAttempt,
  resetAttempt,
  advanceAttempt,
}
