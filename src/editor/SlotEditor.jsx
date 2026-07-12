// Per-slot editors driven by the catalog's slot definitions (BLOCKS_SPEC.md
// §5): number input, text input, dropdowns (direction / wall state / party),
// and reporter-accepting slots that can hold either a literal value or a
// nested reporter block (picked from a dropdown, or dropped from the
// palette). A small "×" pops a nested reporter back out to its literal
// default. This component is recursive: a reporter block's own slots are
// rendered with more SlotEditors.

import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY_COLORS, getBlockDef } from '../blocks/catalog.js'
import { useEditorContext } from './EditorContext.js'
import { labelTokens, reporterOptionsForSlot } from './editorState.js'

function isBlockInput(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.type === 'string'
}

function formatTraceValue(entry) {
  if (!entry || !('value' in entry)) return null
  const v = entry.value
  if (v === null || v === undefined) return 'nothing'
  return String(v)
}

function coerceAny(raw) {
  if (raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw)
  return raw
}

// The friendly prompt shown on the picker itself, chosen by the kind of
// value the slot wants. "ƒ(x)" was math jargon a beginner won't recognize;
// these say plainly that a block can go here.
function pickerPrompt(slotDef) {
  if (slotDef.valueType === 'cell') return 'choose a room ▾'
  if (slotDef.valueType === 'boolean') return 'choose a check ▾'
  return '＋ block ▾'
}

function ReporterPicker({ ownerBlockId, slotDef }) {
  const { actions, catalogList, readOnly } = useEditorContext()
  const options = useMemo(() => reporterOptionsForSlot(catalogList, slotDef), [catalogList, slotDef])
  // A variable *name* is a plain label, never a computed value — so no reporter
  // block can go here. (Its own dropdown handles picking an existing name.)
  if (readOnly || options.length === 0 || slotDef.editor === 'varname') return null

  const variant =
    slotDef.valueType === 'cell' ? 'qb-picker-room' : slotDef.valueType === 'boolean' ? 'qb-picker-check' : 'qb-picker-block'

  return (
    <select
      className={`qb-reporter-picker ${variant}`}
      onChange={(e) => {
        if (!e.target.value) return
        actions.pickReporter(ownerBlockId, slotDef.name, e.target.value)
        e.target.value = ''
      }}
      title="Drop a block in here instead of a typed value"
      value=""
    >
      <option value="">{pickerPrompt(slotDef)}</option>
      {options.map((def) => (
        <option key={def.type} value={def.type}>
          {def.menuLabel ?? def.labelTemplate.replace(/\{(\w+)\}/g, '…')}
        </option>
      ))}
    </select>
  )
}

/** A number slot's text, while the user is actively typing, is tracked as a
 * local string buffer instead of always mirroring the committed numeric
 * value straight from props. A fully-controlled numeric input snaps a
 * leading zero right back the instant you backspace it (value 0 -> "" ->
 * onChange fires -> set(0) -> re-renders as "0"), so you can never actually
 * get to an empty box to type over it. The buffer lets the box go empty
 * while focused; leaving it empty on blur reverts to 0 rather than staying
 * empty (an empty slot would break the interpreter). */
function NumberLiteralEditor({ disabled, onCommit, value }) {
  const [buffer, setBuffer] = useState(null)
  const shown = buffer ?? String(typeof value === 'number' ? value : 0)

  return (
    <input
      className="qb-literal-input qb-literal-number"
      disabled={disabled}
      // Select the whole value on focus so the first keystroke overwrites a
      // freshly-placed block's default (e.g. a coordinate box showing 1)
      // instead of appending to it — no need to backspace first.
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        const n = buffer === '' || buffer === '-' || buffer === null ? null : Number(buffer)
        if (n === null || !Number.isFinite(n)) onCommit(0)
        setBuffer(null)
      }}
      onChange={(e) => {
        const raw = e.target.value
        setBuffer(raw)
        if (raw === '' || raw === '-') return
        const n = Number(raw)
        if (Number.isFinite(n)) onCommit(n)
      }}
      type="number"
      value={shown}
    />
  )
}

