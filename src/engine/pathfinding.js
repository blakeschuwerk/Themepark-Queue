export const WALL_RULES = {
  auto: 'auto',
  closed: 'closed',
  open: 'open',
}

export const DIRECTIONS = [
  { id: 'north', dx: 0, dy: -1, opposite: 'south' },
  { id: 'east', dx: 1, dy: 0, opposite: 'west' },
  { id: 'south', dx: 0, dy: 1, opposite: 'north' },
  { id: 'west', dx: -1, dy: 0, opposite: 'east' },
]

export function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max)
}

export function roomKey({ x, y }) {
  return `${x},${y}`
}

export function sameCell(a, b) {
  return a.x === b.x && a.y === b.y
}

export function normalizeCell(cell, width, height) {
  return {
    x: clamp(cell?.x ?? 1, 1, width),
    y: clamp(cell?.y ?? 1, 1, height),
  }
}

export function makeRoom(x, y) {
  return {
    label: '',
    tint: '#303842',
    wallRules: {
      north: WALL_RULES.auto,
      east: WALL_RULES.auto,
      south: WALL_RULES.auto,
      west: WALL_RULES.auto,
    },
    x,
    y,
  }
}

export function ensureRooms(width, height, previousRooms = {}) {
  const rooms = {}

  // Cells are addressed 1..width / 1..height (cell (1,1) is the first cell).
  for (let y = 1; y <= height; y += 1) {
    for (let x = 1; x <= width; x += 1) {
      const key = roomKey({ x, y })
      rooms[key] = previousRooms[key] ?? makeRoom(x, y)
    }
  }

  return rooms
}

export function roomsArray(width, height, rooms) {
  return Array.from({ length: width * height }, (_, index) => {
    const x = (index % width) + 1
    const y = Math.floor(index / width) + 1
    return rooms[roomKey({ x, y })] ?? makeRoom(x, y)
  })
}

// Wall/edge ids are consumed only by Grid.jsx, whose wall-segment geometry
// runs on 0-based internal indices (boundary 0..width between cells). Cells
// are now addressed 1-based, so convert here: subtract 1 to land back on the
// geometry index scheme the wall ids use.
export function edgeIdBetween(a, b) {
  if (sameCell(a, b)) return null

  if (a.x !== b.x) {
    return `v-${Math.max(a.x, b.x) - 1}-${a.y - 1}`
  }

  return `h-${a.x - 1}-${Math.max(a.y, b.y) - 1}`
}

export function directionBetween(a, b) {
  return DIRECTIONS.find(
    (direction) => a.x + direction.dx === b.x && a.y + direction.dy === b.y,
  )
}

function inBounds(cell, grid) {
  return (
    cell.x >= 1 &&
    cell.y >= 1 &&
    cell.x <= grid.width &&
    cell.y <= grid.height
  )
}

export function getWallRuleForEdge(from, to, rooms) {
  const direction = directionBetween(from, to)

  if (!direction) {
    return WALL_RULES.closed
  }

  const fromRoom = rooms[roomKey(from)]
  const toRoom = rooms[roomKey(to)]
  const fromRule = fromRoom?.wallRules?.[direction.id] ?? WALL_RULES.auto
  const toRule = toRoom?.wallRules?.[direction.opposite] ?? WALL_RULES.auto

  if (fromRule === WALL_RULES.closed || toRule === WALL_RULES.closed) {
    return WALL_RULES.closed
  }

  if (fromRule === WALL_RULES.open || toRule === WALL_RULES.open) {
    return WALL_RULES.open
  }

  return WALL_RULES.auto
}

export function canTraverse(from, to, grid, rooms) {
  return (
    inBounds(from, grid) &&
    inBounds(to, grid) &&
    Math.abs(from.x - to.x) + Math.abs(from.y - to.y) === 1 &&
    getWallRuleForEdge(from, to, rooms) !== WALL_RULES.closed
  )
}

export function getNeighbors(cell, grid, rooms) {
  return DIRECTIONS.map((direction) => ({
    x: cell.x + direction.dx,
    y: cell.y + direction.dy,
  })).filter((neighbor) => canTraverse(cell, neighbor, grid, rooms))
}

/**
 * Generic BFS pathfinder. Returns the full path (array of cells, start
 * inclusive) from `start` to the nearest cell in `targets`, or null if
 * unreachable. `blockedKeys` (a Set of roomKey strings) marks cells that
 * may not be entered or passed through, except when they are themselves a
 * target cell (so you can still path onto an occupied/reserved goal).
 */
export function findPath(start, targets, grid, rooms, blockedKeys = new Set()) {
  if (targets.length === 0) return [start]

  const targetKeys = new Set(targets.map(roomKey))
  const queue = [{ cell: start, path: [start] }]
  const visited = new Set([roomKey(start)])

  while (queue.length > 0) {
    const current = queue.shift()

    if (targetKeys.has(roomKey(current.cell))) {
      return current.path
    }

    for (const neighbor of getNeighbors(current.cell, grid, rooms)) {
      const key = roomKey(neighbor)

      if (visited.has(key)) continue
      if (blockedKeys.has(key) && !targetKeys.has(key)) continue

      visited.add(key)
      queue.push({
        cell: neighbor,
        path: [...current.path, neighbor],
      })
    }
  }

  return null
}

/**
 * Like findPath, but never gives up empty-handed: if no target cell is
 * reachable, it returns the path to the reachable cell that ends up *closest*
 * to the target, counting grid steps to the target (fewest up/down/left/right
 * moves, ignoring walls) rather than Euclidean straight-line distance. When a
 * target IS reachable the result is identical to findPath. Returns at least
 * `[start]`.
 *
 * The distance-to-target is measured on the open grid (Manhattan), NOT along
 * the traversable graph — because when the target is walled off entirely (a
 * shut gate room between two corridors), there is no corridor from the party's
 * side to the target at all, yet we still want the party to walk up to the
 * cell nearest the obstruction and wait there. Manhattan proximity picks that
 * threshold cell; ties break toward fewer steps from the start.
 */
export function findPathOrClosest(start, targets, grid, rooms, blockedKeys = new Set()) {
  const direct = findPath(start, targets, grid, rooms, blockedKeys)
  if (direct) return direct

  const gridStepsToTarget = (cell) =>
    Math.min(...targets.map((t) => Math.abs(cell.x - t.x) + Math.abs(cell.y - t.y)))

  // BFS over the cells we can actually reach right now, keeping the reachable
  // cell that lands closest to the target on the open grid.
  const queue = [{ cell: start, path: [start] }]
  const visited = new Set([roomKey(start)])
  let best = { path: [start], dist: gridStepsToTarget(start), steps: 0 }

  while (queue.length > 0) {
    const current = queue.shift()
    const dist = gridStepsToTarget(current.cell)
    const steps = current.path.length - 1
    if (dist < best.dist || (dist === best.dist && steps < best.steps)) {
      best = { path: current.path, dist, steps }
    }
    for (const neighbor of getNeighbors(current.cell, grid, rooms)) {
      const key = roomKey(neighbor)
      if (visited.has(key)) continue
      if (blockedKeys.has(key)) continue
      visited.add(key)
      queue.push({ cell: neighbor, path: [...current.path, neighbor] })
    }
  }

  return best.path
}
