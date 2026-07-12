// Top-level block editor component. Props-driven: `{ program, onProgramChange,
// trace, readOnly, parties, extraPrograms }`. Owns the palette + script area,
// selection/focus/drag UI state, the localStorage program library, and the
// pointer-based drag machinery (no external DnD library — see BLOCKS_SPEC.md
// §5). All AST mutation goes through editorState.js, which itself only calls
// src/blocks/ast.js helpers.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BLOCK_CATALOG, getBlockDef } from '../blocks/catalog.js'
import { cloneProgram, createProgram, findBlock } from '../blocks/ast.js'
import { EXAMPLE_PROGRAMS } from '../blocks/examplePrograms.js'
import { EditorContext } from './EditorContext.js'
import {
  appendStatement,
  bestDropContainer,
  collectVarNames,
  computeInsertIndex,
  createScriptFromHat,
  duplicateStatement,
  getContainerList,
  insertStatementAt,
  isReturnCompatible,
  moveStatement,
  popReporter,
  removeScript,
  removeStatement,
  sameTarget,
  setLiteral,
  setReporter,
} from './editorState.js'
import Palette from './Palette.jsx'
import ScriptView from './ScriptView.jsx'
import './editor.css'

const AUTOSAVE_KEY = 'qb.editor.autosave.v1'
const LIBRARY_KEY = 'qb.editor.library.v1'

const CATALOG_LIST = Object.values(BLOCK_CATALOG)

function targetKey(target) {
  if (!target) return ''
  return `${target.scriptId}::${target.containerPath.map((s) => `${s.blockId}:${s.slot}`).join('>')}`
}

function slotKey(blockId, slotName) {
  return `${blockId}::${slotName}`
}

function isEmptyProgram(program) {
  return !program || !Array.isArray(program.scripts) || program.scripts.length === 0
}

// -- localStorage helpers (guarded so this file is harmless outside a DOM) --

function hasStorage() {
  return typeof window !== 'undefined' && !!window.localStorage
}

function loadAutosave() {
  if (!hasStorage()) return null
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    return cloneProgram(JSON.parse(raw))
  } catch {
    return null
  }
}

function saveAutosave(program) {
  if (!hasStorage()) return
  try {
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(program))
  } catch {
    // storage full/unavailable — silently skip, autosave is best-effort
  }
}

function loadLibrary() {
  if (!hasStorage()) return {}
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLibrary(library) {
  if (!hasStorage()) return
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(library))
  } catch {
    // best-effort
  }
}

