import test from 'node:test'
import assert from 'node:assert/strict'
import { BLOCK_CATALOG, CATEGORY_COLORS, CATEGORIES } from '../src/blocks/catalog.js'

const VALID_EDITORS = new Set(['number', 'text', 'dropdown', 'party', 'varname', 'reporter-accepting'])
const VALID_VALUE_TYPES = new Set(['number', 'boolean', 'cell', 'party', 'direction', 'string', 'any'])

test('catalog integrity: every block has type, category, label, docs, slots', () => {
  const entries = Object.entries(BLOCK_CATALOG)
  assert.ok(entries.length > 20, 'expected a substantial catalog')

  for (const [type, def] of entries) {
    assert.equal(def.type, type, `def.type should match its catalog key for ${type}`)
    assert.equal(typeof def.category, 'string')
    assert.ok(def.category.length > 0, `${type} missing category`)
    assert.equal(typeof def.labelTemplate, 'string')
    assert.ok(def.labelTemplate.length > 0, `${type} missing labelTemplate`)

    assert.ok(def.docs, `${type} missing docs`)
    assert.equal(typeof def.docs.blurb, 'string')
    assert.ok(def.docs.blurb.length > 10, `${type} docs.blurb too short`)
    assert.equal(typeof def.docs.example, 'string')
    assert.ok(def.docs.example.length > 0, `${type} missing docs.example`)

    assert.ok(Array.isArray(def.slots), `${type} slots should be an array`)

    for (const slot of def.slots) {
      assert.equal(typeof slot.name, 'string')
      assert.ok(VALID_VALUE_TYPES.has(slot.valueType), `${type}.${slot.name} has bad valueType ${slot.valueType}`)
      assert.ok(VALID_EDITORS.has(slot.editor), `${type}.${slot.name} has bad editor kind ${slot.editor}`)
      if (slot.editor === 'dropdown') {
        assert.ok(Array.isArray(slot.options) && slot.options.length > 0, `${type}.${slot.name} dropdown needs options`)
      }
      // Every label placeholder used by the block must correspond to a real slot.
    }

    // Every {placeholder} in the label template must be a declared slot name.
    const placeholders = [...def.labelTemplate.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
    const slotNames = new Set(def.slots.map((s) => s.name))
    for (const placeholder of placeholders) {
      assert.ok(slotNames.has(placeholder), `${type} label references undeclared slot "${placeholder}"`)
    }
  }
})

test('category colors are defined for every category actually used', () => {
  for (const category of CATEGORIES) {
    assert.ok(CATEGORY_COLORS[category], `no color defined for category "${category}"`)
  }
})

test('hats and C-blocks declare bodies correctly', () => {
  assert.equal(BLOCK_CATALOG.event_start.isHat, true)
  assert.equal(BLOCK_CATALOG.event_start.hasBody, true)
  assert.equal(BLOCK_CATALOG.event_tick.isHat, true)
  assert.equal(BLOCK_CATALOG.event_tick.hasBody, true)

  for (const type of ['for_each_party', 'if', 'if_else', 'repeat']) {
    assert.equal(BLOCK_CATALOG[type].hasBody, true, `${type} should have a body`)
  }

  assert.equal(BLOCK_CATALOG.if_else.hasElseBody, true)
  assert.equal(BLOCK_CATALOG.if.hasElseBody, false)
  assert.equal(BLOCK_CATALOG.stop_script.hasBody, false)
  assert.equal(BLOCK_CATALOG.move_party.hasBody, false)
})

test('every v1 block from the spec catalog exists', () => {
  const expected = [
    'event_start', 'event_tick', 'event_every_n_ticks',
    'for_each_party', 'if', 'if_else', 'repeat', 'stop_script',
    'move_party', 'party_wait', 'say',
    'party_position', 'party_goal', 'at_goal', 'current_party', 'party_number',
    'party_count', 'is_occupied', 'is_reserved', 'is_area_clear', 'is_area_sealed', 'is_wall_open', 'neighbor_of',
    'next_step_toward', 'next_step_toward_or_closest', 'distance_between', 'cell_at', 'cell_x', 'cell_y',
    'tick_number', 'random_number', 'random_direction',
    'op_add', 'op_subtract', 'op_multiply', 'op_equals', 'op_greater', 'op_less',
    'op_and', 'op_or', 'op_not',
    'set_var', 'change_var', 'get_var',
    'list_add', 'list_length', 'list_item', 'list_contains', 'list_random',
    'list_remove', 'list_is_empty', 'list_clear',
    'set_wall', 'reserve_cell',
    'open_area', 'seal_area', 'close_border', 'carve_corridor', 'reset_all_walls',
  ]

  for (const type of expected) {
    assert.ok(BLOCK_CATALOG[type], `missing block type "${type}"`)
  }
  assert.equal(Object.keys(BLOCK_CATALOG).length, expected.length)
})
