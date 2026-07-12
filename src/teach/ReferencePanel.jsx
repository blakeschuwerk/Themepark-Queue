// The block reference panel (BLOCKS_SPEC.md §7.4): every catalog block,
// grouped by category, each showing its docs blurb + example, with a
// search box. Category colors come from the catalog itself. Also exports
// BlockHelpTooltip, a small reusable tooltip body for hovering a block in
// the palette/scripts elsewhere in the app.

import { useMemo, useState } from 'react'
import { CATEGORIES, CATEGORY_COLORS, BLOCK_CATALOG } from '../blocks/catalog.js'
import './teach.css'

const CATEGORY_TITLES = {
  events: 'Events',
  control: 'Control',
  motion: 'Motion',
  sensing: 'Sensing',
  operators: 'Operators',
  variables: 'Variables',
  walls: 'Walls',
}

function plainLabel(def) {
  return def.labelTemplate.replace(/\{(\w+)\}/g, (_m, name) => name)
}

function matchesQuery(def, query) {
  if (!query) return true
  const haystack = `${plainLabel(def)} ${def.docs?.blurb ?? ''} ${def.type}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

/** A small, reusable tooltip body for a single block's docs — usable from
 * the palette/script view elsewhere in the app (hover tooltips). */
export function BlockHelpTooltip({ type }) {
  const def = BLOCK_CATALOG[type]
  if (!def) return null
  return (
    <div className="qt-tooltip">
      <div className="qt-tooltip-title">{plainLabel(def)}</div>
      <p className="qt-tooltip-blurb">{def.docs?.blurb}</p>
      {def.docs?.example ? <code className="qt-tooltip-example">{def.docs.example}</code> : null}
    </div>
  )
}

function BlockCard({ def }) {
  return (
    <li className="qt-ref-block" style={{ '--qt-cat-color': CATEGORY_COLORS[def.category] }}>
      <div className="qt-ref-block-header">
        <span className="qt-ref-swatch" aria-hidden="true" />
        <span className="qt-ref-block-name">{plainLabel(def)}</span>
      </div>
      <p className="qt-ref-blurb">{def.docs?.blurb}</p>
      {def.docs?.example ? <code className="qt-ref-example">{def.docs.example}</code> : null}
    </li>
  )
}

export default function ReferencePanel() {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    return CATEGORIES.map((category) => ({
      category,
      blocks: Object.values(BLOCK_CATALOG).filter(
        (def) => def.category === category && matchesQuery(def, query),
      ),
    })).filter((group) => group.blocks.length > 0)
  }, [query])

  return (
    <div className="qt-reference">
      <div className="qt-ref-search">
        <input
          type="search"
          placeholder="Search blocks…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search blocks"
        />
      </div>

      {groups.length === 0 ? (
        <p className="qt-empty">No blocks match "{query}".</p>
      ) : (
        groups.map((group) => (
          <section key={group.category} className="qt-ref-group">
            <h3 style={{ color: CATEGORY_COLORS[group.category] }}>
              {CATEGORY_TITLES[group.category] ?? group.category}
            </h3>
            <ul>
              {group.blocks.map((def) => (
                <BlockCard key={def.type} def={def} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
