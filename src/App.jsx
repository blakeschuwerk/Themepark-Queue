// App shell (BLOCKS_SPEC.md §8): three-region layout wiring C1-C4 together.
//   - top-left ~55%: 3D viewport + a slim run/pause/step/reset/speed/strict toolbar
//   - right column ~45%: the block workspace (editor)
//   - bottom-left under the viewport: tabbed Coach / Reference / World panel
//
// The engine hook (useSandboxEngine) needs a `program` to run each tick; that
// program is owned here so it can be shared with the editor (which reads it
// and reports edits back via onProgramChange) and the coach/hint pipeline
// (which reads it plus the rolling tick history).

import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { cloneProgram } from './blocks/ast.js'
import { EXAMPLE_PROGRAMS } from './blocks/examplePrograms.js'
import { SandboxViewport } from './components/SandboxViewport.jsx'
import WorldPanel from './components/WorldPanel.jsx'
import Workspace from './editor/Workspace.jsx'
import { useSandboxEngine } from './hooks/useSandboxEngine.js'
import { useProgramHistory } from './hooks/useProgramHistory.js'
import CoachPanel from './teach/CoachPanel.jsx'
import { computeHints } from './teach/hints.js'
import { LESSONS, getLessonById } from './teach/lessons.js'
import { evaluateChecks, isLessonComplete } from './teach/lessonRunner.js'
import ReferencePanel from './teach/ReferencePanel.jsx'

const PROGRAM_AUTOSAVE_KEY = 'qb.editor.autosave.v1'
const LAST_LESSON_KEY = 'qb.app.lastLesson.v1'

function loadInitialProgram(fallback) {
  if (typeof window === 'undefined' || !window.localStorage) return fallback
  try {
    const raw = window.localStorage.getItem(PROGRAM_AUTOSAVE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.scripts) && parsed.scripts.length > 0) return parsed
  } catch {
    // corrupt/unavailable autosave — fall through to the default
  }
  return fallback
}

function loadInitialLessonId() {
  if (typeof window === 'undefined' || !window.localStorage) return LESSONS[0].id
  try {
    const saved = window.localStorage.getItem(LAST_LESSON_KEY)
    if (saved && getLessonById(saved)) return saved
  } catch {
    // ignore
  }
  return LESSONS[0].id
}

const TABS = ['coach', 'reference', 'world']

