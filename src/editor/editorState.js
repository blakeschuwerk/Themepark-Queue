// Pure state helpers for the block editor UI (selection, focus targets, drag
// hit-testing math, duplicate/insert/remove/move dispatch). Every function
// here is a plain function of its inputs — no React, no DOM, no localStorage.
// All actual AST mutation is delegated to src/blocks/ast.js; this module
// never hand-mutates a block or program.

import {
  createBlock,
  createScript,
  insertBlock,
  literal,
  makeId,
  moveBlock,
  removeBlock,
  setInput,
} from '../blocks/ast.js'
import { getBlockDef } from '../blocks/catalog.js'

// -- targets --------------------------------------------------------------
//
// A "target" names a container a new statement can be appended into:
//   { scriptId, containerPath }
// `containerPath` matches ast.js's shape: a list of { blockId, slot } steps
// descending from the script's top-level body into nested C-block bodies.

export function scriptTarget(scriptId) {
  return { scriptId, containerPath: [] }
}

export function childTarget(target, blockId, slot) {
  return { scriptId: target.scriptId, containerPath: [...target.containerPath, { blockId, slot }] }
}

export function sameTarget(a, b) {
  if (!a || !b) return a === b
  if (a.scriptId !== b.scriptId) return false
  if (a.containerPath.length !== b.containerPath.length) return false
  return a.containerPath.every(
    (step, i) => step.blockId === b.containerPath[i].blockId && step.slot === b.containerPath[i].slot,
  )
}

/** Reads the live block list a target currently points at (for rendering
 * and for drop-index math). Returns null if the target no longer exists
 * (e.g. its owning block was deleted). */
export function getContainerList(program, target) {
  const script = (program.scripts ?? []).find((s) => s.id === target.scriptId)
  if (!script) return null
  let container = script.body
  for (const step of target.containerPath) {
    const owner = findInList(container, step.blockId)
    if (!owner) return null
    container = owner[step.slot] ?? []
  }
  return container
}

function findInList(list, blockId) {
  for (const block of list ?? []) {
    if (block.id === blockId) return block
    if (block.body) {
      const found = findInList(block.body, blockId)
      if (found) return found
    }
    if (block.elseBody) {
      const found = findInList(block.elseBody, blockId)
      if (found) return found
    }
  }
  return null
}

/** Locates a statement block's script + container path + index. Read-only —
 * used to know where to insert a duplicate or a moved block. */
export function locate(program, blockId) {
  for (const script of program.scripts ?? []) {
    const hit = locateInContainer(script.body, blockId, [])
    if (hit) return { scriptId: script.id, ...hit }
  }
  return null
}

function locateInContainer(container, blockId, containerPath) {
  for (let index = 0; index < (container ?? []).length; index += 1) {
    const b = container[index]
    if (b.id === blockId) return { containerPath, index }
    if (b.body) {
      const nested = locateInContainer(b.body, blockId, [...containerPath, { blockId: b.id, slot: 'body' }])
      if (nested) return nested
    }
    if (b.elseBody) {
      const nested = locateInContainer(b.elseBody, blockId, [...containerPath, { blockId: b.id, slot: 'elseBody' }])
      if (nested) return nested
    }
  }
  return null
}

// -- creation / append / remove / move / duplicate -------------------------

/** Creates a brand-new script from a hat block type and appends it to the
 * program. Returns { program, target, blockId } — `target` points at the
 * new script's (empty) top-level body, ready to receive appended blocks. */
export function createScriptFromHat(program, hatType) {
  const def = getBlockDef(hatType)
  if (!def?.isHat) return { program, target: null, blockId: null }
  const script = createScript(hatType)
  const next = { ...program, scripts: [...(program.scripts ?? []), script] }
  return { program: next, target: scriptTarget(script.id), blockId: script.hat.id }
}

/** Appends a new statement block of `type` to the end of `target`'s
 * container. Returns { program, blockId }. No-op (same program, null id) if
 * `type` is a hat or `target` is missing. */
