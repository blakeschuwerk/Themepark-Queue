// The "World" tab of the bottom-left panel (BLOCKS_SPEC.md §8): grid size,
// party add/remove/name/color/goal, and a simplified room designer. Not the
// star of the app anymore — kept intentionally small, wired directly against
// useSandboxEngine's real shape (grid/parties/selectedRoom/etc).

import { useState } from 'react'
import { DIRECTIONS, WALL_RULES } from '../engine/pathfinding.js'

// A number input that tracks a local string buffer while focused, mirroring
// SlotEditor's NumberLiteralEditor. A fully-controlled numeric input snaps a
// leading zero right back the instant you backspace it (value 0 -> "" ->
// onChange -> set(0) -> re-renders "0"), so you could never get an empty box
// to type over. The buffer lets the box go empty while focused; leaving it
// empty on blur reverts to the last committed value (no data loss). Selecting
// on focus means the first keystroke overwrites a default instead of appending.
function NumberField({ label, max, min, onChange, step = 1, value }) {
  const [buffer, setBuffer] = useState(null)
  const shown = buffer ?? (value === '' || value === null || value === undefined ? '' : String(value))

  return (
    <label className="field">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onBlur={() => setBuffer(null)}
        onChange={(event) => {
          const raw = event.target.value
          setBuffer(raw)
          if (raw === '' || raw === '-') return
          const n = Number(raw)
          if (Number.isFinite(n)) onChange(n)
        }}
        onFocus={(event) => event.target.select()}
        step={step}
        type="number"
        value={shown}
      />
    </label>
  )
}

function TextField({ label, onChange, value }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input onChange={(event) => onChange(event.target.value)} type="text" value={value} />
    </label>
  )
}

function ColorField({ label, onChange, value }) {
  return (
    <label className="field color-field">
      <span>{label}</span>
      <input onChange={(event) => onChange(event.target.value)} type="color" value={value} />
    </label>
  )
}

function PartyEditor({ party, sandbox }) {
  return (
    <section className="agent-editor">
      <div className="entity-header">
        <div>
          <strong>{party.name}</strong>
          <span>{party.id}</span>
        </div>
        <button className="button ghost danger" onClick={() => sandbox.removeParty(party.id)} type="button">
          Remove
        </button>
      </div>

      <div className="field-grid two">
        <TextField label="Name" onChange={(name) => sandbox.renameParty(party.id, name)} value={party.name} />
        <ColorField label="Color" onChange={(color) => sandbox.setPartyColor(party.id, color)} value={party.color} />
      </div>

      <div className="field-grid three">
        <NumberField
          label="Start X"
          max={sandbox.grid.width}
          min={1}
          onChange={(x) => sandbox.setPartyStart(party.id, { ...party.start, x })}
          value={party.start.x}
        />
        <NumberField
          label="Start Y"
          max={sandbox.grid.height}
          min={1}
          onChange={(y) => sandbox.setPartyStart(party.id, { ...party.start, y })}
          value={party.start.y}
        />
        <button className="button align-end" onClick={() => sandbox.placePartyAtStart(party.id)} type="button">
          Place
        </button>
      </div>

      <div className="field-grid three">
        <NumberField
          label="Goal X"
          max={sandbox.grid.width}
          min={1}
          onChange={(x) => sandbox.setPartyGoal(party.id, { x, y: party.goal?.y ?? 1 })}
          value={party.goal?.x ?? ''}
        />
        <NumberField
          label="Goal Y"
          max={sandbox.grid.height}
          min={1}
          onChange={(y) => sandbox.setPartyGoal(party.id, { x: party.goal?.x ?? 1, y })}
          value={party.goal?.y ?? ''}
        />
        <button className="button ghost align-end" onClick={() => sandbox.setPartyGoal(party.id, null)} type="button">
          Clear goal
        </button>
      </div>

      <span className="position-chip">
        Current {party.position.x}, {party.position.y}
      </span>
    </section>
  )
}

function RoomDesigner({ sandbox }) {
  const room = sandbox.selectedRoom

  if (!room) {
    return (
      <section className="panel-section">
        <h2>Room Designer</h2>
        <p className="muted">Select a room in the viewport.</p>
      </section>
    )
  }

  return (
    <section className="panel-section">
      <div className="section-heading">
        <div>
          <h2>Room Designer</h2>
          <span>
            Cell {room.x}, {room.y}
          </span>
        </div>
      </div>

      <div className="field-grid two">
        <TextField
          label="Label"
          onChange={(label) => sandbox.updateRoom(sandbox.selectedRoomKey, { label })}
          value={room.label}
        />
        <ColorField
          label="Tint"
          onChange={(tint) => sandbox.updateRoom(sandbox.selectedRoomKey, { tint })}
          value={room.tint}
        />
      </div>

      <div className="wall-rule-list">
        {DIRECTIONS.map((direction) => (
          <label className="field" key={direction.id}>
            <span>{direction.id}</span>
            <select
              onChange={(event) => sandbox.updateRoomWall(sandbox.selectedRoomKey, direction.id, event.target.value)}
              value={room.wallRules[direction.id]}
            >
              <option value={WALL_RULES.auto}>Algorithmic</option>
              <option value={WALL_RULES.closed}>Always Closed</option>
              <option value={WALL_RULES.open}>Always Open</option>
            </select>
          </label>
        ))}
      </div>
    </section>
  )
}

export default function WorldPanel({ sandbox }) {
  return (
    <div className="world-panel">
      <section className="panel-section">
        <div className="section-heading">
          <h2>Grid</h2>
        </div>
        <div className="field-grid two">
          <NumberField label="Width" max={15} min={2} onChange={(width) => sandbox.setGrid({ width })} value={sandbox.grid.width} />
          <NumberField label="Height" max={15} min={2} onChange={(height) => sandbox.setGrid({ height })} value={sandbox.grid.height} />
        </div>
      </section>

      <RoomDesigner sandbox={sandbox} />

      <section className="panel-section">
        <div className="section-heading">
          <h2>Parties</h2>
          <button className="button" onClick={sandbox.addParty} type="button">
            Add
          </button>
        </div>
        <div className="agent-list">
          {sandbox.parties.map((party) => (
            <PartyEditor key={party.id} party={party} sandbox={sandbox} />
          ))}
        </div>
      </section>
    </div>
  )
}
