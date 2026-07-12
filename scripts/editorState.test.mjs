import test from 'node:test'
import assert from 'node:assert/strict'
import { createBlock, createProgram, createScript, findBlock, insertBlock } from '../src/blocks/ast.js'
import { BLOCK_CATALOG } from '../src/blocks/catalog.js'
import {
  appendStatement,
  bestDropContainer,
  childTarget,
  collectVarNames,
  computeInsertIndex,
  createScriptFromHat,
  duplicateStatement,
  getContainerList,
  insertStatementAt,
  isReturnCompatible,
  labelTokens,
  locate,
  moveStatement,
  popReporter,
  regenerateIds,
  removeStatement,
  reporterOptionsForSlot,
  sameTarget,
  scriptTarget,
  setLiteral,
  setReporter,
} from '../src/editor/editorState.js'

const CATALOG_LIST = Object.values(BLOCK_CATALOG)

test('createScriptFromHat adds a new script and returns a target at its empty body', () => {
  const program = createProgram([])
  const { program: next, target, blockId } = createScriptFromHat(program, 'event_tick')

  assert.equal(next.scripts.length, 1)
  assert.equal(next.scripts[0].hat.type, 'event_tick')
  assert.equal(blockId, next.scripts[0].hat.id)
  assert.deepEqual(target, scriptTarget(next.scripts[0].id))
  assert.deepEqual(getContainerList(next, target), [])
  // original untouched
  assert.equal(program.scripts.length, 0)
})

test('createScriptFromHat refuses non-hat types', () => {
  const program = createProgram([])
  const result = createScriptFromHat(program, 'move_party')
  assert.equal(result.program, program)
  assert.equal(result.target, null)
})

test('appendStatement appends to the end of a target container', () => {
  const program = createProgram([])
  const { program: p1, target } = createScriptFromHat(program, 'event_tick')
  const { program: p2, blockId: id1 } = appendStatement(p1, target, 'party_wait')
  const { program: p3, blockId: id2 } = appendStatement(p2, target, 'stop_script')

  const list = getContainerList(p3, target)
  assert.equal(list.length, 2)
  assert.equal(list[0].id, id1)
  assert.equal(list[1].id, id2)
})

test('appendStatement into a nested C-block body via childTarget', () => {
  const program = createProgram([])
  const { program: p1, target: topTarget } = createScriptFromHat(program, 'event_tick')
  const { program: p2, blockId: ifId } = appendStatement(p1, topTarget, 'if_else')

  const bodyTarget = childTarget(topTarget, ifId, 'body')
  const elseTarget = childTarget(topTarget, ifId, 'elseBody')

  const { program: p3, blockId: waitId } = appendStatement(p2, bodyTarget, 'party_wait')
  const { program: p4, blockId: stopId } = appendStatement(p3, elseTarget, 'stop_script')

  const ifBlock = findBlock(p4, ifId)
  assert.equal(ifBlock.body[0].id, waitId)
  assert.equal(ifBlock.elseBody[0].id, stopId)
})

test('appendStatement refuses to append a hat type', () => {
  const program = createProgram([])
  const { program: p1, target } = createScriptFromHat(program, 'event_tick')
  const { program: p2, blockId } = appendStatement(p1, target, 'event_start')
  assert.equal(blockId, null)
  assert.equal(p2, p1)
})

test('removeStatement removes a block and its subtree', () => {
  const program = createProgram([])
  const { program: p1, target } = createScriptFromHat(program, 'event_tick')
  const { program: p2, blockId: ifId } = appendStatement(p1, target, 'if')
  const bodyTarget = childTarget(target, ifId, 'body')
  const { program: p3, blockId: waitId } = appendStatement(p2, bodyTarget, 'party_wait')

  const p4 = removeStatement(p3, ifId)
  assert.equal(findBlock(p4, ifId), null)
  assert.equal(findBlock(p4, waitId), null)
})

test('moveStatement relocates a block into a different container', () => {
  const program = createProgram([])
  const { program: p1, target } = createScriptFromHat(program, 'event_tick')
  const { program: p2, blockId: ifId } = appendStatement(p1, target, 'if')
  const { program: p3, blockId: waitId } = appendStatement(p2, target, 'party_wait')

  const bodyTarget = childTarget(target, ifId, 'body')
  const p4 = moveStatement(p3, waitId, bodyTarget, 0)

  const topList = getContainerList(p4, target)
  assert.equal(topList.length, 1, 'wait block left the top-level container')
  assert.equal(topList[0].id, ifId)
  assert.equal(getContainerList(p4, bodyTarget)[0].id, waitId)
})

