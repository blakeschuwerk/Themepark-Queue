// The block program interpreter: runTick(program, world, runtime) -> TickResult.
// Pure function per BLOCKS_SPEC.md §4.4. No React, no DOM, no hidden module
// state that would make two calls with the same inputs behave differently
// (aside from `random_number`, which is deliberately random).

import { getBlockDef } from './catalog.js'
import {
  DIRECTIONS,
  WALL_RULES,
  canTraverse,
  clamp,
  edgeIdBetween,
  findPath,
  findPathOrClosest,
  getWallRuleForEdge,
  roomKey,
  sameCell,
} from '../engine/pathfinding.js'
import { detectViolations } from '../engine/rules.js'

export const OP_BUDGET = 20000
export const TRACE_CAP = 2000

class BudgetExceededError extends Error {
  constructor(blockId) {
    super('Block evaluation budget exceeded')
    this.blockId = blockId
  }
}

function isLiteral(value) {
  return Boolean(value) && typeof value === 'object' && value.literal === true
}

function isBlockNode(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.type === 'string'
}

function formatTraceValue(value) {
  if (value && typeof value === 'object' && 'x' in value && 'y' in value) {
    return `(${value.x}, ${value.y})`
  }
  return value
}

function pushTrace(ctx, blockId, value, hasValue) {
  if (ctx.trace.length >= TRACE_CAP) return
  ctx.trace.push(hasValue ? { blockId, value: formatTraceValue(value) } : { blockId })
}

function pushProblem(ctx, problem) {
  ctx.problems.push(problem)
}

function bumpOps(ctx, blockId) {
  ctx.opCount += 1
  if (ctx.opCount > OP_BUDGET) {
    throw new BudgetExceededError(blockId)
  }
}

function inBounds(cell, grid) {
  // Cells are addressed 1..width / 1..height.
  return cell.x >= 1 && cell.y >= 1 && cell.x <= grid.width && cell.y <= grid.height
}

// -- build helpers (shared by open_area / close_border / carve_corridor) ---

/** Two corner cells -> an in-bounds min/max rectangle. */
function normalizeRect(a, b, grid) {
  return {
    minX: clamp(Math.min(a.x, b.x), 1, grid.width),
    maxX: clamp(Math.max(a.x, b.x), 1, grid.width),
    minY: clamp(Math.min(a.y, b.y), 1, grid.height),
    maxY: clamp(Math.max(a.y, b.y), 1, grid.height),
  }
}

/** Sets one wall's state on a `draft` rooms object. Mutates `draft` in place
 * (callers pass a shallow copy of ctx.rooms).
 *
 * `syncNeighbor` (default true) also stamps the same state on the opposite
 * side of the shared edge — needed for OPENING, so that an "open" forces the
 * edge through even if the neighbour's side was previously "closed" (an edge
 * counts as open only when neither side is closed). CLOSING passes false and
 * seals just the one side: an edge counts as closed when *either* side is, so
 * one side is enough, and leaving the neighbour untouched lets a single
 * one-sided `set wall … to open` reopen it as a door later. */
function setEdge(draft, grid, cell, direction, state, syncNeighbor = true) {
  const dir = DIRECTIONS.find((d) => d.id === direction)
  if (!dir) return
  const key = roomKey(cell)
  if (draft[key]) {
    draft[key] = { ...draft[key], wallRules: { ...draft[key].wallRules, [direction]: state } }
  }
  if (!syncNeighbor) return
  const nb = { x: cell.x + dir.dx, y: cell.y + dir.dy }
  if (inBounds(nb, grid)) {
    const nk = roomKey(nb)
    if (draft[nk]) {
      draft[nk] = { ...draft[nk], wallRules: { ...draft[nk].wallRules, [dir.opposite]: state } }
    }
  }
}

/** Reads the array stored at `name`, treating a missing value or any
 * non-array value as an empty list rather than throwing — consistent with
 * this file's "never throw, coerce sensibly" philosophy. A list variable
 * shares the same name-namespace as scalar variables (`ctx.variables`): a
 * name simply holds whatever type was last written to it (D13). */
function coerceList(ctx, name) {
  const value = ctx.variables[name]
  return Array.isArray(value) ? value : []
}

