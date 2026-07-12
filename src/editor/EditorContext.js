// Shared React context for the block editor. Kept in its own tiny module
// (rather than inside Workspace.jsx) so ScriptView/BlockView/SlotEditor can
// import it without creating a circular import with Workspace.jsx.

import { createContext, useContext } from 'react'

export const EditorContext = createContext(null)

export function useEditorContext() {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('Block editor components must be rendered inside <Workspace>.')
  return ctx
}
