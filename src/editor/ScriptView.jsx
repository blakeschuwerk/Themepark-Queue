// Renders every script in the program as a vertical stack of rounded blocks.
// `Container` is the reusable "list of statements" building block: it's used
// both for a script's own top-level body and (recursively, from
// BlockView.jsx) for a C-block's body/elseBody. Exported so BlockView can
// nest it.

import { useEffect, useRef } from 'react'
import { CATEGORY_COLORS, getBlockDef } from '../blocks/catalog.js'
import { useEditorContext } from './EditorContext.js'
import { getContainerList, labelTokens, scriptTarget } from './editorState.js'
import BlockView from './BlockView.jsx'
import SlotEditor from './SlotEditor.jsx'

export function Container({ target, placeholder }) {
  const { program, drag, focusTarget, actions, registry, helpers } = useEditorContext()
  const list = getContainerList(program, target) ?? []
  const key = helpers.targetKey(target)
  const elRef = useRef(null)

  useEffect(() => {
    registry.registerContainer(key, target, elRef.current)
    return () => registry.registerContainer(key, target, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const isFocused = helpers.sameTarget(focusTarget, target)
  const isStatementDrag = drag && (drag.kind === 'move-statement' || drag.kind === 'new-statement')
  const dropIndexHere = isStatementDrag && drag.dropContainerKey === key ? drag.dropIndex : null

  return (
    <div
      className={`qb-container${isFocused ? ' qb-container-focused' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) actions.focusContainer(target)
      }}
      ref={elRef}
    >
      {list.length === 0 && (
        <button className="qb-container-empty" onClick={() => actions.focusContainer(target)} type="button">
          {placeholder ?? 'Click here, then click a block on the left to add it.'}
        </button>
      )}
      {list.map((block, index) => (
        <div className="qb-container-row" key={block.id}>
          {dropIndexHere === index && <div className="qb-drop-line" />}
          <BlockView block={block} containerTarget={target} />
        </div>
      ))}
      {dropIndexHere === list.length && <div className="qb-drop-line" />}
      {list.length > 0 && (
        <button className="qb-container-append" onClick={() => actions.focusContainer(target)} type="button">
          + add a block here
        </button>
      )}
    </div>
  )
}

function ScriptCard({ script }) {
  const { actions } = useEditorContext()
  const def = getBlockDef(script.hat.type)
  const target = scriptTarget(script.id)
  if (!def) return null

  return (
    <div className="qb-script">
      <div
        className={`qb-hat qb-cat-${def.category}`}
        onClick={() => actions.focusContainer(target)}
        role="button"
        style={{ '--qb-cat-color': CATEGORY_COLORS[def.category] }}
        tabIndex={0}
        title={def.docs?.blurb ?? ''}
      >
        <span className="qb-hat-label">
          {labelTokens(def.labelTemplate).map((token, i) =>
            token.kind === 'text' ? (
              <span key={i}>{token.value}</span>
            ) : (
              <SlotEditor block={script.hat} key={i} slotDef={def.slots.find((s) => s.name === token.name)} />
            ),
          )}
        </span>
        <button
          aria-label="Delete this script"
          className="qb-hat-delete"
          onClick={(e) => {
            e.stopPropagation()
            actions.deleteScript(script.id)
          }}
          type="button"
        >
          ×
        </button>
      </div>
      <Container target={target} />
    </div>
  )
}

export default function ScriptView() {
  const { program } = useEditorContext()

  return (
    <div className="qb-scripts">
      {(program.scripts ?? []).length === 0 && (
        <div className="qb-scripts-empty">
          Your workspace is empty. Click an event block on the left — like <strong>every tick</strong> — to start a
          script.
        </div>
      )}
      {(program.scripts ?? []).map((script) => (
        <ScriptCard key={script.id} script={script} />
      ))}
    </div>
  )
}