test('duplicateStatement inserts a copy right after the original with fresh ids', () => {
  const program = createProgram([])
  const { program: p1, target } = createScriptFromHat(program, 'event_tick')
  const { program: p2, blockId: waitId } = appendStatement(p1, target, 'party_wait')

  const { program: p3, blockId: copyId } = duplicateStatement(p2, waitId)
  assert.notEqual(copyId, waitId)

  const list = getContainerList(p3, target)
  assert.equal(list.length, 2)
  assert.equal(list[0].id, waitId)
  assert.equal(list[1].id, copyId)
  assert.equal(list[1].type, 'party_wait')
})

test('duplicateStatement deep-clones nested reporters and body blocks with fresh ids', () => {
  const program = createProgram([])
  const { program: p1, target } = createScriptFromHat(program, 'event_tick')
  const move = createBlock('move_party')
  const reporter = createBlock('party_position')
  move.inputs.cell = reporter
  const { program: p2 } = { program: insertBlock(p1, target.scriptId, target.containerPath, undefined, move) }

  const ifBlock = createBlock('if')
  ifBlock.body = [move]
  const p3 = insertBlock(p2, target.scriptId, target.containerPath, undefined, ifBlock)

  const { program: p4, blockId: copyIfId } = duplicateStatement(p3, ifBlock.id)
  const copyIf = findBlock(p4, copyIfId)
  assert.notEqual(copyIf.id, ifBlock.id)
  assert.equal(copyIf.body.length, 1)
  assert.notEqual(copyIf.body[0].id, move.id)
  assert.notEqual(copyIf.body[0].inputs.cell.id, reporter.id)
  assert.equal(copyIf.body[0].inputs.cell.type, 'party_position')

  // original subtree is untouched and still findable by its own ids
  assert.ok(findBlock(p4, ifBlock.id))
  assert.ok(findBlock(p4, move.id))
})

test('duplicateStatement on an unknown id is a no-op', () => {
  const program = createProgram([createScript('event_tick')])
  const { program: next, blockId } = duplicateStatement(program, 'does-not-exist')
  assert.equal(blockId, null)
  assert.equal(next, program)
})

test('regenerateIds never touches literal values', () => {
  const move = createBlock('move_party')
  move.inputs.cell = { literal: true, value: { x: 3, y: 4 } }
  const copy = regenerateIds(move)
  assert.deepEqual(copy.inputs.cell.value, { x: 3, y: 4 })
  assert.notEqual(copy.id, move.id)
})

test('setLiteral wraps a raw value as a literal input', () => {
  const program = createProgram([])
  const { program: p1, target } = createScriptFromHat(program, 'event_tick')
  const { program: p2, blockId } = appendStatement(p1, target, 'repeat')
  const p3 = setLiteral(p2, blockId, 'n', 5)
  const found = findBlock(p3, blockId)
  assert.equal(found.inputs.n.literal, true)
  assert.equal(found.inputs.n.value, 5)
})

test('setReporter replaces a slot with a new reporter block, and popReporter restores the literal', () => {
  const program = createProgram([])
  const { program: p1, target } = createScriptFromHat(program, 'event_tick')
  const { program: p2, blockId: moveId } = appendStatement(p1, target, 'move_party')

  const { program: p3, blockId: reporterId } = setReporter(p2, moveId, 'cell', 'party_position')
  const withReporter = findBlock(p3, moveId)
  assert.equal(withReporter.inputs.cell.type, 'party_position')
  assert.equal(withReporter.inputs.cell.id, reporterId)

  const p4 = popReporter(p3, moveId, 'cell', BLOCK_CATALOG.move_party.slots.find((s) => s.name === 'cell').default)
  const restored = findBlock(p4, moveId)
  assert.equal(restored.inputs.cell.literal, true)
  assert.deepEqual(restored.inputs.cell.value, { x: 1, y: 1 })
})

test('isReturnCompatible treats "any" as a wildcard in both directions', () => {
  assert.equal(isReturnCompatible('cell', 'cell'), true)
  assert.equal(isReturnCompatible('cell', 'boolean'), false)
  assert.equal(isReturnCompatible('any', 'cell'), true)
  assert.equal(isReturnCompatible('cell', 'any'), true)
})

test('reporterOptionsForSlot filters the catalog by compatible return type and skips dropdown slots', () => {
  const cellSlotDef = BLOCK_CATALOG.move_party.slots.find((s) => s.name === 'cell')
  const options = reporterOptionsForSlot(CATALOG_LIST, cellSlotDef)
  assert.ok(options.some((o) => o.type === 'party_position'))
  assert.ok(options.some((o) => o.type === 'neighbor_of'))
  assert.ok(!options.some((o) => o.type === 'at_goal'), 'boolean reporter should not fill a cell slot')

  const directionSlotDef = BLOCK_CATALOG.set_wall.slots.find((s) => s.name === 'direction')
  assert.deepEqual(reporterOptionsForSlot(CATALOG_LIST, directionSlotDef), [])
})

