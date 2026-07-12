// The rule-based hint engine (BLOCKS_SPEC.md §7.2). `computeHints` is a pure
// function: given the current program, a rolling window of recent
// TickResults (oldest first, the same shape `useSandboxEngine`'s
// `lastTickResults` keeps), and a bit of lesson state, it returns the list
// of hints that currently apply. `createHintTracker` wraps it with the
// dedup lifecycle: a hint id fires once, stays visible until its condition
// clears, and can only fire again after a real gap.

import { findPath } from '../engine/pathfinding.js'

const STUCK_TICKS = 10

function isBlockNode(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.type === 'string'
}

function makeHint(id, severity, message, blockId) {
  const hint = { id, severity, message }
  if (blockId) hint.blockId = blockId
  return hint
}

// -- rule: no hat script -------------------------------------------------

function ruleNoHatScript(program) {
  const scripts = program?.scripts ?? []
  const hasRunnableScript = scripts.some(
    (s) => s.hat && (s.hat.type === 'event_tick' || s.hat.type === 'event_start' || s.hat.type === 'event_every_n_ticks'),
  )
  if (hasRunnableScript) return null
  return makeHint(
    'no-hat-script',
    'warn',
    'Blocks only run inside an "every tick" script (or "when simulation starts", or "every N ticks"). Drag one of those hat blocks in first, then build inside it.',
  )
}

// -- rule: nothing in the program actually moves a party -----------------

function countStatementsAndMoves(list, acc) {
  for (const block of list ?? []) {
    acc.statements += 1
    if (block.type === 'move_party') acc.moves += 1
    if (block.body) countStatementsAndMoves(block.body, acc)
    if (block.elseBody) countStatementsAndMoves(block.elseBody, acc)
  }
}

function ruleNoMovement(program) {
  const acc = { statements: 0, moves: 0 }
  for (const script of program?.scripts ?? []) {
    // only count scripts that actually run
    const t = script.hat?.type
    if (t === 'event_tick' || t === 'event_start' || t === 'event_every_n_ticks') {
      countStatementsAndMoves(script.body ?? [], acc)
    }
  }
  // Don't nag an empty workspace — only once the learner has started building
  // but hasn't added the block that makes a party actually go somewhere.
  if (acc.statements === 0 || acc.moves > 0) return null
  return makeHint(
    'no-move-block',
    'warn',
    'Nothing in your program tells a party to move yet, so no one will budge when you press Run. Add a "move party to cell" block (from the MOTION group) — usually as the last block inside your loop.',
  )
}

// -- rule: current_party outside for_each_party --------------------------

function scanForCurrentPartyMisuse(list, insideForEach, hits) {
  for (const block of list ?? []) {
    if (block.type === 'current_party' && !insideForEach) {
      hits.push(block.id)
    }
    for (const value of Object.values(block.inputs ?? {})) {
      if (isBlockNode(value)) {
        if (value.type === 'current_party' && !insideForEach) hits.push(value.id)
        scanForCurrentPartyMisuse([value], insideForEach, hits)
      }
    }
    const nowInside = insideForEach || block.type === 'for_each_party'
    if (block.body) scanForCurrentPartyMisuse(block.body, nowInside, hits)
    if (block.elseBody) scanForCurrentPartyMisuse(block.elseBody, nowInside, hits)
  }
}

function ruleCurrentPartyMisuse(program) {
  const hits = []
  for (const script of program?.scripts ?? []) {
    scanForCurrentPartyMisuse(script.body ?? [], false, hits)
  }
  if (hits.length === 0) return null
  return makeHint(
    'current-party-outside-for-each',
    'alert',
    '"current party" only makes sense inside a "for each party" block — it means "whichever party this repeat is currently handling." Outside of one, there is no current party to report.',
    hits[0],
  )
}

// -- rule: collision violation --------------------------------------------

function ruleCollision(recentTickResults) {
  const last = recentTickResults[recentTickResults.length - 1]
  const collision = last?.violations?.find((v) => v.kind === 'collision')
  if (!collision) return null
  return makeHint(
    'collision-detected',
    'warn',
    'Two parties just tried to stand in the same room at once — every room can only hold one party. Try checking "is {cell} occupied?" before moving, or better yet, "reserve" your next room before you move so nobody else can claim it too.',
  )
}

// -- rule: swap violation --------------------------------------------------

function ruleSwap(recentTickResults) {
  const last = recentTickResults[recentTickResults.length - 1]
  const swap = last?.violations?.find((v) => v.kind === 'swap')
  if (!swap) return null
  return makeHint(
    'swap-trap',
    'warn',
    'Two parties just swapped rooms head-on — that counts as a crossing violation even though neither room was ever "shared." Reserving your destination is not enough to stop this: try also reserving your own current room, so the other party sees it as taken.',
  )
}

// -- rule: stuck party -----------------------------------------------------

