// narrate(program) -> plain-English, indented description of a block
// program. Used by the Coach panel's "Explain my program" button. Pure,
// no React/DOM.

import { getBlockDef } from './catalog.js'

function isLiteral(node) {
  return Boolean(node) && typeof node === 'object' && node.literal === true
}

function isBlockNode(node) {
  return Boolean(node) && typeof node === 'object' && typeof node.type === 'string'
}

function renderLiteralValue(value) {
  if (value === null || value === undefined) return '(empty)'
  if (typeof value === 'object' && 'x' in value && 'y' in value) return `(${value.x}, ${value.y})`
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function renderInline(node) {
  if (node === undefined) return '(empty)'
  if (isLiteral(node)) return renderLiteralValue(node.value)
  if (isBlockNode(node)) return renderStatementLine(node)
  return '(empty)'
}

function renderStatementLine(block) {
  const def = getBlockDef(block.type)
  if (!def) return `an unknown block ("${block.type}")`

  return def.labelTemplate.replace(/\{(\w+)\}/g, (_match, slotName) =>
    renderInline(block.inputs ? block.inputs[slotName] : undefined),
  )
}

function capitalize(text) {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function indent(depth) {
  return '  '.repeat(depth)
}

function renderBody(list, depth, lines) {
  for (const block of list ?? []) {
    const def = getBlockDef(block.type)
    const line = renderStatementLine(block)

    if (def?.hasBody) {
      lines.push(`${indent(depth)}${capitalize(line)}:`)
      renderBody(block.body ?? [], depth + 1, lines)

      if (def?.hasElseBody) {
        lines.push(`${indent(depth)}Otherwise:`)
        renderBody(block.elseBody ?? [], depth + 1, lines)
      }
    } else {
      lines.push(`${indent(depth)}${capitalize(line)}.`)
    }
  }
}

/** Renders a full program to an indented, plain-English string. */
export function narrate(program) {
  const lines = []

  for (const script of program?.scripts ?? []) {
    if (!script.hat) {
      lines.push('(a script with no starting block)')
      continue
    }
    lines.push(`${capitalize(renderStatementLine(script.hat))}:`)
    renderBody(script.body ?? [], 1, lines)
  }

  return lines.join('\n')
}

export default narrate