function valuesEqual(a, b) {
  if (
    a && b && typeof a === 'object' && typeof b === 'object' &&
    'x' in a && 'y' in a && 'x' in b && 'y' in b
  ) {
    return a.x === b.x && a.y === b.y
  }
  return a === b
}

// -- coercion helpers ("never throw; coerce sensibly, record a problem") ---

function coerceNumber(value, ctx, blockId, label = 'a number') {
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(n)) return n
  pushProblem(ctx, { kind: 'type', blockId, message: `Expected ${label} here — using 0 instead.` })
  return 0
}

function coerceBoolean(value) {
  return Boolean(value)
}

function coerceString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if ('x' in value && 'y' in value) return `(${value.x}, ${value.y})`
    return JSON.stringify(value)
  }
  return String(value)
}

function coerceCell(value, ctx, blockId) {
  if (value && typeof value === 'object') {
    const x = Number(value.x)
    const y = Number(value.y)
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x: Math.round(x), y: Math.round(y) }
    }
  }
  pushProblem(ctx, { kind: 'type', blockId, message: 'Expected a room here — using (1, 1) instead.' })
  return { x: 1, y: 1 }
}

function coerceDirection(value, ctx, blockId) {
  const id = typeof value === 'string' ? value : value?.id
  if (DIRECTIONS.some((d) => d.id === id)) return id
  pushProblem(ctx, { kind: 'type', blockId, message: `"${value}" isn't a direction — using "north" instead.` })
  return 'north'
}

function coerceWallState(value, ctx, blockId) {
  if (value === WALL_RULES.open || value === WALL_RULES.closed || value === WALL_RULES.auto) return value
  pushProblem(ctx, { kind: 'type', blockId, message: `"${value}" isn't open/closed/auto — using "auto" instead.` })
  return WALL_RULES.auto
}

function resolveParty(value, ctx, blockId) {
  const id = typeof value === 'string' ? value : value?.id
  const party = ctx.partiesById.get(id)
  if (!party) {
    pushProblem(ctx, { kind: 'type', blockId, message: "I couldn't find that party." })
    return null
  }
  return party
}

// -- slot resolution ---------------------------------------------------

function readSlot(ctx, node, slotName) {
  const def = getBlockDef(node.type)
  const provided = node.inputs ? node.inputs[slotName] : undefined
  const slotDef = def?.slots?.find((s) => s.name === slotName)

  const value = provided !== undefined ? provided : { literal: true, value: slotDef?.default ?? null }

  if (isLiteral(value)) return value.value
  if (isBlockNode(value)) return evalReporter(value, ctx)
  return null
}

// -- statement execution ---------------------------------------------------

function execBody(list, ctx) {
  for (const block of list ?? []) {
    if (ctx.stopScript) break
    execStatement(block, ctx)
  }
}