export default function Workspace({
  program,
  onProgramChange,
  trace,
  readOnly = false,
  parties = [],
  extraPrograms = [],
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) {
  const safeProgram = program ?? createProgram([])

  const [focusTarget, setFocusTarget] = useState(null)
  const [selectedBlockId, setSelectedBlockId] = useState(null)
  const [openMenuBlockId, setOpenMenuBlockId] = useState(null)
  const [drag, setDrag] = useState(null)
  const [libraryNames, setLibraryNames] = useState(() => Object.keys(loadLibrary()).sort())
  const [saveName, setSaveName] = useState('')

  const onProgramChangeRef = useRef(onProgramChange)
  onProgramChangeRef.current = onProgramChange
  const programRef = useRef(safeProgram)
  programRef.current = safeProgram

  const readyRef = useRef(false)

  // -- initial load: if the caller starts us with an empty program, restore
  // the autosave (if any). Only runs once, and never clobbers a program the
  // caller explicitly handed us. The restore call is deferred to a fresh
  // macrotask so it never lands synchronously inside React's own mount
  // commit (StrictMode's dev-only double-invoke can otherwise trip the
  // "Cannot update a component while rendering a different component"
  // warning when a child's mount effect updates its parent's state).
  useEffect(() => {
    let cancelled = false
    if (isEmptyProgram(programRef.current)) {
      const saved = loadAutosave()
      if (saved && !isEmptyProgram(saved)) {
        setTimeout(() => {
          if (!cancelled) onProgramChangeRef.current(saved)
        }, 0)
      }
    }
    readyRef.current = true
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!readyRef.current) return
    saveAutosave(safeProgram)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeProgram])

  const setProgram = useCallback(
    (next) => {
      onProgramChangeRef.current(next)
    },
    [],
  )

  // -- DOM registry for pointer-drag hit testing (refs only, never causes a
  // re-render by itself) ----------------------------------------------------
  const registryRef = useRef({ containers: new Map(), blocks: new Map(), slots: new Map(), palette: null })

  const registerContainer = useCallback((key, target, el) => {
    if (el) registryRef.current.containers.set(key, { target, el })
    else registryRef.current.containers.delete(key)
  }, [])

  const registerBlockEl = useCallback((blockId, el) => {
    if (el) registryRef.current.blocks.set(blockId, el)
    else registryRef.current.blocks.delete(blockId)
  }, [])

  const registerSlotEl = useCallback((key, info, el) => {
    if (el) registryRef.current.slots.set(key, { ...info, el })
    else registryRef.current.slots.delete(key)
  }, [])

  const registerPaletteEl = useCallback((el) => {
    registryRef.current.palette = el
  }, [])

  // -- library actions --------------------------------------------------------

  const refreshLibraryNames = useCallback(() => {
    setLibraryNames(Object.keys(loadLibrary()).sort())
  }, [])

  const saveNamed = useCallback(
    (name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const library = loadLibrary()
      library[trimmed] = JSON.stringify(programRef.current)
      saveLibrary(library)
      refreshLibraryNames()
    },
    [refreshLibraryNames],
  )

  const loadNamed = useCallback((name) => {
    const library = loadLibrary()
    const raw = library[name]
    if (!raw) return
    try {
      setProgram(cloneProgram(JSON.parse(raw)))
      setSelectedBlockId(null)
      setFocusTarget(null)
    } catch {
      // ignore corrupt entry
    }
  }, [setProgram])

  const deleteNamed = useCallback(
    (name) => {
      const library = loadLibrary()
      delete library[name]
      saveLibrary(library)
      refreshLibraryNames()
    },
    [refreshLibraryNames],
  )

  const loadExample = useCallback(
    (exampleProgram) => {
      setProgram(cloneProgram(exampleProgram))
      setSelectedBlockId(null)
      setFocusTarget(null)
    },
    [setProgram],
  )

  const clearWorkspace = useCallback(() => {
    setProgram(createProgram([]))
    setSelectedBlockId(null)
    setFocusTarget(null)
  }, [setProgram])

  const focusTargetRef = useRef(focusTarget)
  focusTargetRef.current = focusTarget

  // -- click-driven editing actions --------------------------------------------

  const actions = useMemo(
    () => ({
      focusContainer(target) {
        setFocusTarget(target)
      },
      selectBlock(blockId) {
        setSelectedBlockId((current) => (current === blockId ? null : blockId))
      },
      toggleMenu(blockId) {
        setOpenMenuBlockId((current) => (current === blockId ? null : blockId))
      },
      closeMenu() {
        setOpenMenuBlockId(null)
      },
      appendFromPalette(type) {
        const def = getBlockDef(type)
        if (!def) return
        if (def.isHat) {
          const { program: next, target } = createScriptFromHat(programRef.current, type)
          setProgram(next)
          setFocusTarget(target)
          return
        }
        const target = focusTargetRef.current
        if (!target) return
        const { program: next, blockId } = appendStatement(programRef.current, target, type)
        if (blockId) {
          setProgram(next)
          setSelectedBlockId(blockId)
        }
      },
      duplicateBlock(blockId) {
        const { program: next, blockId: copyId } = duplicateStatement(programRef.current, blockId)
        if (copyId) {
          setProgram(next)
          setSelectedBlockId(copyId)
        }
        setOpenMenuBlockId(null)
      },
      deleteBlock(blockId) {
        setProgram(removeStatement(programRef.current, blockId))
        setSelectedBlockId((current) => (current === blockId ? null : current))
        setOpenMenuBlockId(null)
      },
      deleteScript(scriptId) {
        setProgram(removeScript(programRef.current, scriptId))
        setFocusTarget((current) => (current?.scriptId === scriptId ? null : current))
      },
      setLiteralValue(blockId, slotName, value) {
        setProgram(setLiteral(programRef.current, blockId, slotName, value))
      },
      pickReporter(blockId, slotName, reporterType) {
        const { program: next } = setReporter(programRef.current, blockId, slotName, reporterType)
        setProgram(next)
      },
      popReporterOut(blockId, slotName, defaultValue) {
        setProgram(popReporter(programRef.current, blockId, slotName, defaultValue))
      },
      // -- drag start handlers --
      startStatementDrag(blockId, event) {
        if (readOnly) return
        event.preventDefault()
        setOpenMenuBlockId(null)
        const found = findBlock(programRef.current, blockId)
        setDrag({
          kind: 'move-statement',
          blockId,
          blockType: found?.type ?? null,
          pointer: { x: event.clientX, y: event.clientY },
          dropContainerKey: null,
          dropIndex: null,
          overTrash: false,
        })
      },
      startPaletteStatementDrag(type, event) {
        if (readOnly) return
        event.preventDefault()
        setDrag({
          kind: 'new-statement',
          blockType: type,
          pointer: { x: event.clientX, y: event.clientY },
          dropContainerKey: null,
          dropIndex: null,
        })
      },
      startPaletteReporterDrag(type, event) {
        if (readOnly) return
        event.preventDefault()
        setDrag({
          kind: 'new-reporter',
          blockType: type,
          pointer: { x: event.clientX, y: event.clientY },
          dropSlotKey: null,
        })
      },
    }),
    [readOnly, setProgram],
  )

  // -- global pointermove/pointerup while a drag is active ---------------------
  useEffect(() => {
    if (!drag) return undefined

    function handleMove(event) {
      const { clientX, clientY } = event
      setDrag((current) => {
        if (!current) return current
        if (current.kind === 'new-reporter') {
          const draggedDef = getBlockDef(current.blockType)
          let hit = null
          for (const [key, info] of registryRef.current.slots) {
            if (!isReturnCompatible(draggedDef?.returns, info.slotDef.valueType)) continue
            const rect = info.el.getBoundingClientRect()
            if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
              hit = key
              break
            }
          }
          return { ...current, pointer: { x: clientX, y: clientY }, dropSlotKey: hit }
        }

        // statement-ish drags (move existing or insert new from palette)
        const candidates = []
        for (const [key, { target, el }] of registryRef.current.containers) {
          if (current.kind === 'move-statement' && target.containerPath.some((s) => s.blockId === current.blockId)) {
            continue // can't drop a block inside its own subtree
          }
          const rect = el.getBoundingClientRect()
          candidates.push({ key, target, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right })
        }
        const bestKey = bestDropContainer(candidates, clientX, clientY)

        let overTrash = false
        if (current.kind === 'move-statement' && registryRef.current.palette) {
          const rect = registryRef.current.palette.getBoundingClientRect()
          overTrash =
            clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
        }

        if (!bestKey) {
          return { ...current, pointer: { x: clientX, y: clientY }, dropContainerKey: null, dropIndex: null, overTrash }
        }

        const chosen = candidates.find((c) => c.key === bestKey)
        const list = getContainerList(programRef.current, chosen.target) ?? []
        const rects = list
          .filter((b) => !(current.kind === 'move-statement' && b.id === current.blockId))
          .map((b) => {
            const el = registryRef.current.blocks.get(b.id)
            const r = el ? el.getBoundingClientRect() : { top: 0, bottom: 0 }
            return { top: r.top, bottom: r.bottom }
          })
        const index = computeInsertIndex(rects, clientY)

        return { ...current, pointer: { x: clientX, y: clientY }, dropContainerKey: bestKey, dropIndex: index, overTrash }
      })
    }

    function handleUp() {
      setDrag((current) => {
        if (!current) return null
        if (current.kind === 'new-reporter') {
          const info = current.dropSlotKey ? registryRef.current.slots.get(current.dropSlotKey) : null
          if (info) {
            const { program: next } = setReporter(programRef.current, info.blockId, info.slotName, current.blockType)
            setProgram(next)
          }
          return null
        }

        if (current.kind === 'move-statement') {
          if (current.overTrash) {
            setProgram(removeStatement(programRef.current, current.blockId))
            return null
          }
          const containerInfo = current.dropContainerKey ? registryRef.current.containers.get(current.dropContainerKey) : null
          if (containerInfo) {
            const next = moveStatement(programRef.current, current.blockId, containerInfo.target, current.dropIndex ?? 0)
            setProgram(next)
          }
          return null
        }

        if (current.kind === 'new-statement') {
          const def = getBlockDef(current.blockType)
          if (def?.isHat) {
            const { program: next, target } = createScriptFromHat(programRef.current, current.blockType)
            setProgram(next)
            setFocusTarget(target)
            return null
          }
          const containerInfo = current.dropContainerKey ? registryRef.current.containers.get(current.dropContainerKey) : null
          if (containerInfo) {
            const { program: next, blockId } = insertStatementAt(
              programRef.current,
              containerInfo.target,
              current.dropIndex ?? 0,
              current.blockType,
            )
            if (blockId) setProgram(next)
          }
          return null
        }

        return null
      })
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(drag)])

  // -- trace lookup (blockId -> trace entries) --------------------------------
  const traceIndex = useMemo(() => {
    const map = new Map()
    for (const entry of trace ?? []) {
      if (!map.has(entry.blockId)) map.set(entry.blockId, [])
      map.get(entry.blockId).push(entry)
    }
    return map
  }, [trace])

  const varNames = useMemo(() => collectVarNames(safeProgram), [safeProgram])

  const contextValue = useMemo(
    () => ({
      program: safeProgram,
      readOnly,
      parties,
      varNames,
      catalogList: CATALOG_LIST,
      focusTarget,
      selectedBlockId,
      openMenuBlockId,
      drag,
      traceIndex,
      actions,
      registry: { registerContainer, registerBlockEl, registerSlotEl, registerPaletteEl },
      helpers: { targetKey, slotKey, sameTarget },
    }),
    [
      safeProgram,
      readOnly,
      parties,
      varNames,
      focusTarget,
      selectedBlockId,
      openMenuBlockId,
      drag,
      traceIndex,
      actions,
      registerContainer,
      registerBlockEl,
      registerSlotEl,
      registerPaletteEl,
    ],
  )

  return (
    <EditorContext.Provider value={contextValue}>
      <div className="qb-editor">
        <Palette />
        <div className="qb-main">
          <div className="qb-toolbar">
            <div className="qb-toolbar-group">
              <span className="qb-toolbar-label">History</span>
              <button
                className="qb-btn ghost"
                disabled={!canUndo}
                onClick={() => onUndo?.()}
                title="Undo (Cmd/Ctrl+Z)"
                type="button"
              >
                ↶ Undo
              </button>
              <button
                className="qb-btn ghost"
                disabled={!canRedo}
                onClick={() => onRedo?.()}
                title="Redo (Cmd/Ctrl+Shift+Z)"
                type="button"
              >
                ↷ Redo
              </button>
            </div>
            <div className="qb-toolbar-group">
              <span className="qb-toolbar-label">Examples</span>
              {EXAMPLE_PROGRAMS.map((ex) => (
                <button key={ex.id} className="qb-btn ghost" onClick={() => loadExample(ex.program)} title={ex.description} type="button">
                  {ex.name}
                </button>
              ))}
              {extraPrograms.map((ex) => (
                <button key={ex.id} className="qb-btn ghost" onClick={() => loadExample(ex.program)} title={ex.description} type="button">
                  {ex.name}
                </button>
              ))}
            </div>
            <div className="qb-toolbar-group">
              <span className="qb-toolbar-label">My programs</span>
              <input
                className="qb-text-input"
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="name this program…"
                type="text"
                value={saveName}
              />
              <button className="qb-btn" onClick={() => saveNamed(saveName)} type="button">
                Save
              </button>
              {libraryNames.map((name) => (
                <span className="qb-library-chip" key={name}>
                  <button className="qb-chip-load" onClick={() => loadNamed(name)} type="button">
                    {name}
                  </button>
                  <button aria-label={`Delete ${name}`} className="qb-chip-delete" onClick={() => deleteNamed(name)} type="button">
                    ×
                  </button>
                </span>
              ))}
              <button className="qb-btn danger" onClick={clearWorkspace} type="button">
                Clear
              </button>
            </div>
          </div>
          <ScriptView />
        </div>
        {drag && drag.blockType && (
          <div
            className={`qb-drag-ghost${drag.kind === 'move-statement' && drag.overTrash ? ' qb-drag-ghost-trash' : ''}`}
            style={{ left: drag.pointer.x, top: drag.pointer.y }}
          >
            {getBlockDef(drag.blockType)?.labelTemplate.replace(/\{(\w+)\}/g, '…') ?? drag.blockType}
          </div>
        )}
      </div>
    </EditorContext.Provider>
  )
}