function App() {
  const [lessonId, setLessonId] = useState(loadInitialLessonId)
  const lesson = getLessonById(lessonId) ?? LESSONS[0]

  const { program, setProgram, undo, redo, canUndo, canRedo } = useProgramHistory(() =>
    loadInitialProgram(lesson.starterProgram),
  )
  const [tab, setTab] = useState('coach')
  const [revealedHintCount, setRevealedHintCount] = useState(0)

  const sandbox = useSandboxEngine(program)

  // Load the active lesson's world once on mount, and again whenever the
  // user explicitly picks a different lesson. Does NOT touch `program` —
  // that's a separate concern the editor/autosave own.
  useEffect(() => {
    sandbox.loadWorldPreset(lesson.world)
    setRevealedHintCount(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      window.localStorage.setItem(LAST_LESSON_KEY, lessonId)
    } catch {
      // ignore
    }
  }, [lessonId])

  const handleSelectLesson = useCallback((id) => {
    setLessonId(id)
  }, [])

  const handleLoadStarter = useCallback(() => {
    setProgram(cloneProgram(lesson.starterProgram), { discrete: true })
  }, [lesson, setProgram])

  const handleShowSolution = useCallback(() => {
    if (!lesson.solutionProgram) return
    setProgram(cloneProgram(lesson.solutionProgram), { discrete: true })
  }, [lesson, setProgram])

  // Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z (or Ctrl+Y) = redo. Ignored while the
  // user is typing in a text field so it never fights native text undo.
  useEffect(() => {
    function onKey(event) {
      if (!(event.metaKey || event.ctrlKey)) return
      const target = event.target
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const handleRevealHint = useCallback(() => {
    setRevealedHintCount((count) => count + 1)
  }, [])

  const handleNextLesson = useCallback(() => {
    const index = LESSONS.findIndex((l) => l.id === lessonId)
    const next = LESSONS[(index + 1) % LESSONS.length]
    setLessonId(next.id)
  }, [lessonId])

  // -- coach/hints pipeline: re-derived every render from the engine's live
  // world + rolling tick history, per BLOCKS_SPEC.md §7.1/§7.2. ------------
  const checks = useMemo(
    () => evaluateChecks(lesson, { grid: sandbox.grid, parties: sandbox.parties, rooms: sandbox.rooms, tick: sandbox.tick }, sandbox.lastTickResults, program),
    [lesson, sandbox.grid, sandbox.parties, sandbox.rooms, sandbox.tick, sandbox.lastTickResults, program],
  )
  const isComplete = useMemo(
    () => isLessonComplete(lesson, { grid: sandbox.grid, parties: sandbox.parties, rooms: sandbox.rooms, tick: sandbox.tick }, sandbox.lastTickResults, program),
    [lesson, sandbox.grid, sandbox.parties, sandbox.rooms, sandbox.tick, sandbox.lastTickResults, program],
  )
  const hints = useMemo(
    () => computeHints(program, sandbox.lastTickResults, { world: { grid: sandbox.grid, parties: sandbox.parties, rooms: sandbox.rooms, tick: sandbox.tick } }),
    [program, sandbox.lastTickResults, sandbox.grid, sandbox.parties, sandbox.rooms, sandbox.tick],
  )

  const extraPrograms = useMemo(
    () => [...EXAMPLE_PROGRAMS, { description: lesson.story, id: `lesson-${lesson.id}`, name: `Starter: ${lesson.title}`, program: lesson.starterProgram }],
    [lesson],
  )

  return (
    <main className="app-shell">
      <div className="viewport-region">
        <div className="toolbar">
          <button className="button" onClick={sandbox.simulation.running ? sandbox.pause : sandbox.run} type="button">
            {sandbox.simulation.running ? 'Pause' : 'Run'}
          </button>
          <button className="button ghost" onClick={sandbox.stepOnce} type="button">
            Step
          </button>
          <button className="button ghost" onClick={sandbox.reset} type="button">
            Reset
          </button>
          <label className="toolbar-toggle">
            <input
              checked={sandbox.simulation.strict}
              onChange={(event) => sandbox.setStrict(event.target.checked)}
              type="checkbox"
            />
            Strict mode
          </label>
          <label className="toolbar-slider">
            <span>Speed</span>
            <input
              max={6000}
              min={250}
              onChange={(event) => sandbox.setTickMs(Number(event.target.value))}
              step={50}
              type="range"
              value={sandbox.simulation.tickMs}
            />
            <span>{sandbox.simulation.tickMs}ms</span>
          </label>
          <span className="toolbar-tick">Tick {sandbox.tick}</span>
        </div>

        <div className="viewport-stage">
          <SandboxViewport sandbox={sandbox} />
        </div>

        <div className="bottom-panel">
          <div className="tab-bar">
            {TABS.map((t) => (
              <button
                className={t === tab ? 'tab active' : 'tab'}
                key={t}
                onClick={() => setTab(t)}
                type="button"
              >
                {t === 'coach' ? 'Coach' : t === 'reference' ? 'Reference' : 'World'}
              </button>
            ))}
          </div>
          <div className="tab-body">
            {tab === 'coach' ? (
              <CoachPanel
                checks={checks}
                hints={hints}
                isComplete={isComplete}
                lesson={lesson}
                lessons={LESSONS}
                onLoadStarter={handleLoadStarter}
                onShowSolution={lesson.solutionProgram ? handleShowSolution : null}
                onNextLesson={handleNextLesson}
                onRevealHint={handleRevealHint}
                onSelectLesson={handleSelectLesson}
                program={program}
                revealedHintCount={revealedHintCount}
              />
            ) : null}
            {tab === 'reference' ? <ReferencePanel /> : null}
            {tab === 'world' ? <WorldPanel sandbox={sandbox} /> : null}
          </div>
        </div>
      </div>

      <div className="workspace-region">
        <Workspace
          canRedo={canRedo}
          canUndo={canUndo}
          extraPrograms={extraPrograms}
          onProgramChange={setProgram}
          onRedo={redo}
          onUndo={undo}
          parties={sandbox.parties}
          program={program}
          trace={sandbox.trace}
        />
      </div>
    </main>
  )
}

export default App
