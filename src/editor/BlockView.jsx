// Renders one statement block: its label (with inline SlotEditors for each
// slot), a hover "…" menu (duplicate / delete / help), a drag handle, trace
// glow, and — for C-blocks — nested Containers for its body/elseBody.

import { useEffect, useRef, useState } from 'react'
import { CATEGORY_COLORS, getBlockDef } from '../blocks/catalog.js'
import { useEditorContext } from './EditorContext.js'
import { childTarget, labelTokens } from './editorState.js'
import SlotEditor from './SlotEditor.jsx'
import { Container } from './ScriptView.jsx'

const INTERACTIVE_SELECTOR = '.qb-slot, .qb-menu, button, input, select, textarea'

export default function BlockView({ block, containerTarget }) {
  const { actions, drag, openMenuBlockId, readOnly, registry, selectedBlockId, traceIndex } = useEditorContext()
  const def = getBlockDef(block.type)
  const [showHelp, setShowHelp] = useState(false)
  const elRef = useRef(null)

  useEffect(() => {
    registry.registerBlockEl(block.id, elRef.current)
    return () => registry.registerBlockEl(block.id, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id])

  if (!def) {
    return <div className="qb-block qb-block-unknown">Unknown block type "{block.type}"</div>
  }

  const traceEntries = traceIndex.get(block.id)
  const traced = Boolean(traceEntries?.length)
  const isSelected = selectedBlockId === block.id
  const isDragging = drag?.kind === 'move-statement' && drag.blockId === block.id
  const menuOpen = openMenuBlockId === block.id

  function handlePointerDown(event) {
    if (readOnly || event.button !== 0) return
    if (event.target.closest(INTERACTIVE_SELECTOR)) return
    actions.startStatementDrag(block.id, event)
  }

  function handleHeaderClick(event) {
    if (event.target.closest(INTERACTIVE_SELECTOR)) return
    actions.selectBlock(block.id)
    actions.focusContainer(containerTarget)
  }

  return (
    <div
      className={[
        'qb-block',
        `qb-cat-${def.category}`,
        isSelected && 'qb-selected',
        traced && 'qb-trace-glow',
        isDragging && 'qb-dragging',
      ]
        .filter(Boolean)
        .join(' ')}
      data-qb-tooltip={traced ? 'This block ran on the last step.' : undefined}
      ref={elRef}
      style={{ '--qb-cat-color': CATEGORY_COLORS[def.category] }}
    >
      <div className="qb-block-header" onClick={handleHeaderClick} onPointerDown={handlePointerDown} title={def.docs?.blurb ?? ''}>
        <span className="qb-block-label">
          {labelTokens(def.labelTemplate).map((token, i) =>
            token.kind === 'text' ? (
              <span key={i}>{token.value}</span>
            ) : (
              <SlotEditor block={block} key={i} slotDef={def.slots.find((s) => s.name === token.name)} />
            ),
          )}
        </span>
        {!readOnly && (
          <span className="qb-menu">
            <button
              aria-label="Block actions"
              className="qb-menu-btn"
              onClick={(e) => {
                e.stopPropagation()
                setShowHelp(false)
                actions.toggleMenu(block.id)
              }}
              type="button"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="qb-menu-popup" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => actions.duplicateBlock(block.id)} type="button">
                  Duplicate
                </button>
                <button className="qb-menu-danger" onClick={() => actions.deleteBlock(block.id)} type="button">
                  Delete
                </button>
                <button onClick={() => setShowHelp((v) => !v)} type="button">
                  Help
                </button>
                {showHelp && (
                  <div className="qb-menu-help">
                    <p>{def.docs?.blurb}</p>
                    {def.docs?.example && <code>{def.docs.example}</code>}
                  </div>
                )}
              </div>
            )}
          </span>
        )}
      </div>
      {def.hasBody && (
        <div className="qb-block-body-wrap">
          <Container target={childTarget(containerTarget, block.id, 'body')} />
        </div>
      )}
      {def.hasElseBody && (
        <>
          <div className="qb-block-else-label">otherwise:</div>
          <div className="qb-block-body-wrap qb-block-else-wrap">
            <Container target={childTarget(containerTarget, block.id, 'elseBody')} />
          </div>
        </>
      )}
    </div>
  )
}
