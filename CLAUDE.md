# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
npm install
npm run dev        # Vite dev server; window.editor is exposed in dev for poking/driving
npm test           # vitest (pure layout/data logic), src/**/*.test.ts
npm run test:e2e   # Playwright against the dev server, installed Chrome, e2e/*.e2e.ts
npm run typecheck  # tsc -b
npm run build      # typecheck + production bundle
```

To launch, drive, screenshot or export the running app, use the `run-drawds` skill
(`.claude/skills/run-drawds/SKILL.md`, driver `driver.mjs` next to it).

## Architecture Overview

React + Vite + TypeScript app around a single `<Tldraw>` canvas (tldraw SDK v5, see https://tldraw.dev).
Each data structure is a custom tldraw shape plus a gesture-driven tool:

- `src/shapes/<structure>/` - `*-shape-types.ts` (props, `TLGlobalShapePropsMap` augmentation, props
  migrations), `*ShapeUtil.tsx`, `*ShapeTool.ts`, `layout.ts` (pure, unit-tested geometry/gesture maths).
  `src/shapes/sizes.ts` has the shared S/M/L/XL cell sizes.
- `src/cells/` - shared in-place cell editing: `EditableCells<S>` (hit-test, box, get/set, neighbours) and
  `CellShapeUtil`, a ShapeUtil base that wires tldraw's edit lifecycle and renders the inline input.
- `src/nodelink/` - node-link structures (lists, trees, heaps, graphs). Decision (dds-55z.15.1): ONE
  shape per structure, props hold the model. A subclass of `NodeLinkShapeUtil` turns props into a `Scene`
  (positioned nodes + edges, shape space) and applies model edits; the base does geometry, `SceneSvg`
  rendering/export, value editing via `sceneCells`, and node dragging via tldraw handles (bottom edge of each
  node). `geometry.ts` is the pure edge routing (clipping, curved twins, self-loops, arrowheads).
- `src/sketch/` - press-and-drag tools: `createDragTool` (generic gesture state; trees, heaps, graphs) and
  `createLineSketchTool` on top of it (`nextSketchState`, pure; arrays, lists). The latest gesture state is always
  kept; `same` only decides whether the shape is redrawn, so gestures can follow the pointer's path (graphs).
- `src/shapes/array/swap.ts` - drag a cell's handle onto another cell to swap (drag state in a per-editor atom,
  ghost + target highlight while dragging, CSS `drawds-swap` arc animation keyed per swap).
- `src/nodelink/playback.ts` - animated operations, stepped through: frames (props override, value swaps
  between node keys, highlights on nodes and `edge:` keys that accumulate and can be cleared with null, badges,
  a queue/stack `strip`, a one-line `caption`) shown every STEP_MS, then the final update commits as one undo
  step; highlights fade (FADE_MS) or, with Shift, become marks. While an operation is open `PlayBar` sits
  under the structure (drawn by `PlaybackOverlay` in tldraw's InFrontOfTheCanvas, with the queue/stack strip,
  so neither lies outside the shape's box) and keys go to it first (window capture: Space, Left/Right, Enter /
  Shift+Enter, Esc cancels without changing anything). Once the result is committed the bar stays (`done`):
  step back through it or replay it, then Done / Enter / Esc, or select something else / edit the shape;
  `isBusy` says when the shape's own controls should hide. Operations open paused on step 1 so the teacher sets
  the pace; the bar's autoplay toggle (localStorage) plays them straight away instead. `stateAt(frames, step)` is the pure accumulation. `displayScene` (frame or committed)
  feeds rendering and the selection outline. SceneSvg draws node shapes then values in two passes so a value
  in flight is never painted over.
- `src/pointers/` - named pointers (i, curr, root...): `props.pointers` on every cell shape, `{id, name, at}`
  with `at` an element key (arrays allow -1 and n, lists `#null`). Pure model (`pointers.ts`) and layout
  (`layout.ts`: labels side by side or stacked, arrow onto the element); `CellShapeUtil` renders them
  (`renderPointers`, sliding via a CSS transition; `renderPointerOverlays` for drag / click-to-pick-up / arrow
  keys / rename prompt). Shapes implement `pointerAnchor` (box + side), `pointerStep`, `pointerNames`;
  node-link shapes get defaults. Added from the context menu's Pointer submenu.