export function appendStatement(program, target, type) {
  const def = getBlockDef(type)
  if (!def || def.isHat || !target) return { program, blockId: null }
  const block = createBlock(type)
  const next = insertBlock(program, target.scriptId, target.containerPath, undefined, block)
  return { program: next, blockId: block.id }
}

/** Inserts a brand-new statement block of `type` into `target`'s container
 * at `index` (used by drag-from-palette, where the drop position matters —
 * unlike appendStatement, which always goes to the end). Returns
 * { program, blockId }. */
export function insertStatementAt(program, target, index, type) {
  const def = getBlockDef(type)
  if (!def || def.isHat || !target) return { program, blockId: null }
  const block = createBlock(type)
  const next = insertBlock(program, target.scriptId, target.containerPath, index, block)
  return { program: next, blockId: block.id }
}

/** Removes a statement block (and its subtree) from wherever it lives. */
export function removeStatement(program, blockId) {
  return removeBlock(program, blockId)
}

/** Removes an entire top-level script (hat + body) by id. */
export function removeScript(program, scriptId) {
  const scripts = (program.scripts ?? []).filter((s) => s.id !== scriptId)
  if (scripts.length === (program.scripts ?? []).length) return program
  return { ...program, scripts }
}

/** Moves a statement block (with its subtree) to a new container/index. */
export function moveStatement(program, blockId, toTarget, toIndex) {
  return moveBlock(program, blockId, toTarget.scriptId, toTarget.containerPath, toIndex)
}

/** Deep-clones a block subtree, assigning a fresh id to the block itself and
 * every nested reporter block / body / elseBody block — but never to
 * literals, which just carry values. */
export function regenerateIds(block) {
  const next = {
    id: makeId('blk'),
    type: block.type,
    inputs: Object.fromEntries(
      Object.entries(block.inputs ?? {}).map(([key, value]) => [
        key,
        value && value.literal === true ? { literal: true, value: cloneValue(value.value) } : regenerateIds(value),
      ]),
    ),
  }
  if (block.body) next.body = block.body.map(regenerateIds)
  if (block.elseBody) next.elseBody = block.elseBody.map(regenerateIds)
  return next
}

function cloneValue(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneValue)
  return { ...value }
}

/** Duplicates a statement block: finds it, regenerates ids for the whole
 * subtree, and inserts the copy right after the original in the same
 * container. Returns { program, blockId } (blockId of the new copy), or
 * { program, blockId: null } if the block can't be found. */
export function duplicateStatement(program, blockId) {
  const location = locate(program, blockId)
  if (!location) return { program, blockId: null }
  const list = getContainerList(program, { scriptId: location.scriptId, containerPath: location.containerPath })
  const original = list?.[location.index]
  if (!original) return { program, blockId: null }

  const copy = regenerateIds(original)
  const target = { scriptId: location.scriptId, containerPath: location.containerPath }
  const next = insertBlock(program, target.scriptId, target.containerPath, location.index + 1, copy)
  return { program: next, blockId: copy.id }
}

// -- slot editing -----------------------------------------------------------

/** Sets a slot to a literal value. */
export function setLiteral(program, blockId, slotName, value) {
  return setInput(program, blockId, slotName, literal(value))
}

/** Replaces a slot's contents with a brand-new reporter block of
 * `reporterType` (filled with its own catalog defaults). */
export function setReporter(program, blockId, slotName, reporterType) {
  const reporter = createBlock(reporterType)
  const next = setInput(program, blockId, slotName, reporter)
  return { program: next, blockId: reporter.id }
}

/** Pops a nested reporter block back out to the slot's catalog default
 * literal value. */
export function popReporter(program, blockId, slotName, defaultValue) {
  return setInput(program, blockId, slotName, literal(cloneValue(defaultValue)))
}

// -- reporter/slot compatibility --------------------------------------------

/** True if a reporter block returning `returns` may be dropped into a slot
 * of `valueType`. 'any' is a wildcard in both directions. */
export function isReturnCompatible(returns, valueType) {
  return returns === valueType || returns === 'any' || valueType === 'any'
}