test('computeInsertIndex picks the index nearest the pointer by midpoint', () => {
  const rects = [
    { top: 0, bottom: 20 },
    { top: 20, bottom: 40 },
    { top: 40, bottom: 60 },
  ]
  assert.equal(computeInsertIndex(rects, -5), 0)
  assert.equal(computeInsertIndex(rects, 5), 0)
  assert.equal(computeInsertIndex(rects, 15), 1)
  assert.equal(computeInsertIndex(rects, 35), 2)
  assert.equal(computeInsertIndex(rects, 55), 3)
  assert.equal(computeInsertIndex(rects, 1000), 3)
  assert.equal(computeInsertIndex([], 10), 0)
})

test('bestDropContainer picks the smallest-area candidate containing the pointer (nested wins)', () => {
  const candidates = [
    { key: 'outer', top: 0, bottom: 200, left: 0, right: 200 },
    { key: 'inner', top: 50, bottom: 100, left: 20, right: 180 },
  ]
  assert.equal(bestDropContainer(candidates, 100, 75), 'inner')
  assert.equal(bestDropContainer(candidates, 100, 150), 'outer')
  assert.equal(bestDropContainer(candidates, 1000, 1000), null)
})

test('sameTarget compares script + container path structurally', () => {
  const a = scriptTarget('s1')
  const b = scriptTarget('s1')
  const c = childTarget(a, 'blk1', 'body')
  const d = childTarget(b, 'blk1', 'body')
  assert.equal(sameTarget(a, b), true)
  assert.equal(sameTarget(c, d), true)
  assert.equal(sameTarget(a, c), false)
  assert.equal(sameTarget(a, null), false)
})

test('insertStatementAt inserts a new block at a specific index (drag-from-palette)', () => {
  const program = createProgram([])
  const { program: p1, target } = createScriptFromHat(program, 'event_tick')
  const { program: p2, blockId: id1 } = appendStatement(p1, target, 'party_wait')
  const { program: p3, blockId: id2 } = appendStatement(p2, target, 'stop_script')

  const { program: p4, blockId: insertedId } = insertStatementAt(p3, target, 1, 'say')
  const list = getContainerList(p4, target)
  assert.deepEqual(
    list.map((b) => b.id),
    [id1, insertedId, id2],
  )
})

test('labelTokens splits a template into text and slot placeholders in order', () => {
  assert.deepEqual(labelTokens('move {party} to {cell}'), [
    { kind: 'text', value: 'move ' },
    { kind: 'slot', name: 'party' },
    { kind: 'text', value: ' to ' },
    { kind: 'slot', name: 'cell' },
  ])
  assert.deepEqual(labelTokens('stop this script'), [{ kind: 'text', value: 'stop this script' }])
  assert.deepEqual(labelTokens('{name}'), [{ kind: 'slot', name: 'name' }])
})

test('locate finds a nested block\'s script, container path and index', () => {
  const program = createProgram([])
  const { program: p1, target } = createScriptFromHat(program, 'event_tick')
  const { program: p2, blockId: ifId } = appendStatement(p1, target, 'if')
  const bodyTarget = childTarget(target, ifId, 'body')
  const { program: p3, blockId: waitId } = appendStatement(p2, bodyTarget, 'party_wait')

  const loc = locate(p3, waitId)
  assert.equal(loc.scriptId, target.scriptId)
  assert.deepEqual(loc.containerPath, [{ blockId: ifId, slot: 'body' }])
  assert.equal(loc.index, 0)

  assert.equal(locate(p3, 'nope'), null)
})

test('collectVarNames: gathers names from list blocks too (regression: "trail" was invisible)', () => {
  const listName = (type, name) => {
    const blk = createBlock(type)
    blk.inputs.name = { literal: true, value: name }
    return blk
  }
  const setScore = createBlock('set_var')
  setScore.inputs.name = { literal: true, value: 'score' }
  const program = createProgram([
    createScript('event_tick', [
      listName('list_add', 'trail'),
      listName('list_length', 'trail'), // same list, still one name
      setScore,
    ]),
  ])
  const names = collectVarNames(program)
  assert.deepEqual(names, ['score', 'trail'])
})

test('collectVarNames: a name disappears once its last mention is gone', () => {
  const withTrail = createProgram([
    createScript('event_tick', [
      (() => { const b = createBlock('list_add'); b.inputs.name = { literal: true, value: 'trail' }; return b })(),
    ]),
  ])
  assert.deepEqual(collectVarNames(withTrail), ['trail'])
  const empty = createProgram([createScript('event_tick', [])])
  assert.deepEqual(collectVarNames(empty), [])
})
