# Queue Brain — Block Logic Sandbox

A local Vite + React app where you program the routing "brain" of a dynamic
theme-park queue by snapping together Scratch-like visual blocks. The block
program runs once per simulation tick to decide how guest parties move
through an editable grid of rooms; a 3D viewport (React Three Fiber)
visualizes the result live, and a built-in lesson track with hints teaches
the block language from a single step to a full multi-party reservation
system. See `docs/BLOCKS_SPEC.md` for the full design spec.

## Run

```sh
npm install
npm run dev
```

Then open the printed local URL. The app loads with a 3D viewport + toolbar
(top left), the block workspace (right), and a tabbed Coach / Reference /
World panel (bottom left) — start with Lesson 1 in the Coach tab.

## Test

```sh
npm test
```

Runs the full `node --test` suite (interpreter, ast, catalog, narrator,
editor state, engine hooks, lessons, hints) headlessly — no browser needed.

## Structure

- `src/blocks/`: the block language core — catalog, AST helpers, interpreter (`runTick`), narrator, example programs.
- `src/engine/`: grid/pathfinding helpers and the violation rule monitor.
- `src/editor/`: the block editor UI (palette, script view, slot editing, drag/reorder, autosave).
- `src/hooks/useSandboxEngine.js`: owns world/simulation state and drives the interpreter each tick.
- `src/components/`: the 3D viewport, grid/agent rendering, and the World tab's grid/party/room controls.
- `src/teach/`: lessons, the hint engine, the Coach panel, and the block reference panel.
- `src/App.jsx`: wires everything together into the three-region app shell.