/** Given the full catalog list (array of block defs) and a slot definition,
 * returns the reporter defs that may fill that slot. Dropdown-edited slots
 * (direction / wall state enums) never accept reporters. */
export function reporterOptionsForSlot(catalogList, slotDef) {
  if (!slotDef || slotDef.editor === 'dropdown') return []
  return catalogList.filter((def) => def.isReporter && isReturnCompatible(def.returns, slotDef.valueType))
}

// -- label rendering ----------------------------------------------------

/** Splits a catalog `labelTemplate` like "move {party} to {cell}" into an
 * ordered list of text runs and slot placeholders:
 * [{ kind: 'text', value }, { kind: 'slot', name }, ...] */
export function labelTokens(template) {
  const tokens = []
  const re = /\{(\w+)\}/g
  let lastIndex = 0
  let match = re.exec(template)
  while (match) {
    if (match.index > lastIndex) tokens.push({ kind: 'text', value: template.slice(lastIndex, match.index) })
    tokens.push({ kind: 'slot', name: match[1] })
    lastIndex = re.lastIndex
    match = re.exec(template)
  }
  if (lastIndex < template.length) tokens.push({ kind: 'text', value: template.slice(lastIndex) })
  return tokens
}

// -- drag hit-testing math ---------------------------------------------------

/** Given the top/bottom rects (in document or container-relative pixels) of
 * each child currently in a container, and a pointer Y position, returns the
 * index at which a dragged block should be inserted (0..rects.length). Pure
 * geometry — compares the pointer to each child's vertical midpoint. */
export function computeInsertIndex(rects, pointerY) {
  for (let i = 0; i < rects.length; i += 1) {
    const mid = (rects[i].top + rects[i].bottom) / 2
    if (pointerY < mid) return i
  }
  return rects.length
}

/** Picks the "best" (smallest-area) drop target among several candidate
 * container rects that contain the pointer — used so dropping into a nested
 * C-block body wins over the enclosing script body when both contain the
 * pointer. Candidates: [{ key, top, bottom, left, right }]. Returns the
 * candidate's key, or null if none contain the pointer. */
export function bestDropContainer(candidates, pointerX, pointerY) {
  let best = null
  let bestArea = Infinity
  for (const c of candidates) {
    if (pointerX < c.left || pointerX > c.right || pointerY < c.top || pointerY > c.bottom) continue
    const area = (c.bottom - c.top) * (c.right - c.left)
    if (area < bestArea) {
      bestArea = area
      best = c.key
    }
  }
  return best
}

// Every block that names a variable/list in its `name` slot. MUST list the
// list blocks too — a list like "trail" may only ever appear in list blocks,
// and would otherwise be invisible to the varname pickers (which then offer
// only the catalog default like "my_list", so the learner cannot select it).
export const VAR_BLOCK_TYPES = new Set([
  'set_var', 'change_var', 'get_var',
  'list_add', 'list_length', 'list_item', 'list_contains',
  'list_random', 'list_remove', 'list_is_empty', 'list_clear',
])

/** Every variable/list name currently written anywhere in the program, sorted.
 * Derived fresh from the live program, so a name appears in the pickers as soon
 * as any block references it and disappears once its last mention is removed
 * (and a freshly loaded starter shows only that program's names). */
export function collectVarNames(program) {
  const names = new Set()

  const visit = (block) => {
    if (!block || typeof block !== 'object') return
    if (VAR_BLOCK_TYPES.has(block.type)) {
      const nameInput = block.inputs?.name
      if (nameInput?.literal && typeof nameInput.value === 'string' && nameInput.value.trim()) {
        names.add(nameInput.value)
      }
    }
    for (const input of Object.values(block.inputs ?? {})) {
      if (input && typeof input === 'object' && typeof input.type === 'string') visit(input)
    }
    for (const child of block.body ?? []) visit(child)
    for (const child of block.elseBody ?? []) visit(child)
  }

  for (const script of program?.scripts ?? []) {
    visit(script.hat)
    for (const block of script.body ?? []) visit(block)
  }

  return [...names].sort()
}