- `src/shapes/heap/` - heaps stored as their array (`values`, index i's children 2i+1, 2i+2), drawn as the
  implicit complete tree (keys `"i"`) plus the array (keys `"a" + i`); marks keyed by index. `heap.ts` is pure
  (sift up/down with swaps + path, insert, removeAt, heapify, violations).
- `src/shapes/tree/bst.ts` - BST as a *kind* of binary tree (`drawds:tree-kind` style): in-order key placement,
  insert (path), delete (leaf / one child / two children via successor), violation check with ancestor bounds.
- `src/shapes/tree/` - binary trees: nodes with `children: [left, right]` slots (null = empty), root first;
  `generate.ts` (random shapes by depth + fullness, growth-stable: existence depends only on seed + path, ids
  are `n` + path), `layout.ts` (contour-based tidy layout; a lone child offset `lone`, well under half the
  sibling spacing, so parentage stays unambiguous), `model.ts` (add child, remove subtree).
- `src/shapes/graph/` - graphs: nodes at free positions in cell units (so the size style scales the drawing), edges
  `{from, to, weight}` (weights always stored; shown when the `drawds:graph-weights` style says so; direction and
  A/0 labels are styles too, see `src/ui/GraphPickers.tsx`). `generate.ts` is the sketch: a node drops every
  GRAPH_SPACING along the drag, node k joins its nearest earlier node (connected) plus maybe two more nearby,
  skipping crossings, near misses and narrow angles (planar-ish); growth-stable like trees. `model.ts` pure edits;
  `connect.ts` the connect grip (a 'create' handle `connect:<id>` on each node's right rim; drag state in a
  per-editor atom; drop on a node = edge, in empty space = new node + edge).
- `src/controls/` - on-canvas controls shown while a structure is the only selected shape
  (`showsStructureControls`): grow grips (tldraw `create` handles `grow` / `grow-start`, drawn only on hover,
  plus our own '+' `GrowGrip`; `grownCount` is pure) and `ControlButton` (HTML insert '+' / remove 'x',
  since handles can't be clicked). New values come from `extendValues` in `src/data/fill.ts` (end or start).
- `src/data/` - seeded RNG (`mulberry32`) and fill generators (`fillValues`); `fill-style.ts` is the
  `drawds:fill` StyleProp plus `refillSelectedShapes`.
- `src/ui/` - toolbar/shortcuts/context menu (`overrides.tsx`), style panel Fill picker, icons.

## Conventions & Patterns

- Render shapes as SVG via one component shared by `component()` and `toSvg()` so export matches the canvas.
- Everything a shape draws must start at its origin and lie inside its geometry bounds: tldraw places the shape's
  box at the origin, sized to the bounds, and content outside it leaves ghosts when the camera moves (dds-55z.29).
  Node-link scenes are moved there automatically (`getScene` is the moved layout; models and `getGrowGrips` use
  layout coordinates; handles convert with `layoutOffset(initial)`); arrays make room in `getArrayMetrics().origin`.
  When the offset changes, `CellShapeUtil.onBeforeUpdate` moves the shape so nothing shifts on the page.
- Use tldraw style props (`DefaultColorStyle`, `DefaultSizeStyle`, `DefaultFontStyle`) so the built-in style panel
  drives our shapes; set `shapeType` on the tool so the panel shows them while the tool is active.
- Keep gesture/layout maths in pure functions and test them with vitest.
- Pedagogy first: plan each structure around the moves a teacher makes live in front of a class (insert,
  delete, extend, swap, highlight...), not just the creation gesture. Those moves are beads, not afterthoughts.
- A creation gesture is one undo step: `markHistoryStoppingPoint` on enter, `bailToMark` on cancel.
- New structure with editable values: extend `CellShapeUtil`, implement `EditableCells` (pure, unit-test it),
  skip drawing the value of `getEditingKey(shape)`, and render `this.renderCellEditor(shape)` in `component`.
  Cell keys are strings (array index, later "r,c", node ids).
- New node-link structure: extend `NodeLinkShapeUtil`, write a pure `layout.ts` that returns a `Scene`
  (normalised to start at 0,0, then drag offsets applied), and build its tool with `createLineSketchTool` (or a
  new gesture). Values come from `fillValues(fill, seed, n)`; store `fill` (FillStyle) and `seed` on the shape
  and implement `refill` so the Fill picker can regenerate it.
- Growable structure: arrays add the handle in `getHandles` and handle `GROW_HANDLE_ID` in `onHandleDrag`;
  node-link shapes implement `getGrowGrips` + `growTo(shape, initial, gripId, to)`. Always compute from
  `info.initial` (the shape at drag start), and shift `x`/`y` when the shape's origin moves so existing
  elements stay put on the page (lists: `anchorShift` keeps the first surviving node fixed).
- Removable nodes: node-link shapes implement `removeNode` (+ optional `canRemoveNode`); the base draws an x
  on each node and makes each removal one undo step. With a mouse only the node / edge near the pointer shows
  its button (`src/nodelink/hover.ts`, reach 16 screen px); coarse pointers show all.
- Marks (`src/cells/marks.ts`, `marking.ts`): every cell shape stores `props.marks` (cell key -> colour);
  `CellShapeUtil.getMarks/withMarks`; keys 1-4 / 0 are tldraw actions acting on the element under the pointer
  (`markTargetUnderPointer`), which is why tldraw's numbered toolbar shortcuts are disabled in App.tsx. Prune
  marks when elements are removed (tree ids are paths and get reused); swap them when values swap.
- Random fills are distinct (`random`, `letters`; sorted modes strictly monotone) until the pool runs out;
  growth and insertion skip values already present. `repeats` keeps duplicates.
- Child slots: implement `getEmptySlots` + `addChildAt`; the base draws a + on the hovered node's lower-left /
  lower-right corner per empty slot and opens the new child for editing.
- Animated operations: implement `removeNodeAnimated` and/or `getInsertPrompt` + `insertKey`, build frames and
  call `playOperation`; compare keys with `compareKeys` (numeric when both are numbers). Give every frame a
  `caption` saying why (the teacher may pause on it), and end with a frame showing why it stopped.
- Operations from a node (BFS / DFS on graphs, pre/in/post/level-order on trees and heaps): implement
  `nodeOperations(shape, key)`; they appear in that node's context menu, grouped by `submenu` if given.
  Traversals are pure frame generators (`src/shapes/graph/traverse.ts`, `src/shapes/tree/traverse.ts`) with
  `strips` (several: stack or queue, plus the output). Heaps reuse the tree one and light both views.
- Pointers: when elements go, prune pointers with `prunePointers` wherever marks are pruned. Atoms read inside
  a separate React component (not the shape's `component()`) need `useValue`, or it won't re-render.
- Removable edges: implement `removeEdge` (+ optional `canRemoveEdge`); the base draws an x mid-edge (beside the
  label when there is one). A hovered node wins over edges, so node buttons never compete with edge buttons.
- Edge marks: set `markableEdges = true`; `markKeyAt` then returns `edge:<key>` for an edge near the pointer
  (the same key as the edge's label cell) and SceneSvg draws it heavier in the mark colour. Prune edge marks
  when edges go (graphs: `markKeys`). Lists and trees don't opt in yet (dds-55z.26.3 notes).
- Editing after a handle drag: tldraw's DraggingHandle returns to idle after `onHandleDragEnd` (which gets the
  initial handle, not the drop point: keep that in your own drag state), so start the edit with
  `editor.timers.setTimeout(..., 0)`. It opens ~30 ms after pointer up; tests should poll for it.
- Insertable edges: implement `insertOnEdge` (+ optional `canInsertOnEdge`) returning the update and the new
  node's key; the base draws a + mid-edge, applies the update as one undo step, then opens the new node with
  `CellShapeUtil.editCell(shape, key)` (start editing any cell programmatically).
- Persisted props: shapes are saved in IndexedDB (`persistenceKey`), so any props change needs a step in that
  shape's `createShapePropsMigrationSequence`, with a unit test and ideally an e2e load check
  (`e2e/migration.e2e.ts`).
- Tool icons: pass JSX via `maskIcon()` rather than a string + `assetUrls` (Vite's inlined SVG data URIs break
  tldraw's unquoted CSS `url()`).