function LiteralEditor({ ownerBlockId, slotDef, value }) {
  const { actions, parties, readOnly, varNames = [] } = useEditorContext()
  const set = (v) => actions.setLiteralValue(ownerBlockId, slotDef.name, v)

  if (slotDef.editor === 'number') {
    return <NumberLiteralEditor disabled={readOnly} onCommit={set} value={value} />
  }

  if (slotDef.editor === 'text') {
    return (
      <input
        className="qb-literal-input qb-literal-text"
        disabled={readOnly}
        onChange={(e) => set(e.target.value)}
        type="text"
        value={typeof value === 'string' ? value : ''}
      />
    )
  }

  if (slotDef.editor === 'varname') {
    // A variable name is user-invented, so it can't be a fixed dropdown — but
    // free-typing it in two places (the "set" and the matching "value of a
    // variable") is the #1 way a program silently breaks: one typo and the two
    // no longer refer to the same box. So we offer every name already used in
    // the program as a dropdown, plus a "new variable…" option, so the second
    // reference is always picked, never re-typed.
    const current = typeof value === 'string' ? value : ''
    const known = current && !varNames.includes(current) ? [current, ...varNames] : varNames

    return (
      <select
        className="qb-literal-input qb-literal-party qb-literal-varname"
        disabled={readOnly}
        onChange={(e) => {
          if (e.target.value === '__new__') {
            const name = (typeof window !== 'undefined' ? window.prompt('Name your variable:', '') : '')?.trim()
            if (name) set(name)
            return
          }
          set(e.target.value)
        }}
        value={current}
      >
        {!current ? <option value="">(choose a variable)</option> : null}
        {known.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value="__new__">＋ new variable…</option>
      </select>
    )
  }

  if (slotDef.editor === 'dropdown') {
    return (
      <select className="qb-literal-input qb-literal-dropdown" disabled={readOnly} onChange={(e) => set(e.target.value)} value={value ?? slotDef.options[0]}>
        {slotDef.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }

  if (slotDef.editor === 'party') {
    // "current party" is a reporter block, not a real party id, but it's the
    // most common choice inside a "for each party" loop — so we offer it right
    // in this dropdown. Picking it swaps the slot to a current_party block
    // (which then renders as its own chip); picking a real party sets a plain id.
    return (
      <select
        className="qb-literal-input qb-literal-party"
        disabled={readOnly}
        onChange={(e) => {
          if (e.target.value === '__current__') {
            actions.pickReporter(ownerBlockId, slotDef.name, 'current_party')
            return
          }
          set(e.target.value || null)
        }}
        value={value ?? ''}
      >
        <option value="">(choose a party)</option>
        <option value="__current__">current party (the one being handled)</option>
        {parties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    )
  }

  // reporter-accepting "cell" slots: a cell means a room on the grid, and in
  // practice you almost always fill it with a room block ("room east of …",
  // "position of …", etc.) via the picker. Showing bare x/y number boxes here
  // was the #1 source of confusion, so we don't — for an exact coordinate you
  // use the dedicated "room at x: y:" block, which has clearly labelled inputs.
  // Returning null makes SlotEditor render only the picker for this slot.
  if (slotDef.valueType === 'cell') {
    return null
  }

  if (slotDef.valueType === 'boolean') {
    return (
      <label className="qb-literal-bool">
        <input checked={Boolean(value)} disabled={readOnly} onChange={(e) => set(e.target.checked)} type="checkbox" />
        <span>{value ? 'true' : 'false'}</span>
      </label>
    )
  }

  // 'any'
  return (
    <input
      className="qb-literal-input qb-literal-any"
      disabled={readOnly}
      onChange={(e) => set(coerceAny(e.target.value))}
      type="text"
      value={value === null || value === undefined ? '' : String(value)}
    />
  )
}

function ReporterChip({ block, ownerBlockId, slotDef }) {
  const { actions, readOnly, traceIndex } = useEditorContext()
  const def = getBlockDef(block.type)
  const traceEntries = traceIndex.get(block.id)
  const traced = Boolean(traceEntries?.length)
  const tooltipValue = traced ? formatTraceValue(traceEntries[traceEntries.length - 1]) : null

  if (!def) return <span className="qb-reporter-chip qb-cat-unknown">unknown block "{block.type}"</span>

  return (
    <span
      className={`qb-reporter-chip qb-cat-${def.category}${traced ? ' qb-trace-glow' : ''}`}
      data-qb-tooltip={tooltipValue ? `${def.labelTemplate.replace(/\{(\w+)\}/g, '…')} → ${tooltipValue}` : undefined}
      style={{ '--qb-cat-color': CATEGORY_COLORS[def.category] }}
      title={def.docs?.blurb ?? ''}
    >
      {labelTokens(def.labelTemplate).map((token, i) =>
        token.kind === 'text' ? (
          <span key={i}>{token.value}</span>
        ) : (
          <SlotEditor
            block={block}
            key={i}
            slotDef={def.slots.find((s) => s.name === token.name)}
          />
        ),
      )}
      {!readOnly && (
        <button
          aria-label="Remove this block, back to a plain value"
          className="qb-pop-btn"
          onClick={() => actions.popReporterOut(ownerBlockId, slotDef.name, slotDef.default)}
          type="button"
        >
          ×
        </button>
      )}
    </span>
  )
}

export default function SlotEditor({ block, slotDef }) {
  const { drag, registry, helpers } = useEditorContext()
  const input = block.inputs?.[slotDef?.name]
  const elRef = useRef(null)
  const key = helpers.slotKey(block.id, slotDef?.name)

  useEffect(() => {
    if (!slotDef) return undefined
    registry.registerSlotEl(key, { blockId: block.id, slotName: slotDef.name, slotDef }, elRef.current)
    return () => registry.registerSlotEl(key, null, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, block.id, slotDef])

  if (!slotDef) return null

  const isDropHighlight = drag?.kind === 'new-reporter' && drag.dropSlotKey === key

  return (
    <span className={`qb-slot${isDropHighlight ? ' qb-slot-drop-highlight' : ''}`} ref={elRef}>
      {isBlockInput(input) ? (
        <ReporterChip block={input} ownerBlockId={block.id} slotDef={slotDef} />
      ) : (
        <>
          <LiteralEditor ownerBlockId={block.id} slotDef={slotDef} value={input?.value} />
          <ReporterPicker ownerBlockId={block.id} slotDef={slotDef} />
        </>
      )}
    </span>
  )
}
