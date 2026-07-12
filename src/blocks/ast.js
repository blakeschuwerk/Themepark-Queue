// Pure helpers for building and editing block programs (the AST described in
// BLOCKS_SPEC.md §4.2). Nothing here mutates its inputs — every function
// returns a new program object. No React, no DOM.

import { getBlockDef } from './catalog.js'

let idCounter = 0

/** A small, dependency-free unique id generator (nanoid-style). */
export function makeId(prefix = 'b') {
  idCounter += 1
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${random}`
}

function isBlock(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.type === 'string'
}

function isLiteral(value) {
  return Boolean(value) && typeof value === 'object' && value.literal === true
}

export function literal(value) {
  return { literal: true, value }
}

/** Creates a brand-new block of `type`, with every slot filled from the
 * catalog's default literal value, and empty body/elseBody arrays for
 * blocks that need them. */
export function createBlock(type, overrides = {}) {
  const def = getBlockDef(type)
  const inputs = {}

  if (def) {
    for (const slot of def.slots) {
      inputs[slot.name] = literal(cloneValue(slot.default))
    }
  }

  const block = {
    id: overrides.id ?? makeId('blk'),
    type,
    inputs: { ...inputs, ...(overrides.inputs ?? {}) },
  }

  if (def?.hasBody || overrides.body) {
    block.body = overrides.body ?? []
  }

  if (def?.hasElseBody || overrides.elseBody) {
    block.elseBody = overrides.elseBody ?? []
  }

  return block
}

/** Creates a brand-new top-level script: a hat block plus its body. */
export function createScript(hatType, body = [], overrides = {}) {
  return {
    id: overrides.id ?? makeId('script'),
    hat: createBlock(hatType, overrides.hat ?? {}),
    body,
  }
}

export function createProgram(scripts = []) {
  return { version: 1, scripts }
}

function cloneValue(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneValue)
  return { ...value }
}

function cloneBlock(block) {
  if (!isBlock(block)) return block

  const cloned = {
    id: block.id,
    type: block.type,
    inputs: Object.fromEntries(
      Object.entries(block.inputs ?? {}).map(([key, value]) => [key, cloneInput(value)]),
    ),
  }

  if (block.body) cloned.body = block.body.map(cloneBlock)
  if (block.elseBody) cloned.elseBody = block.elseBody.map(cloneBlock)

  return cloned
}

function cloneInput(value) {
  if (isLiteral(value)) return literal(cloneValue(value.value))
  if (isBlock(value)) return cloneBlock(value)
  return value
}

function cloneScript(script) {
  return {
    id: script.id,
    hat: cloneBlock(script.hat),
    body: (script.body ?? []).map(cloneBlock),
  }
}

export function cloneProgram(program) {
  return {
    version: program.version ?? 1,
    scripts: (program.scripts ?? []).map(cloneScript),
  }
}

// -- container navigation ---------------------------------------------------
//
// A "location" describes where a statement block lives:
//   { scriptId, containerPath }
// `containerPath` is a list of steps to descend from the script's top-level
// body into nested C-block bodies:
//   [] -> the script's own top-level body array
//   [{ blockId, slot: 'body' | 'elseBody' }, ...] -> descend into that
//   block's body/elseBody, repeating for further nesting.

function getContainer(script, containerPath) {
  let container = script.body

  for (const step of containerPath) {
    const owner = container.find((b) => b.id === step.blockId)
    if (!owner) return null
    if (!owner[step.slot]) owner[step.slot] = []
    container = owner[step.slot]
  }

  return container
}

function withScript(program, scriptId, updater) {
  let touched = false
  const scripts = program.scripts.map((script) => {
    if (script.id !== scriptId) return script
    touched = true
    const draft = cloneScript(script)
    updater(draft)
    return draft
  })

  if (!touched) return program
  return { ...program, scripts }
}

/** Inserts `block` into the container at `containerPath` within script
 * `scriptId`, at `index` (defaults to the end). Returns a new program. */
export function insertBlock(program, scriptId, containerPath, index, block) {
  return withScript(program, scriptId, (script) => {
    const container = getContainer(script, containerPath)
    if (!container) return
    const at = index == null || index < 0 || index > container.length ? container.length : index
    container.splice(at, 0, cloneBlock(block))
  })
}

/** Finds a block anywhere in the program: script hats, statement bodies,
 * elseBodies, and nested reporter inputs. Returns the block or null. */
export function findBlock(program, blockId) {
  for (const script of program.scripts ?? []) {
    if (script.hat?.id === blockId) return script.hat
    const found = findInList(script.body, blockId) ?? findInBlock(script.hat, blockId)
    if (found) return found
  }
  return null
}

function findInBlock(block, blockId) {
  if (!isBlock(block)) return null
  if (block.id === blockId) return block

  for (const value of Object.values(block.inputs ?? {})) {
    if (isBlock(value)) {
      const found = findInBlock(value, blockId)
      if (found) return found
    }
  }

  if (block.body) {
    const found = findInList(block.body, blockId)
    if (found) return found
  }

  if (block.elseBody) {
    const found = findInList(block.elseBody, blockId)
    if (found) return found
  }

  return null
}

function findInList(list, blockId) {
  for (const block of list ?? []) {
    const found = findInBlock(block, blockId)
    if (found) return found
  }
  return null
}

/** Locates a statement block's container info: { scriptId, containerPath,
 * container, index }. Only searches body/elseBody statement containers (not
 * reporter input slots) since only statements live in containers. */
function locateStatement(program, blockId) {
  for (const script of program.scripts ?? []) {
    const hit = locateInContainer(script.body, blockId, [])
    if (hit) return { scriptId: script.id, ...hit }
  }
  return null
}

function locateInContainer(container, blockId, containerPath) {
  for (let index = 0; index < (container ?? []).length; index += 1) {
    const b = container[index]
    if (b.id === blockId) {
      return { containerPath, container, index }
    }
    if (b.body) {
      const nested = locateInContainer(b.body, blockId, [
        ...containerPath,
        { blockId: b.id, slot: 'body' },
      ])
      if (nested) return nested
    }
    if (b.elseBody) {
      const nested = locateInContainer(b.elseBody, blockId, [
        ...containerPath,
        { blockId: b.id, slot: 'elseBody' },
      ])
      if (nested) return nested
    }
  }
  return null
}

/** Removes the statement block with id `blockId` (and its whole subtree)
 * from wherever it lives. No-op (returns the same program) if not found. */
export function removeBlock(program, blockId) {
  const location = locateStatement(program, blockId)
  if (!location) return program

  return withScript(program, location.scriptId, (script) => {
    const container = getContainer(script, location.containerPath)
    if (!container) return
    const index = container.findIndex((b) => b.id === blockId)
    if (index >= 0) container.splice(index, 1)
  })
}

/** Moves a statement block (with its subtree) to a new location. Returns
 * the same program if the source block cannot be found. */
export function moveBlock(program, blockId, toScriptId, toContainerPath, toIndex) {
  const location = locateStatement(program, blockId)
  if (!location) return program

  const block = location.container[location.index]
  const withoutBlock = removeBlock(program, blockId)
  return insertBlock(withoutBlock, toScriptId, toContainerPath, toIndex, block)
}

/** Sets a block's input slot to either a literal value (wrapped
 * automatically) or a Literal/Block already in AST shape. Searches the
 * whole program (hats, statement bodies, and nested reporter slots). */
export function setInput(program, blockId, slotName, value) {
  const wrapped = isLiteral(value) || isBlock(value) ? value : literal(value)
  const next = cloneProgram(program)

  for (const script of next.scripts) {
    if (script.hat?.id === blockId) {
      script.hat.inputs = { ...script.hat.inputs, [slotName]: wrapped }
      return next
    }
    if (setInputInList(script.body, blockId, slotName, wrapped)) return next
  }

  return program
}

function setInputInBlock(block, blockId, slotName, wrapped) {
  if (!isBlock(block)) return false

  if (block.id === blockId) {
    block.inputs = { ...block.inputs, [slotName]: wrapped }
    return true
  }

  for (const value of Object.values(block.inputs ?? {})) {
    if (isBlock(value) && setInputInBlock(value, blockId, slotName, wrapped)) return true
  }

  if (block.body && setInputInList(block.body, blockId, slotName, wrapped)) return true
  if (block.elseBody && setInputInList(block.elseBody, blockId, slotName, wrapped)) return true

  return false
}

function setInputInList(list, blockId, slotName, wrapped) {
  for (const block of list ?? []) {
    if (setInputInBlock(block, blockId, slotName, wrapped)) return true
  }
  return false
}

// -- serialization ------------------------------------------------------

export function serialize(program) {
  return JSON.stringify(program)
}

export function deserialize(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json
  return cloneProgram(parsed)
}

// -- validation ------------------------------------------------------

const VALID_HATS = new Set(['event_start', 'event_tick', 'event_every_n_ticks'])

function validateBlock(block, errors, path) {
  if (!isBlock(block)) {
    errors.push({ path, message: 'Not a block.' })
    return
  }

  const def = getBlockDef(block.type)
  if (!def) {
    errors.push({ blockId: block.id, path, message: `Unknown block type "${block.type}".` })
    return
  }

  for (const slotDef of def.slots) {
    const value = block.inputs?.[slotDef.name]
    if (value === undefined) continue
    if (isBlock(value)) {
      validateBlock(value, errors, `${path}.${slotDef.name}`)
    } else if (!isLiteral(value)) {
      errors.push({
        blockId: block.id,
        path: `${path}.${slotDef.name}`,
        message: `Slot "${slotDef.name}" is neither a literal nor a block.`,
      })
    }
  }

  if (def.hasBody) {
    for (const [index, child] of (block.body ?? []).entries()) {
      validateBlock(child, errors, `${path}.body[${index}]`)
    }
  }

  if (def.hasElseBody) {
    for (const [index, child] of (block.elseBody ?? []).entries()) {
      validateBlock(child, errors, `${path}.elseBody[${index}]`)
    }
  }
}

/** Structural validation: unknown block types, hats used out of place,
 * malformed inputs. Returns { valid, errors: [{ blockId?, path, message }] }. */
export function validate(program) {
  const errors = []

  if (!program || program.version !== 1 || !Array.isArray(program.scripts)) {
    return { valid: false, errors: [{ path: 'program', message: 'Not a version-1 program.' }] }
  }

  program.scripts.forEach((script, scriptIndex) => {
    const path = `scripts[${scriptIndex}]`

    if (!script.hat || !VALID_HATS.has(script.hat.type)) {
      errors.push({
        path: `${path}.hat`,
        message: 'A script must start with a "when simulation starts" or "every tick" block.',
      })
    } else {
      validateBlock(script.hat, errors, `${path}.hat`)
    }

    for (const [index, block] of (script.body ?? []).entries()) {
      validateBlock(block, errors, `${path}.body[${index}]`)
    }
  })

  return { valid: errors.length === 0, errors }
}