function execStatement(block, ctx) {
  bumpOps(ctx, block.id)

  const def = getBlockDef(block.type)
  if (!def) {
    pushProblem(ctx, { kind: 'type', blockId: block.id, message: `Unknown block type "${block.type}".` })
    pushTrace(ctx, block.id)
    return
  }

  switch (block.type) {
    case 'for_each_party': {
      for (const party of ctx.world.parties) {
        if (ctx.stopScript) break
        ctx.currentPartyStack.push(party.id)
        execBody(block.body ?? [], ctx)
        ctx.currentPartyStack.pop()
      }
      break
    }
    case 'if': {
      const cond = coerceBoolean(readSlot(ctx, block, 'cond'))
      if (cond) execBody(block.body ?? [], ctx)
      break
    }
    case 'if_else': {
      const cond = coerceBoolean(readSlot(ctx, block, 'cond'))
      if (cond) execBody(block.body ?? [], ctx)
      else execBody(block.elseBody ?? [], ctx)
      break
    }
    case 'repeat': {
      const n = Math.max(0, Math.round(coerceNumber(readSlot(ctx, block, 'n'), ctx, block.id, 'a repeat count')))
      for (let i = 0; i < n; i += 1) {
        if (ctx.stopScript) break
        execBody(block.body ?? [], ctx)
      }
      break
    }
    case 'stop_script': {
      ctx.stopScript = true
      break
    }
    case 'move_party': {
      const party = resolveParty(readSlot(ctx, block, 'party'), ctx, block.id)
      const cell = coerceCell(readSlot(ctx, block, 'cell'), ctx, block.id)
      if (party) ctx.moveIntents.set(party.id, { to: cell, blockId: block.id })
      break
    }
    case 'party_wait': {
      const party = resolveParty(readSlot(ctx, block, 'party'), ctx, block.id)
      if (party) ctx.moveIntents.set(party.id, { to: { ...party.position }, blockId: block.id })
      break
    }
    case 'say': {
      const party = resolveParty(readSlot(ctx, block, 'party'), ctx, block.id)
      const text = coerceString(readSlot(ctx, block, 'text'))
      if (party) ctx.sayings.push({ partyId: party.id, text, blockId: block.id })
      break
    }
    case 'set_var': {
      const name = coerceString(readSlot(ctx, block, 'name'))
      const value = readSlot(ctx, block, 'value')
      ctx.variables[name] = value
      break
    }
    case 'change_var': {
      const name = coerceString(readSlot(ctx, block, 'name'))
      const n = coerceNumber(readSlot(ctx, block, 'n'), ctx, block.id, 'a change amount')
      const current = coerceNumber(ctx.variables[name] ?? 0, ctx, block.id, name)
      ctx.variables[name] = current + n
      break
    }
    case 'list_add': {
      const value = readSlot(ctx, block, 'value')
      const name = coerceString(readSlot(ctx, block, 'name'))
      ctx.variables[name] = [...coerceList(ctx, name), value]
      break
    }
    case 'list_remove': {
      const index = Math.round(coerceNumber(readSlot(ctx, block, 'index'), ctx, block.id, 'an item number'))
      const name = coerceString(readSlot(ctx, block, 'name'))
      const current = coerceList(ctx, name)
      if (index >= 1 && index <= current.length) {
        const next = [...current]
        next.splice(index - 1, 1)
        ctx.variables[name] = next
      } else {
        pushProblem(ctx, { kind: 'type', blockId: block.id, message: `There is no item ${index} in that list to remove.` })
      }
      break
    }
    case 'list_clear': {
      const name = coerceString(readSlot(ctx, block, 'name'))
      ctx.variables[name] = []
      break
    }
    case 'set_wall': {
      const direction = coerceDirection(readSlot(ctx, block, 'direction'), ctx, block.id)
      const cell = coerceCell(readSlot(ctx, block, 'cell'), ctx, block.id)
      const state = coerceWallState(readSlot(ctx, block, 'state'), ctx, block.id)
      const key = roomKey(cell)
      const room = ctx.rooms[key]
      if (room) {
        ctx.rooms = {
          ...ctx.rooms,
          [key]: { ...room, wallRules: { ...room.wallRules, [direction]: state } },
        }
      }
      break
    }
    case 'reserve_cell': {
      const cell = coerceCell(readSlot(ctx, block, 'cell'), ctx, block.id)
      ctx.reservations.add(roomKey(cell))
      break
    }
    case 'open_area': {
      const a = coerceCell(readSlot(ctx, block, 'cellA'), ctx, block.id)
      const b = coerceCell(readSlot(ctx, block, 'cellB'), ctx, block.id)
      const grid = ctx.world.grid
      const r = normalizeRect(a, b, grid)
      const draft = { ...ctx.rooms }
      for (let y = r.minY; y <= r.maxY; y += 1) {
        for (let x = r.minX; x <= r.maxX; x += 1) {
          if (x < r.maxX) setEdge(draft, grid, { x, y }, 'east', WALL_RULES.open)
          if (y < r.maxY) setEdge(draft, grid, { x, y }, 'south', WALL_RULES.open)
        }
      }
      ctx.rooms = draft
      break
    }
    case 'close_border': {
      const a = coerceCell(readSlot(ctx, block, 'cellA'), ctx, block.id)
      const b = coerceCell(readSlot(ctx, block, 'cellB'), ctx, block.id)
      const grid = ctx.world.grid
      const r = normalizeRect(a, b, grid)
      const draft = { ...ctx.rooms }
      for (let x = r.minX; x <= r.maxX; x += 1) {
        setEdge(draft, grid, { x, y: r.minY }, 'north', WALL_RULES.closed, false)
        setEdge(draft, grid, { x, y: r.maxY }, 'south', WALL_RULES.closed, false)
      }
      for (let y = r.minY; y <= r.maxY; y += 1) {
        setEdge(draft, grid, { x: r.minX, y }, 'west', WALL_RULES.closed, false)
        setEdge(draft, grid, { x: r.maxX, y }, 'east', WALL_RULES.closed, false)
      }
      ctx.rooms = draft
      break
    }
    case 'carve_corridor': {
      const a = coerceCell(readSlot(ctx, block, 'cellA'), ctx, block.id)
      const b = coerceCell(readSlot(ctx, block, 'cellB'), ctx, block.id)
      const grid = ctx.world.grid
      const draft = { ...ctx.rooms }
      let cx = clamp(a.x, 1, grid.width)
      let cy = clamp(a.y, 1, grid.height)
      const tx = clamp(b.x, 1, grid.width)
      const ty = clamp(b.y, 1, grid.height)
      // Walk straight across, then straight up/down, opening each door we cross.
      while (cx !== tx) {
        const dir = tx > cx ? 'east' : 'west'
        setEdge(draft, grid, { x: cx, y: cy }, dir, WALL_RULES.open)
        cx += tx > cx ? 1 : -1
      }
      while (cy !== ty) {
        const dir = ty > cy ? 'south' : 'north'
        setEdge(draft, grid, { x: cx, y: cy }, dir, WALL_RULES.open)
        cy += ty > cy ? 1 : -1
      }
      ctx.rooms = draft
      break
    }
    case 'seal_area': {
      // The recycling counterpart of open_area: close EVERY wall (interior +
      // border) of every cell in the rectangle, returning those cells to blank
      // sealed canvas. Sealing one side of an edge is enough (an edge counts as
      // closed when either side is), so syncNeighbor is false — this leaves any
      // neighbour just outside the rectangle untouched.
      const a = coerceCell(readSlot(ctx, block, 'cellA'), ctx, block.id)
      const b = coerceCell(readSlot(ctx, block, 'cellB'), ctx, block.id)
      const grid = ctx.world.grid
      const r = normalizeRect(a, b, grid)
      const draft = { ...ctx.rooms }
      for (let y = r.minY; y <= r.maxY; y += 1) {
        for (let x = r.minX; x <= r.maxX; x += 1) {
          for (const dir of DIRECTIONS) {
            setEdge(draft, grid, { x, y }, dir.id, WALL_RULES.closed, false)
          }
        }
      }
      ctx.rooms = draft
      break
    }
    case 'reset_all_walls': {
      const state = coerceWallState(readSlot(ctx, block, 'state'), ctx, block.id)
      const draft = {}
      for (const [key, room] of Object.entries(ctx.rooms)) {
        draft[key] = {
          ...room,
          wallRules: { north: state, east: state, south: state, west: state },
        }
      }
      ctx.rooms = draft
      break
    }
    default:
      // A reporter block placed where a statement was expected: harmless no-op.
      break
  }

  pushTrace(ctx, block.id)
}

