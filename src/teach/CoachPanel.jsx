// The Coach sidebar tab (BLOCKS_SPEC.md §7.3): current lesson (story,
// instructions, live success checklist, completion state, lesson picker),
// a live hints feed, a per-lesson "give me a nudge" hint button, and an
// "Explain my program" button that renders narrator.js output.
//
// Purely props-driven — no engine coupling. The host (App.jsx, owned by
// C5) is responsible for running the interpreter, keeping tick history, and
// feeding this component `checks` (from lessonRunner.evaluateChecks) and
// `hints` (from hints.computeHints / createHintTracker).

import { useMemo, useState } from 'react'
import { narrate } from '../blocks/narrator.js'
import './teach.css'

const SEVERITY_LABEL = {
  info: 'Tip',
  warn: 'Heads up',
  alert: 'Watch out',
}

function HintCard({ hint }) {
  return (
    <li className={`qt-hint qt-hint-${hint.severity}`}>
      <span className="qt-hint-badge">{SEVERITY_LABEL[hint.severity] ?? 'Tip'}</span>
      <span className="qt-hint-message">{hint.message}</span>
    </li>
  )
}

/**
 * Props:
 * - lesson: the active Lesson object (from lessons.js)
 * - lessons: the full lesson list, for the picker
 * - onSelectLesson(lessonId)
 * - checks: [{ check, label, passed }] from lessonRunner.evaluateChecks
 * - hints: Hint[] from hints.computeHints
 * - program: current AST, for "Explain my program"
 * - onLoadStarter(): loads the lesson's starterProgram into the editor
 * - onShowSolution(): loads the lesson's finished solution into the editor
 *   (null/absent when this lesson has no stored solution — button is hidden)
 * - onRevealHint(index): called when "Give me a nudge" is pressed; the host
 *   decides how many nudges have been revealed so far
 * - revealedHintCount: how many of lesson.hints are currently shown
 * - isComplete: whether every check has passed
 * - onNextLesson(): advances to the next lesson (shown once complete)
 */
export default function CoachPanel({
  lesson,
  lessons = [],
  onSelectLesson,
  checks = [],
  hints = [],
  program,
  onLoadStarter,
  onShowSolution,
  onRevealHint,
  revealedHintCount = 0,
  isComplete = false,
  onNextLesson,
}) {
  const [showExplain, setShowExplain] = useState(false)

  const explanation = useMemo(() => {
    if (!showExplain) return ''
    try {
      return narrate(program) || '(This program has no scripts yet.)'
    } catch {
      return "I couldn't read this program — try checking for a block that isn't filled in yet."
    }
  }, [showExplain, program])

  if (!lesson) {
    return (
      <div className="qt-coach">
        <p className="qt-empty">Pick a lesson to get started.</p>
      </div>
    )
  }

  const nextHintToReveal = lesson.hints[revealedHintCount]

  return (
    <div className="qt-coach">
      <div className="qt-lesson-picker">
        <label htmlFor="qt-lesson-select">Lesson</label>
        <select
          id="qt-lesson-select"
          value={lesson.id}
          onChange={(event) => onSelectLesson?.(event.target.value)}
        >
          {lessons.map((l, index) => (
            <option key={l.id} value={l.id}>
              {index + 1}. {l.title}
            </option>
          ))}
        </select>
      </div>

      <section className="qt-story">
        <h2>{lesson.title}</h2>
        <p>{lesson.story}</p>
      </section>

      <section className="qt-instructions">
        <h3>What to do</h3>
        <ol>
          {lesson.instructions.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        <div className="qt-lesson-actions">
          {onLoadStarter ? (
            <button type="button" className="qt-secondary-button" onClick={onLoadStarter}>
              Load this lesson's starter program
            </button>
          ) : null}
          {onShowSolution ? (
            <button type="button" className="qt-secondary-button" onClick={onShowSolution}>
              Show me the finished code
            </button>
          ) : null}
        </div>
        {onShowSolution ? (
          <p className="qt-solution-note">
            This swaps your blocks for the finished answer so you can see how it fits together. Press{' '}
            <strong>Undo</strong> (↶ in the editor, or Cmd/Ctrl+Z) to bring your own version back.
          </p>
        ) : null}
      </section>

      <section className="qt-checklist">
        <h3>Success checklist</h3>
        <ul>
          {checks.map((result, index) => (
            <li key={index} className={result.passed ? 'qt-check-pass' : 'qt-check-pending'}>
              <span className="qt-check-mark" aria-hidden="true">
                {result.passed ? '✓' : '○'}
              </span>
              <span>{result.label}</span>
            </li>
          ))}
        </ul>

        {isComplete ? (
          <div className="qt-complete-banner">
            <p>🎉 Lesson complete! Great work.</p>
            {onNextLesson ? (
              <button type="button" className="qt-primary-button" onClick={onNextLesson}>
                Next lesson →
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="qt-hints-feed">
        <h3>Live hints</h3>
        {hints.length === 0 ? (
          <p className="qt-empty">No hints right now — your program looks okay so far.</p>
        ) : (
          <ul>
            {hints.map((hint) => (
              <HintCard key={hint.id} hint={hint} />
            ))}
          </ul>
        )}
      </section>

      <section className="qt-nudge">
        <button
          type="button"
          className="qt-secondary-button"
          disabled={!nextHintToReveal}
          onClick={() => onRevealHint?.(revealedHintCount)}
        >
          {nextHintToReveal ? 'Give me a nudge' : 'No more nudges for this lesson'}
        </button>
        {revealedHintCount > 0 ? (
          <ul className="qt-revealed-hints">
            {lesson.hints.slice(0, revealedHintCount).map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="qt-explain">
        <button
          type="button"
          className="qt-secondary-button"
          onClick={() => setShowExplain((v) => !v)}
        >
          {showExplain ? 'Hide explanation' : 'Explain my program'}
        </button>
        {showExplain ? <pre className="qt-explain-output">{explanation}</pre> : null}
      </section>
    </div>
  )
}
