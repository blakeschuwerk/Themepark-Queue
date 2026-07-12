// Drives the simulation: owns world state (grid/rooms/parties/tick) and
// simulation state (running/tickMs/strict/stepping), calls runTick() on an
// interval, and applies the TickResult. Per BLOCKS_SPEC.md §6 — this hook
// does NOT own program editing; the current block program comes in as an
// argument from the caller (the block editor, eventually C5's App.jsx).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { makeId } from '../blocks/ast.js'
import { runTick } from '../blocks/interpreter.js'
import { WALL_RULES, ensureRooms, normalizeCell, roomKey, roomsArray } from '../engine/pathfinding.js'
import {
  DEFAULT_GRID,
  DEFAULT_SIMULATION,
  clampGrid,
  clampPartyToGrid,
  makeInitialParties,
  makeParty,
} from './engineHelpers.js'

const TICK_RESULT_HISTORY = 20

function freshRuntime(strict) {
  return { strict: Boolean(strict), variables: {} }
}

function emptyTickOutputs() {
  return { error: null, moves: [], problems: [], sayings: [], trace: [], violations: [] }
}

/**
 * @param {object} program - the current block program (version-1 AST, see
 *   src/blocks/ast.js). Owned by the caller, not this hook.
 */
export function useSandboxEngine(program) {
  const [grid, setGridState] = useState(DEFAULT_GRID)
  const [rooms, setRooms] = useState(() => ensureRooms(DEFAULT_GRID.width, DEFAULT_GRID.height))
  const [parties, setParties] = useState(() => makeInitialParties(() => makeId('party'), DEFAULT_GRID))
  const [tick, setTick] = useState(0)
  const [simulation, setSimulation] = useState(DEFAULT_SIMULATION)
  const [selectedRoomKey, setSelectedRoomKey] = useState('1,1')
  const [selectedPartyId, setSelectedPartyId] = useState(null)
  const [outputs, setOutputs] = useState(emptyTickOutputs)
  const [lastTickResults, setLastTickResults] = useState([])

  const runtimeRef = useRef(freshRuntime(DEFAULT_SIMULATION.strict))
  const partyCounterRef = useRef(parties.length)

  // The starting wall/room layout of the currently-loaded world (lesson).
  // Reset restores rooms to this so a Run that sealed/opened walls — or a
  // previous lesson's leftover walls — never bleed into the fresh simulation.
  // Updated whenever a new world is loaded (loadWorldPreset).
  const baselineRef = useRef({
    rooms: ensureRooms(DEFAULT_GRID.width, DEFAULT_GRID.height),
  })

  // -- "latest value" refs so the tick interval never closes over stale
  // state. Updated every render via effects (cheap: just an assignment). ---
  const gridRef = useRef(grid)
  const roomsRef = useRef(rooms)
  const partiesRef = useRef(parties)
  const tickRef = useRef(tick)
  const programRef = useRef(program)
  const strictRef = useRef(simulation.strict)

  useEffect(() => { gridRef.current = grid }, [grid])
  useEffect(() => { roomsRef.current = rooms }, [rooms])
  useEffect(() => { partiesRef.current = parties }, [parties])
  useEffect(() => { tickRef.current = tick }, [tick])
  useEffect(() => { programRef.current = program }, [program])
  useEffect(() => { strictRef.current = simulation.strict }, [simulation.strict])

  // -- grid resize reconciliation (mirrors the old engine's approach): when
  // the grid's dimensions change, ensureRooms fills in any newly-exposed
  // cells and re-clamps every party's cells onto the new bounds. -----------
  useEffect(() => {
    setRooms((currentRooms) => ensureRooms(grid.width, grid.height, currentRooms))
    setParties((currentParties) => currentParties.map((party) => clampPartyToGrid(party, grid)))
    setSelectedRoomKey((currentKey) => {
      const [x, y] = currentKey.split(',').map(Number)
      return roomKey(normalizeCell({ x, y }, grid.width, grid.height))
    })
    // Only width/height actually change which cells exist; roomSize/gap/etc.
    // don't need a reconciliation pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid.width, grid.height])

  const roomList = useMemo(() => roomsArray(grid.width, grid.height, rooms), [grid.height, grid.width, rooms])
  const selectedRoom = rooms[selectedRoomKey] ?? null
  const selectedParty = useMemo(
    () => parties.find((party) => party.id === selectedPartyId) ?? null,
    [parties, selectedPartyId],
  )

  // -- the single tick step: reads the latest world+program+runtime from
  // refs, calls the pure interpreter, applies the result. Stable identity
  // (no deps) so the interval effect never needs to restart. ---------------
  const runOneTick = useCallback(() => {
    const world = {
      grid: gridRef.current,
      parties: partiesRef.current,
      rooms: roomsRef.current,
      tick: tickRef.current,
    }
    runtimeRef.current.strict = strictRef.current

    let result
    try {
      result = runTick(programRef.current, world, runtimeRef.current)
    } catch (err) {
      result = {
        error: { kind: 'exception', message: err?.message ?? String(err) },
        moves: [],
        problems: [],
        sayings: [],
        trace: [],
        violations: [],
        world,
      }
    }

    setRooms(result.world.rooms)
    setParties(result.world.parties)
    setTick(result.world.tick)
    setOutputs({
      error: result.error,
      moves: result.moves,
      problems: result.problems,
      sayings: result.sayings,
      trace: result.trace,
      violations: result.violations,
    })
    setLastTickResults((current) => {
      const entry = {
        error: result.error,
        moves: result.moves,
        problems: result.problems,
        sayings: result.sayings,
        tick: result.world.tick,
        violations: result.violations,
        world: result.world,
      }
      const next = [...current, entry]
      return next.length > TICK_RESULT_HISTORY ? next.slice(next.length - TICK_RESULT_HISTORY) : next
    })

    return result
  }, [])

  // -- run/pause interval --------------------------------------------------
  useEffect(() => {
    if (!simulation.running) return undefined
    const id = window.setInterval(runOneTick, simulation.tickMs)
    return () => window.clearInterval(id)
  }, [simulation.running, simulation.tickMs, runOneTick])

  const run = useCallback(() => setSimulation((current) => ({ ...current, running: true })), [])
  const pause = useCallback(() => setSimulation((current) => ({ ...current, running: false })), [])

  const stepOnce = useCallback(() => {
    setSimulation((current) => ({ ...current, running: false }))
    runOneTick()
  }, [runOneTick])

  const reset = useCallback(() => {
    setSimulation((current) => ({ ...current, running: false }))
    // Restore the loaded world's starting walls — reset restarts the whole
    // simulation, so any "when simulation starts" wall-building re-runs from a
    // clean slate rather than stacking on top of the previous run's walls.
    setRooms(baselineRef.current.rooms)
    setParties((current) =>
      current.map((party) => ({
        ...party,
        position: normalizeCell(party.start, gridRef.current.width, gridRef.current.height),
      })),
    )
    setTick(0)
    setOutputs(emptyTickOutputs())
    setLastTickResults([])
    runtimeRef.current = freshRuntime(strictRef.current)
  }, [])

  const setTickMs = useCallback((ms) => {
    setSimulation((current) => ({ ...current, tickMs: Math.min(Math.max(Number(ms) || 0, 250), 6000) }))
  }, [])

  const setStrict = useCallback((strict) => {
    setSimulation((current) => ({ ...current, strict: Boolean(strict) }))
  }, [])

  // -- grid ------------------------------------------------------------
  const setGrid = useCallback((patch) => {
    setGridState((current) => clampGrid(current, patch))
  }, [])

  // -- rooms ------------------------------------------------------------
  const updateRoom = useCallback((key, patch) => {
    setRooms((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }))
  }, [])

  const updateRoomWall = useCallback((key, direction, rule) => {
    setRooms((current) => ({
      ...current,
      [key]: {
        ...current[key],
        wallRules: { ...current[key]?.wallRules, [direction]: rule },
      },
    }))
  }, [])

  // -- parties (CRUD) ----------------------------------------------------
  const addParty = useCallback(() => {
    setParties((current) => {
      const occupied = new Set(current.map((party) => roomKey(party.position)))
      const index = partyCounterRef.current
      partyCounterRef.current += 1
      const party = makeParty(makeId('party'), index, gridRef.current, occupied)
      return [...current, party]
    })
  }, [])

  const removeParty = useCallback((partyId) => {
    setParties((current) => current.filter((party) => party.id !== partyId))
    setSelectedPartyId((current) => (current === partyId ? null : current))
  }, [])

  const renameParty = useCallback((partyId, name) => {
    setParties((current) => current.map((party) => (party.id === partyId ? { ...party, name } : party)))
  }, [])

  const setPartyColor = useCallback((partyId, color) => {
    setParties((current) => current.map((party) => (party.id === partyId ? { ...party, color } : party)))
  }, [])

  const setPartyStart = useCallback((partyId, cell) => {
    setParties((current) =>
      current.map((party) =>
        party.id === partyId
          ? { ...party, start: normalizeCell(cell, gridRef.current.width, gridRef.current.height) }
          : party,
      ),
    )
  }, [])

  const setPartyGoal = useCallback((partyId, cell) => {
    setParties((current) =>
      current.map((party) =>
        party.id === partyId
          ? {
              ...party,
              goal: cell ? normalizeCell(cell, gridRef.current.width, gridRef.current.height) : null,
            }
          : party,
      ),
    )
  }, [])

  const placePartyAtStart = useCallback((partyId) => {
    setParties((current) =>
      current.map((party) =>
        party.id === partyId
          ? { ...party, position: normalizeCell(party.start, gridRef.current.width, gridRef.current.height) }
          : party,
      ),
    )
  }, [])

  /** Wholesale-replaces the party roster (e.g. a dev-harness "2 opposing
   * parties" collision preset) and resets tick/runtime, without touching
   * grid/rooms. Each spec item may omit `id`/`color`/`name` and they'll be
   * filled in. */
  const loadPartyPreset = useCallback((specs) => {
    setParties(
      specs.map((spec, index) => {
        const start = normalizeCell(spec.start ?? spec.position, gridRef.current.width, gridRef.current.height)
        return {
          color: spec.color ?? makeParty('', index, gridRef.current).color,
          goal: spec.goal ? normalizeCell(spec.goal, gridRef.current.width, gridRef.current.height) : null,
          id: spec.id ?? makeId('party'),
          name: spec.name ?? `Party ${index + 1}`,
          position: start,
          start,
        }
      }),
    )
    setTick(0)
    setOutputs(emptyTickOutputs())
    setLastTickResults([])
    runtimeRef.current = freshRuntime(strictRef.current)
  }, [])

  /** Wholesale-replaces grid + rooms + parties (e.g. loading a lesson's
   * world, per BLOCKS_SPEC.md §7.1) and resets tick/runtime/selection.
   * `world` is shaped like { grid, rooms, parties }. */
  const loadWorldPreset = useCallback((world) => {
    setGridState((current) => clampGrid(current, world.grid))
    setRooms(world.rooms)
    // Snapshot this world's starting walls so Reset can return to them.
    baselineRef.current = { rooms: world.rooms }
    setParties(world.parties.map((party) => ({ ...party })))
    setSelectedPartyId(null)
    setTick(0)
    setOutputs(emptyTickOutputs())
    setLastTickResults([])
    runtimeRef.current = freshRuntime(strictRef.current)
  }, [])

  // -- selection ------------------------------------------------------
  const selectParty = useCallback((partyId) => setSelectedPartyId(partyId ?? null), [])

  const setGoalForSelectedParty = useCallback(
    (cell) => {
      if (!selectedPartyId) return
      setPartyGoal(selectedPartyId, cell)
    },
    [selectedPartyId, setPartyGoal],
  )

  return {
    // world
    grid,
    parties,
    rooms,
    roomList,
    selectedRoom,
    selectedRoomKey,
    selectedParty,
    selectedPartyId,
    tick,

    // this tick's outputs (spec §4.4 TickResult, minus `world`)
    error: outputs.error,
    moves: outputs.moves,
    problems: outputs.problems,
    sayings: outputs.sayings,
    trace: outputs.trace,
    violations: outputs.violations,
    lastTickResults,

    // simulation
    simulation,
    run,
    pause,
    stepOnce,
    reset,
    setTickMs,
    setStrict,

    // grid
    setGrid,

    // rooms
    setSelectedRoomKey,
    updateRoom,
    updateRoomWall,

    // parties
    addParty,
    loadPartyPreset,
    loadWorldPreset,
    placePartyAtStart,
    removeParty,
    renameParty,
    setPartyColor,
    setPartyGoal,
    setPartyStart,

    // selection
    selectParty,
    setGoalForSelectedParty,

    wallRules: WALL_RULES,
  }
}