// -- reporter evaluation ---------------------------------------------------

function evalReporter(block, ctx) {
  bumpOps(ctx, block.id)

  const def = getBlockDef(block.type)
  if (!def) {
    pushProblem(ctx, { kind: 'type', blockId: block.id, message: `Unknown block type "${block.type}".` })
    pushTrace(ctx, block.id, null, true)
    return null
  }

  let result = null

  switch (block.type) {
    case 'party_position': {
      const party = resolveParty(readSlot(ctx, block, 'party'), ctx, block.id)
      result = party ? { ...party.position } : null
      break
    }
    case 'party_goal': {
      const party = resolveParty(readSlot(ctx, block, 'party'), ctx, block.id)
      result = party ? { ...(party.goal ?? party.position) } : null
      break
    }
    case 'at_goal': {
      const party = resolveParty(readSlot(ctx, block, 'party'), ctx, block.id)
      result = party ? sameCell(party.position, party.goal ?? party.position) : false
      break
    }
    case 'current_party': {
      if (ctx.currentPartyStack.length === 0) {
        pushProblem(ctx, {
          kind: 'type',
          blockId: block.id,
          message: '"current party" only works inside a "for each party" block.',
        })
        result = null
      } else {
        result = ctx.currentPartyStack[ctx.currentPartyStack.length - 1]
      }
      break
    }
    case 'party_number': {
      const n = coerceNumber(readSlot(ctx, block, 'n'), ctx, block.id, 'a party number')
      const party = ctx.world.parties[Math.round(n) - 1]
      if (!party) {
        pushProblem(ctx, { kind: 'type', blockId: block.id, message: `There is no party #${Math.round(n)}.` })
      }
      result = party ? party.id : null
      break
    }
    case 'party_count': {
      result = ctx.world.parties.length
      break
    }
    case 'is_occupied': {
      const cell = coerceCell(readSlot(ctx, block, 'cell'), ctx, block.id)
      result = ctx.world.parties.some((p) => sameCell(p.position, cell))
      break
    }
    case 'is_reserved': {
      const cell = coerceCell(readSlot(ctx, block, 'cell'), ctx, block.id)
      result = ctx.reservations.has(roomKey(cell))
      break
    }
    case 'is_area_clear': {
      const a = coerceCell(readSlot(ctx, block, 'cellA'), ctx, block.id)
      const b = coerceCell(readSlot(ctx, block, 'cellB'), ctx, block.id)
      const r = normalizeRect(a, b, ctx.world.grid)
      result = !ctx.world.parties.some(
        (p) => p.position.x >= r.minX && p.position.x <= r.maxX && p.position.y >= r.minY && p.position.y <= r.maxY,
      )
      break
    }
    case 'is_area_sealed': {
      // The "is this space blank canvas?" test: true only when EVERY wall of
      // every cell in the rectangle is closed, so nothing can move through it.
      // (Cells on the grid edge count their off-grid walls as closed too.)
      const a = coerceCell(readSlot(ctx, block, 'cellA'), ctx, block.id)
      const b = coerceCell(readSlot(ctx, block, 'cellB'), ctx, block.id)
      const r = normalizeRect(a, b, ctx.world.grid)
      let sealed = true
      for (let y = r.minY; y <= r.maxY && sealed; y += 1) {
        for (let x = r.minX; x <= r.maxX && sealed; x += 1) {
          for (const dir of DIRECTIONS) {
            const nb = { x: x + dir.dx, y: y + dir.dy }
            if (getWallRuleForEdge({ x, y }, nb, ctx.rooms) !== WALL_RULES.closed) {
              sealed = false
              break
            }
          }
        }
      }
      result = sealed
      break
    }
    case 'is_wall_open': {
      const direction = coerceDirection(readSlot(ctx, block, 'direction'), ctx, block.id)
      const cell = coerceCell(readSlot(ctx, block, 'cell'), ctx, block.id)
      const dir = DIRECTIONS.find((d) => d.id === direction)
      const neighbor = { x: cell.x + dir.dx, y: cell.y + dir.dy }
      result = getWallRuleForEdge(cell, neighbor, ctx.rooms) !== WALL_RULES.closed
      break
    }
    case 'neighbor_of': {
      const direction = coerceDirection(readSlot(ctx, block, 'direction'), ctx, block.id)
      const cell = coerceCell(readSlot(ctx, block, 'cell'), ctx, block.id)
      const dir = DIRECTIONS.find((d) => d.id === direction)
      const neighbor = { x: cell.x + dir.dx, y: cell.y + dir.dy }
      result = inBounds(neighbor, ctx.world.grid) ? neighbor : null
      break
    }
    case 'next_step_toward': {
      const party = resolveParty(readSlot(ctx, block, 'party'), ctx, block.id)
      const target = coerceCell(readSlot(ctx, block, 'cell'), ctx, block.id)
      if (!party) {
        result = null
        break
      }
      const blocked = new Set()
      for (const other of ctx.world.parties) {
        if (other.id !== party.id) blocked.add(roomKey(other.position))
      }
      for (const key of ctx.reservations) blocked.add(key)

      if (sameCell(target, party.position)) {
        result = { ...party.position }
      } else {
        // findPath lets a BFS path terminate on a blocked cell (so it can
        // still route *toward* a temporarily occupied/reserved target and
        // get closer via free intermediate cells) — but the one step we
        // hand back must itself be free right now, so refuse to actually
        // take that final illegal step.
        const path = findPath(party.position, [target], ctx.world.grid, ctx.rooms, blocked)
        const step = path && path.length > 1 ? path[1] : null
        result = step && !blocked.has(roomKey(step)) ? { ...step } : { ...party.position }
      }
      break
    }
    case 'next_step_toward_or_closest': {
      const party = resolveParty(readSlot(ctx, block, 'party'), ctx, block.id)
      const target = coerceCell(readSlot(ctx, block, 'cell'), ctx, block.id)
      if (!party) {
        result = null
        break
      }
      const blocked = new Set()
      for (const other of ctx.world.parties) {
        if (other.id !== party.id) blocked.add(roomKey(other.position))
      }
      for (const key of ctx.reservations) blocked.add(key)

      if (sameCell(target, party.position)) {
        result = { ...party.position }
      } else {
        // Unlike next_step_toward, when no full path exists this walks toward
        // the closest reachable cell instead of staying put — so the party
        // advances right up to the last free room before an obstruction and
        // waits. Once a real path opens, findPathOrClosest returns the same
        // path findPath would, so it seamlessly resumes goal-seeking.
        const path = findPathOrClosest(party.position, [target], ctx.world.grid, ctx.rooms, blocked)
        const step = path && path.length > 1 ? path[1] : null
        result = step && !blocked.has(roomKey(step)) ? { ...step } : { ...party.position }
      }
      break
    }
    case 'distance_between': {
      const a = coerceCell(readSlot(ctx, block, 'cellA'), ctx, block.id)
      const b = coerceCell(readSlot(ctx, block, 'cellB'), ctx, block.id)
      result = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
      break
    }
    case 'cell_at': {
      const x = coerceNumber(readSlot(ctx, block, 'x'), ctx, block.id, 'an x number')
      const y = coerceNumber(readSlot(ctx, block, 'y'), ctx, block.id, 'a y number')
      result = { x: Math.round(x), y: Math.round(y) }
      break
    }
    case 'cell_x': {
      const cell = coerceCell(readSlot(ctx, block, 'cell'), ctx, block.id)
      result = cell.x
      break
    }
    case 'cell_y': {
      const cell = coerceCell(readSlot(ctx, block, 'cell'), ctx, block.id)
      result = cell.y
      break
    }
    case 'tick_number': {
      result = ctx.currentTick
      break
    }
    case 'random_number': {
      const min = coerceNumber(readSlot(ctx, block, 'min'), ctx, block.id, 'a minimum')
      const max = coerceNumber(readSlot(ctx, block, 'max'), ctx, block.id, 'a maximum')
      const lo = Math.round(Math.min(min, max))
      const hi = Math.round(Math.max(min, max))
      result = lo + Math.floor(Math.random() * (hi - lo + 1))
      break
    }
    case 'op_add': {
      result =
        coerceNumber(readSlot(ctx, block, 'a'), ctx, block.id, 'a') +
        coerceNumber(readSlot(ctx, block, 'b'), ctx, block.id, 'b')
      break
    }
    case 'op_subtract': {
      result =
        coerceNumber(readSlot(ctx, block, 'a'), ctx, block.id, 'a') -
        coerceNumber(readSlot(ctx, block, 'b'), ctx, block.id, 'b')
      break
    }
    case 'op_multiply': {
      result =
        coerceNumber(readSlot(ctx, block, 'a'), ctx, block.id, 'a') *
        coerceNumber(readSlot(ctx, block, 'b'), ctx, block.id, 'b')
      break
    }
    case 'op_equals': {
      result = valuesEqual(readSlot(ctx, block, 'a'), readSlot(ctx, block, 'b'))
      break
    }
    case 'op_greater': {
      result =
        coerceNumber(readSlot(ctx, block, 'a'), ctx, block.id, 'a') >
        coerceNumber(readSlot(ctx, block, 'b'), ctx, block.id, 'b')
      break
    }
    case 'op_less': {
      result =
        coerceNumber(readSlot(ctx, block, 'a'), ctx, block.id, 'a') <
        coerceNumber(readSlot(ctx, block, 'b'), ctx, block.id, 'b')
      break
    }
    case 'op_and': {
      result = coerceBoolean(readSlot(ctx, block, 'a')) && coerceBoolean(readSlot(ctx, block, 'b'))
      break
    }
    case 'op_or': {
      result = coerceBoolean(readSlot(ctx, block, 'a')) || coerceBoolean(readSlot(ctx, block, 'b'))
      break
    }
    case 'op_not': {
      result = !coerceBoolean(readSlot(ctx, block, 'a'))
      break
    }
    case 'get_var': {
      const name = coerceString(readSlot(ctx, block, 'name'))
      result = Object.prototype.hasOwnProperty.call(ctx.variables, name) ? ctx.variables[name] : 0
      break
    }
    case 'list_length': {
      const name = coerceString(readSlot(ctx, block, 'name'))
      result = coerceList(ctx, name).length
      break
    }
    case 'list_item': {
      const index = Math.round(coerceNumber(readSlot(ctx, block, 'index'), ctx, block.id, 'an item number'))
      const name = coerceString(readSlot(ctx, block, 'name'))
      const list = coerceList(ctx, name)
      if (index >= 1 && index <= list.length) {
        result = list[index - 1]
      } else {
        pushProblem(ctx, { kind: 'type', blockId: block.id, message: `There is no item ${index} in that list.` })
        result = null
      }
      break
    }
    case 'list_contains': {
      const name = coerceString(readSlot(ctx, block, 'name'))
      const value = readSlot(ctx, block, 'value')
      result = coerceList(ctx, name).some((item) => valuesEqual(item, value))
      break
    }
    case 'list_random': {
      const name = coerceString(readSlot(ctx, block, 'name'))
      const list = coerceList(ctx, name)
      if (list.length === 0) {
        pushProblem(ctx, { kind: 'type', blockId: block.id, message: 'That list is empty, so there is no item to pick.' })
        result = null
      } else {
        result = list[Math.floor(Math.random() * list.length)]
      }
      break
    }
    case 'list_is_empty': {
      const name = coerceString(readSlot(ctx, block, 'name'))
      result = coerceList(ctx, name).length === 0
      break
    }
    case 'random_direction': {
      const dirs = ['north', 'east', 'south', 'west']
      result = dirs[Math.floor(Math.random() * dirs.length)]
      break
    }
    default: {
      pushProblem(ctx, { kind: 'type', blockId: block.id, message: `"${block.type}" doesn't report a value.` })
      result = null
    }
  }

  pushTrace(ctx, block.id, result, true)
  return result
}

