// Left column of the workspace: every block type, grouped by category, in
// the spec's colors. Click-to-append (or click-to-create-a-script for hats)
// always works; pointerdown+drag is the alternative path that lets you drop
// a block at a specific spot in the script area (BLOCKS_SPEC.md §5).

import { CATEGORIES, CATEGORY_COLORS, listBlocksByCategory } from '../blocks/catalog.js'
import { useEditorContext } from './EditorContext.js'
import { labelTokens } from './editorState.js'

const CATEGORY_LABELS = {
  events: 'Events',
  control: 'Control',
  motion: 'Motion',
  sensing: 'Sensing',
  operators: 'Operators',
  variables: 'Variables',
  walls: 'Walls',
  build: 'Build',
}

function PaletteLabel({ template }) {
  return (
    <>
      {labelTokens(template).map((token, i) =>
        token.kind === 'text' ? (
          <span key={i}>{token.value}</span>
        ) : (
          <span className="qb-palette-slot" key={i}>
            {token.name}
          </span>
        ),
      )}
    </>
  )
}

function PaletteEntry({ def }) {
  const { actions, readOnly } = useEditorContext()
  const color = CATEGORY_COLORS[def.category]

  function handlePointerDown(event) {
    if (readOnly || event.button !== 0) return
    if (def.isReporter) actions.startPaletteReporterDrag(def.type, event)
    else actions.startPaletteStatementDrag(def.type, event)
  }

  function handleClick() {
    if (readOnly || def.isReporter) return
    actions.appendFromPalette(def.type)
  }

  return (
    <button
      className={`qb-palette-block qb-cat-${def.category}${def.isReporter ? ' qb-shape-reporter' : ''}${def.isHat ? ' qb-shape-hat' : ''}`}
      disabled={readOnly}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      style={{ '--qb-cat-color': color }}
      title={def.docs?.blurb ?? ''}
      type="button"
    >
      <PaletteLabel template={def.labelTemplate} />
    </button>
  )
}

export default function Palette() {
  const { drag, registry } = useEditorContext()
  const trashActive = drag?.kind === 'move-statement' && drag.overTrash

  return (
    <div className={`qb-palette${trashActive ? ' qb-palette-trash-active' : ''}`} ref={registry.registerPaletteEl}>
      <div className="qb-palette-scroll">
        {CATEGORIES.map((category) => (
          <section className="qb-palette-category" key={category}>
            <h3 className={`qb-palette-heading qb-cat-${category}`} style={{ '--qb-cat-color': CATEGORY_COLORS[category] }}>
              {CATEGORY_LABELS[category] ?? category}
            </h3>
            <div className="qb-palette-list">
              {listBlocksByCategory(category).map((def) => (
                <PaletteEntry def={def} key={def.type} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="qb-palette-hint">Drag a block here to delete it.</p>
    </div>
  )
}