function ruleStuckParty(recentTickResults) {
  if (recentTickResults.length < STUCK_TICKS) return null
  const window = recentTickResults.slice(-STUCK_TICKS)
  const firstWorld = window[0].world
  const lastWorld = window[window.length - 1].world
  if (!firstWorld || !lastWorld) return null

  for (const party of lastWorld.parties ?? []) {
    if (!party.goal) continue
    if (party.position.x === party.goal.x && party.position.y === party.goal.y) continue

    const before = firstWorld.parties?.find((p) => p.id === party.id)
    if (!before) continue

    const stillStuck = window.every((result) => {
      const p = result.world?.parties?.find((pp) => pp.id === party.id)
      return p && p.position.x === before.position.x && p.position.y === before.position.y
    })

    if (stillStuck) {
      return makeHint(
        'stuck-party',
        'info',
        `${party.name ?? 'A party'} hasn't moved in the last ${STUCK_TICKS} ticks and still isn't at its goal. It may be waiting on something that never happens — check whether it's stuck behind an occupied or reserved room, or a closed wall.`,
      )
    }
  }
  return null
}

// -- rule: budget / infinite loop -------------------------------------------

function findLoopBlockId(program) {
  function scan(list) {
    for (const block of list ?? []) {
      if (block.type === 'repeat') return block.id
      const found = (block.body && scan(block.body)) || (block.elseBody && scan(block.elseBody))
      if (found) return found
    }
    return null
  }
  for (const script of program?.scripts ?? []) {
    const found = scan(script.body ?? [])
    if (found) return found
  }
  return null
}

function ruleBudget(program, recentTickResults) {
  const last = recentTickResults[recentTickResults.length - 1]
  if (!last?.error || last.error.kind !== 'budget') return null
  const loopBlockId = last.error.blockId ?? findLoopBlockId(program)
  return makeHint(
    'budget-exceeded',
    'alert',
    "This script ran way too many steps in a single tick — that usually means a loop is running forever. Double check any \"repeat\" block's count, or a condition it depends on, so it can't spin endlessly.",
    loopBlockId,
  )
}

// -- rule: unreachable goal (BFS) ------------------------------------------

function ruleUnreachableGoal(lessonState) {
  const world = lessonState?.world
  if (!world) return null

  for (const party of world.parties ?? []) {
    if (!party.goal) continue
    const path = findPath(party.position, [party.goal], world.grid, world.rooms, new Set())
    if (!path) {
      return makeHint(
        'unreachable-goal',
        'alert',
        `${party.name ?? 'A party'}'s goal room can't be reached at all right now — a closed wall may be sealing off the only route. Try opening a wall with "set wall {direction} of {cell} to open".`,
      )
    }
  }
  return null
}

// -- rule: interpreter type problems ---------------------------------------

function ruleTypeProblems(recentTickResults) {
  const last = recentTickResults[recentTickResults.length - 1]
  const problem = (last?.problems ?? []).find((p) => p.kind === 'type')
  if (!problem) return null
  return makeHint('type-problem', 'info', problem.message, problem.blockId)
}

const RULES = [
  ruleNoHatScript,
  ruleNoMovement,
  ruleCurrentPartyMisuse,
  (program, recentTickResults) => ruleCollision(recentTickResults),
  (program, recentTickResults) => ruleSwap(recentTickResults),
  (program, recentTickResults) => ruleStuckParty(recentTickResults),
  (program, recentTickResults) => ruleBudget(program, recentTickResults),
  (program, recentTickResults, lessonState) => ruleUnreachableGoal(lessonState),
  (program, recentTickResults) => ruleTypeProblems(recentTickResults),
]

/** Pure: returns every hint that currently applies, in rule-declaration
 * order. `recentTickResults` should be oldest-first (matches
 * `useSandboxEngine`'s `lastTickResults`). `lessonState` may carry
 * `{ world }` for checks (like reachability) that need the live world. */
export function computeHints(program, recentTickResults = [], lessonState = {}) {
  const hints = []
  for (const rule of RULES) {
    const hit = rule(program, recentTickResults, lessonState)
    if (hit) hints.push(hit)
  }
  return hints
}

// -- dedup lifecycle wrapper -------------------------------------------
//
// A fired hint stays visible until its condition clears (i.e. computeHints
// stops returning that id), and only fires again after a real gap (it
// disappeared, then reappeared) rather than re-triggering every tick while
// the condition is continuously true. The tracker itself only *hides*
// hints on the tick they clear; the caller decides how to render "still
// active" vs "newly fired" if it cares (all currently-active hints are
// simply returned each call).

export function createHintTracker() {
  let activeIds = new Set()

  return {
    /** Runs computeHints and updates internal active-id bookkeeping. Returns
     * the full list of currently-active hints (each still fires while its
     * condition holds; ids that clear are dropped and can fire again
     * later). */
    update(program, recentTickResults = [], lessonState = {}) {
      const hints = computeHints(program, recentTickResults, lessonState)
      activeIds = new Set(hints.map((h) => h.id))
      return hints
    },
    isActive(id) {
      return activeIds.has(id)
    },
    reset() {
      activeIds = new Set()
    },
  }
}

export default computeHints