// -- top level ---------------------------------------------------------

/**
 * @param {object} program - a version-1 block program (see ast.js).
 * @param {object} world - { grid, rooms, parties, tick }.
 * @param {object} [runtime] - persistent companion state. `runtime.variables`
 *   is created and mutated in place so variables survive across ticks when
 *   the caller reuses the same runtime object. `runtime.strict` (boolean,
 *   default false) selects strict vs learning mode for the rule monitor.
 * @returns {{world, moves, violations, problems, trace, sayings, error}}
 */
export function runTick(program, world, runtime = {}) {
  if (!runtime.variables) runtime.variables = {}

  const currentTick = world.tick ?? 0

  const ctx = {
    world,
    rooms: world.rooms,
    variables: runtime.variables,
    reservations: new Set(),
    moveIntents: new Map(),
    trace: [],
    problems: [],
    sayings: [],
    opCount: 0,
    stopScript: false,
    currentPartyStack: [],
    currentTick,
    partiesById: new Map(world.parties.map((p) => [p.id, p])),
  }

  let budgetError = null

  try {
    const scripts = program?.scripts ?? []

    if (currentTick === 0) {
      for (const script of scripts) {
        if (script.hat?.type !== 'event_start') continue
        ctx.stopScript = false
        execBody(script.body ?? [], ctx)
      }
    }

    for (const script of scripts) {
      if (script.hat?.type !== 'event_tick') continue
      ctx.stopScript = false
      execBody(script.body ?? [], ctx)
    }

    for (const script of scripts) {
      if (script.hat?.type !== 'event_every_n_ticks') continue
      const n = Math.max(1, Math.round(coerceNumber(readSlot(ctx, script.hat, 'n'), ctx, script.hat.id, 'a tick interval')))
      if (currentTick % n !== 0) continue
      ctx.stopScript = false
      execBody(script.body ?? [], ctx)
    }
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      budgetError = { kind: 'budget', blockId: err.blockId }
    } else {
      throw err
    }
  }

  if (budgetError) {
    return {
      world,
      moves: [],
      violations: [],
      problems: ctx.problems,
      trace: ctx.trace,
      sayings: ctx.sayings,
      error: budgetError,
    }
  }

  // ---- apply move intents: adjacency + wall validation -------------------
  const grid = world.grid
  const appliedMoves = world.parties.map((party) => {
    const intent = ctx.moveIntents.get(party.id)
    let to = intent ? intent.to : party.position

    if (!sameCell(to, party.position) && !canTraverse(party.position, to, grid, ctx.rooms)) {
      pushProblem(ctx, {
        kind: 'move',
        partyId: party.id,
        blockId: intent?.blockId,
        message: `${party.name ?? party.id} tried to move somewhere it can't reach from here, so it waited instead.`,
      })
      to = { ...party.position }
    }

    return { partyId: party.id, from: { ...party.position }, to: { ...to } }
  })

  // ---- rule monitor: isolation + no-crossing ------------------------------
  // Reported for the coach/hints regardless of mode: what the program's raw
  // move intents would have produced.
  const violations = detectViolations(appliedMoves)

  let finalMoves = appliedMoves
  if (violations.length > 0 && runtime.strict) {
    // Revert the offending later-indexed party in each violation to a wait.
    // Reverting can itself surface a *new* violation (e.g. reverting one
    // side of a swap to "stay put" can put it back in the path of a third
    // party, or of the other swapper still moving into that cell) — so we
    // repeat until the applied moves are clean, capped so it can never loop
    // forever.
    const indexById = new Map(world.parties.map((p, i) => [p.id, i]))
    let currentMoves = appliedMoves
    let guard = world.parties.length + 1

    while (guard > 0) {
      guard -= 1
      const pending = detectViolations(currentMoves)
      if (pending.length === 0) break

      const reverted = new Set()
      for (const violation of pending) {
        if (violation.kind === 'swap') {
          // Reverting only one side of a head-on swap still forces a
          // collision on the other (its target IS the reverted party's
          // cell) — both sides have to wait for the swap to truly not
          // happen.
          for (const partyId of violation.partyIds) reverted.add(partyId)
        } else {
          const sorted = [...violation.partyIds].sort((a, b) => indexById.get(a) - indexById.get(b))
          for (const partyId of sorted.slice(1)) reverted.add(partyId)
        }
      }
      if (reverted.size === 0) break

      currentMoves = currentMoves.map((move) =>
        reverted.has(move.partyId) ? { ...move, to: { ...move.from } } : move,
      )
    }

    finalMoves = currentMoves
  }

  const movesWithEdges = finalMoves.map((move) => ({
    partyId: move.partyId,
    from: move.from,
    to: move.to,
    edgeId: edgeIdBetween(move.from, move.to),
  }))

  const nextParties = world.parties.map((party) => {
    const move = finalMoves.find((m) => m.partyId === party.id)
    return move ? { ...party, position: { ...move.to } } : { ...party }
  })

  const nextWorld = {
    ...world,
    parties: nextParties,
    rooms: ctx.rooms,
    tick: currentTick + 1,
    // Expose the live variable store (including list variables) on the
    // returned world so success checks / the coach can inspect it without a
    // separate channel. This is the same object as runtime.variables.
    variables: ctx.variables,
  }

  return {
    world: nextWorld,
    moves: movesWithEdges,
    violations,
    problems: ctx.problems,
    trace: ctx.trace,
    sayings: ctx.sayings,
    error: null,
  }
}
