// Undo/redo history for the editor's program (App owns the program; the editor
// reports edits back through onProgramChange). Every committed program becomes
// an undo step, so loading a lesson's starter or its finished solution can be
// taken back with Undo. Pure React — no DOM, no localStorage.
//
// Rapid successive edits (e.g. typing digits into a slot) are coalesced into a
// single undo step when they land within COALESCE_MS of each other, so one
// Undo takes back a whole edit rather than one keystroke. Discrete actions
// (loading a starter/solution) pass { discrete: true } to force their own step.

import { useCallback, useReducer } from 'react'

const MAX_HISTORY = 100
const COALESCE_MS = 450

function reducer(state, action) {
  switch (action.type) {
    case 'commit': {
      if (action.program === state.present) return state
      const coalesce =
        action.discrete !== true && state.past.length > 0 && action.at - state.lastAt < COALESCE_MS
      const past = coalesce ? state.past : [...state.past, state.present].slice(-MAX_HISTORY)
      return { past, present: action.program, future: [], lastAt: action.at }
    }
    case 'undo': {
      if (state.past.length === 0) return state
      const present = state.past[state.past.length - 1]
      return {
        past: state.past.slice(0, -1),
        present,
        future: [state.present, ...state.future].slice(0, MAX_HISTORY),
        lastAt: 0,
      }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      const present = state.future[0]
      return {
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present,
        future: state.future.slice(1),
        lastAt: 0,
      }
    }
    default:
      return state
  }
}

/** `getInitial` is called once to seed the present program. Returns the live
 * program plus setProgram(program, { discrete }) / undo / redo and can-do flags. */
export function useProgramHistory(getInitial) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    past: [],
    present: getInitial(),
    future: [],
    lastAt: 0,
  }))

  const setProgram = useCallback((program, options = {}) => {
    dispatch({ type: 'commit', program, at: Date.now(), discrete: options.discrete === true })
  }, [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  return {
    program: state.present,
    setProgram,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
