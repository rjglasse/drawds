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

## Git and beads here

One feature branch per piece of work, fast-forwarded into main once the user OKs the merge, then deleted; push main
when asked. Beads' JSONL exports (`.beads/issues.jsonl`, `.beads/interactions.jsonl`) are git-ignored: never commit
them, so no "Beads: sync" commits. The issue database itself goes to GitHub under `refs/dolt/data` with
`bd dolt push` (run it whenever main is pushed; `dolt.auto-push` is off), and a fresh clone gets it back with
`bd bootstrap`.


## Build & Test

```bash
npm install
npm run dev        # Vite dev server; window.editor is exposed in dev for poking/driving
npm test           # vitest (pure layout/data logic), src/**/*.test.ts
npm run test:e2e   # Playwright against the dev server, installed Chrome, e2e/*.e2e.ts (smoke.e2e.ts plays every
                   # menu operation on every structure, ~360, and fails on any page or console error)
npm run typecheck  # tsc -b
npm run build      # typecheck + production bundle
```

To launch, drive, screenshot or export the running app, use the `run-drawds` skill
(`.claude/skills/run-drawds/SKILL.md`, driver `driver.mjs` next to it).

## Architecture Overview

React + Vite + TypeScript app around a single `<Tldraw>` canvas (tldraw SDK v5, see https://tldraw.dev).
Each data structure is a custom tldraw shape plus a gesture-driven tool.

**Before working in a folder, read its `README.md`**: how that part works, the decisions behind it and the lectures
it serves (this map is one line each). Keep the README up to date with the code, not this file.

- `src/shapes/<structure>/` - `*-shape-types.ts` (props, `TLGlobalShapePropsMap` augmentation, props
  migrations), `*ShapeUtil.tsx`, `*ShapeTool.ts`, `layout.ts` (pure, unit-tested geometry/gesture maths).
  `src/shapes/sizes.ts` has the shared S/M/L/XL cell sizes.
- `src/cells/` - what every structure shares: in-place cell editing (`EditableCells`, `CellShapeUtil`), marks,
  colour-blind cues, Clean copy, followers (shapes that follow a structure: views, code boxes, recursion trees).
- `src/nodelink/` - node-link structures: one shape per structure, `NodeLinkShapeUtil` turning props into a `Scene`;
  `playback.ts`, animated operations (frames, the play bar, predict mode, the result's undo step).
- `src/sketch/` - the press-and-drag tools (`createDragTool`, `createLineSketchTool`).
- `src/shapes/array/` - arrays, stacks and queues (kinds of array, fixed capacity, circular buffers), and their
  operations as pure frame generators: searches, sorts, quicksorts, scans, passes, shuffles, merges, counting sort,
  stack uses, amortised appends, swaps.
- `src/shapes/list/` - linked lists (singly / doubly, tail, circular, sentinel, cycles; linked stacks and queues),
  their operations, size field and invariants, merge and merge sort, variant code.
- `src/shapes/tree/`, `general-tree/`, `trie/`, `heap/` - binary trees and BSTs, general trees, tries and heaps:
  tidy layouts, traversals, measures, BST search / insert / delete, tree terms.
- `src/shapes/hash/` - hash tables: chaining or probing, hash codes and compressions, insert / find / delete / rehash.
- `src/shapes/union-find/` - union-find over its parent array: find, union by size / rank, compression, gliding nodes.
- `src/shapes/graph/`, `graph-view/` - graphs (sketch, connect, re-wire, extend, re-layouts, searches, paths,
  Dijkstra, Prim, Kruskal, topological sort) and their views beside them (matrix, lists, edge list, union-find, costs).
- `src/shapes/matrix/` - matrices: headers and labels, traversals, transpose, staircase search.
- `src/shapes/memory/`, `ring/`, `growth/`, `outcomes/` - views following a structure: in memory, a circular buffer
  as a ring, a sort's counts as n grows, a shuffle's outcomes.
- `src/shapes/recursion/` - recursion trees grown by recursive operations, and the recursion tracer.
- `src/shapes/code/` - code boxes: highlighting, editing, the running algorithm's code beside a structure (lit
  lines, live values, tests written out, line counts, folding), every algorithm's code, languages.
- `src/transcript/` - the code beside a structure: every move as code, Track with code, the board as a script.
- `src/pointers/` - named pointers: the model and their layout.
- `src/controls/` - on-canvas controls (grips, buttons, `InFront`), the play bar's placement, the camera.
- `src/data/` - the seeded RNG, fills, the pinned seed, New values.
- `src/export/`, `src/lesson/`, `src/files/` - steps as images, the lesson log, boards as files.
- `src/sound/` - an easter egg (keep it one).
- `src/ui/` - toolbar, shortcuts, context menu (`overrides.tsx`), style panel pickers, What can I do?.

## Conventions & Patterns

- Render shapes as SVG via one component shared by `component()` and `toSvg()` so export matches the canvas.
- Everything a shape draws must start at its origin and lie inside its geometry bounds: tldraw places the shape's
  box at the origin, sized to the bounds, and content outside it leaves ghosts when the camera moves (dds-55z.29).
  Controls that reach outside (x / + buttons, grips, insert-a-key, prompts, a drag's preview) go in front of the canvas:
  wrap them in `<InFront id={shape.id}>` (`svg` for SVG children; `src/controls/InFront.tsx`), which portals them into a
  layer that follows the camera as tldraw's shape layer does, in the shape's own space, so they are written as before
  (dds-55z.37). Badges count in the box (`sceneBadges`) and in an operation's room (each step's badges); node-link
  glides only while an operation is open. `e2e/bounds.e2e.ts` measures what reaches past each box. Chrome on the
  teacher's Mac still left copies of a shape's last text behind during a fast zoom (not reproducible in automated
  Chrome), so tldraw's `Background` is `RepaintingBackground` (`src/controls/CanvasRepaint.tsx`): a practically
  invisible fill flips at most once a frame while the camera moves and when it stops, repainting the whole canvas
  (localStorage `drawds:repaint` = 'off' disables it, to compare).
  Node-link scenes are moved there automatically (`getScene` is the moved layout; models and `getGrowGrips` use
  layout coordinates; handles convert with `layoutOffset(initial)`); arrays make room in `getArrayMetrics().origin`.
  When the offset changes, `CellShapeUtil.onBeforeUpdate` moves the shape so nothing shifts on the page. While an
  operation is open, node-link steps can draw more than the shape (a rehash, a heap's new level, a list node off the
  line): `withPlaybackRoom` puts the union of every step's extent in `meta.drawdsRoom` (playback.ts `ROOM_KEY`; set on
  open, cleared with null around the commit and on close, always history-ignored), the layout counts it and the
  geometry gets two internal corner points, so the box holds every step and still. Caches keyed by props must also
  key on the meta / layout offset (layouts, placed pointers, the bar's placement; tldraw's own indicator cache is per
  props, so `getIndicatorPath` reads the live record). `clearStaleRooms` (App onMount). An upright array (a growing
  stack) whose steps show more cells than it has gets room above it the same way (`ArrayShapeUtil.withPlaybackRoom`:
  `minY` the rows' height), so its index 0 comes down into the box and stays put on the page: measure an array with
  `arrayMetricsOf(shape)` (cells.ts, reads the room), not `getArrayMetrics(shape.props)`.
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
  its button (`src/nodelink/hover.ts`, reach 16 screen px); coarse pointers show all. What the pointer is near is a
  computed per shape (`hoverTarget`: its value changes only when the hovered node or edge does), and the buttons and
  grips render in a `Tracked` child (`src/controls/Tracked.tsx`), arrays' too: never read the raw pointer, or
  `getInstanceState()` (it changes with the cursor; `isCoarsePointer`), in a shape's `component()`, or the whole
  structure redraws on every pointer move (a selected 40-node graph dropped frames under a 6x CPU throttle; now it
  doesn't redraw at all). Edge routes are kept per scene (`routeScene`).
- Marks (`src/cells/marks.ts`, `marking.ts`): every cell shape stores `props.marks` (cell key -> colour);
  `CellShapeUtil.getMarks/withMarks`; keys 1-4 / 0 are tldraw actions acting on the element under the pointer
  (`markTargetUnderPointer`), which is why tldraw's numbered toolbar shortcuts are disabled in App.tsx. Prune
  marks when elements are removed (tree ids are paths and get reused); swap them when values swap.
- Colour-blind cues (`src/cells/cues.ts`, `CueBadge.tsx`; main menu toggle, localStorage `drawds:colour-cues`, off by
  default): every mark and highlight colour also gets a shape (red triangle, orange diamond, green square, blue
  circle) as a badge in an element's top-left corner (on a circle's rim), and marked or highlighted edges a line
  pattern (`cueDash`: green solid, red dashes, orange dots, blue dash-dot, the plain edge underneath). Shapes stand for
  the colour, not a meaning. Utils read `showsColourCues()` in `component` / `toSvg` and pass `cues` to SceneSvg,
  ArraySvg and MatrixSvg; a new renderer of marks or highlights must draw them too. The Mark menu shows the glyphs.
- Random fills are distinct (`random`, `letters`; sorted modes strictly monotone) until the pool runs out;
  growth and insertion skip values already present. `repeats` keeps duplicates.
- New values: every structure with random contents has one in its own menu (`rerollShape` in `fill-style.ts`: a new
  seed, then the util's `refill`, or `redraw` for content that isn't a fill, a trie's words, a graph's weights, so a
  fill picked for other shapes selected with it leaves them alone), one undo step; a BST stays in order, a heap a heap.
- Hover highlights (`hoverHighlights`): always on where they are how the structure is read (a heap's index
  arithmetic, union-find's way up, a trie's prefix path); with their Show toggle where they teach a concept (a tree's
  path and subtree with Tree terms, a graph's neighbours with Degrees).
- Child slots: implement `getEmptySlots` + `addChildAt`; the base draws a + on the hovered node's lower-left /
  lower-right corner per empty slot and opens the new child for editing.
- Animated operations: implement `removeNodeAnimated` and/or `getInsertPrompt` + `insertKey`, build frames and
  call `playOperation`; compare keys with `compareKeys` (numeric when both are numbers). Give every frame a
  `caption` saying why (the teacher may pause on it), and end with a frame showing why it stopped. Where predict
  mode's default question is weak, give a frame an `ask` worded so it doesn't give the answer away: the same question
  whichever way the step goes (BFS / DFS "A–B: is B new?", BST "30 vs 21: which way?", hashing "which bucket does
  h(22) give?", binary search "found it, or which half?", sorts "swap them or not?", recursion "which call comes
  next?", list code "which line comes next?", tree traversals "where does the walk go next?", Dijkstra "A–B (3): does
  dist(B) go down?"); the first frame is asked too, as the operation opens (what it does first, where it starts);
  array operations pass `ask` / `askFocus` to the recorder's `step`.
  An operation with code names its algorithm (`playOperation`'s `code`; arrays return it as `ArrayOperation.code`) and
  each frame the line it shows (`Frame.line`, a tag in that algorithm's code in every language; a frame without one
  lights nothing). Write the code as the steps run it, so the lit line reads as what the step shows; the unit test in
  `src/shapes/code/algorithms.test.ts` checks every tag a step names is in each language's code.
- Operations from a node (BFS / DFS on graphs, pre/in/post/level-order on trees and heaps, an array's searches):
  implement `nodeOperations(shape, key)` (on `CellShapeUtil`); they appear in that element's context menu.
  Whole-structure operations (an array's sorts) go in `shapeOperations(shape)`, shown wherever it is clicked.
  Every structure's menu has one layout (`NodeOperationsMenu`): **Step by step** (animated operations, the
  default `section`), then a submenu named by `menuName(shape)` (`section: 'actions'`: instant changes, e.g. Sort,
  Mirror, Insert a row, New values), then **Show** (`section: 'show'`: views beside it, indices), then the shared
  Mark and Pointer; empty ones are left out. A `group` keeps a family (searches, sorts, traversals) together
  behind a divider; `submenu` is a category, a submenu of its own listed first in its section (`CATEGORIES` order in
  overrides.tsx: Basics, Sorts, Shuffles, others, Misc last; Misc only for what fits nowhere else). An array's Step by
  step is all categories: Basics (searches, insert / delete, scans, sums, capacity), Sorts, Shuffles; test ids
  `context-menu-sub.drawds-array-steps-basics-button` etc., e2e's `arrayStep(page, item)` opens the right one. A menu
  taller than the window scrolls (drawds.css). An operation selects its structure when it opens (it can be started
  from the menu over it while something else is selected, and a finished one closes when another shape is selected); element operations come before whole-structure ones and name the element ("Pre-order from
  42"). Submenu test ids follow the sections: `context-menu-sub.drawds-<menuId>-<steps|actions|show>-button`.
  `moves(shape)` lists the structure's gestures, buttons and settings for the style panel's "What can I do?"
  (`src/ui/StructureHint.tsx`, a popover; the shared moves are added there).
  Traversals are pure frame generators (`src/shapes/graph/traverse.ts`, `src/shapes/tree/traverse.ts`) with
  `strips` (several: stack or queue, plus the output). Heaps reuse the tree one and light both views. An
  operation can ask for a value first (`prompt`; e.g. a list's "Find a value...").
- Steps the props can't express (a list node not linked in yet, an arrow re-pointed or curving back) give the
  frame a whole `scene` (layout coordinates; drawn at the committed offset) and their own `pointers` (curr,
  prev, next: they slide between steps); `SceneEdge.bend` curves an edge. See `src/shapes/list/operations.ts`
  (find, insert after / at the head, delete, reverse, find the middle with slow / fast, insert in order,
  append, print, print backwards, Floyd's cycle detection), narrated as the code a teacher writes; and `merge.ts`
  (dds-55z.20.9, plain singly linked lists): Merge with another sorted list on the page (merge(a, b): a dummy node and
  tail, tail.next takes the smaller, re-pointed, none copied; the other list drawn where it is, its nodes under the ids
  they get, so the result slides into line; it goes with the result) and merge sort (slow and fast find the middle, the
  halves drop a row each cut, a null's room apart; each merge re-points from a dummy in the row above, arrows along the
  row arcing over, and the merged run rises where its parent was). Once the result is in, steps are
  drawn less the move the commit made (`PlaybackView.committed`), so a new head doesn't shift them or the bar.
- Pointers: when elements go, prune pointers with `prunePointers` wherever marks are pruned. Atoms read inside
  a separate React component (not the shape's `component()`) need `useValue`, or it won't re-render.
- Removable edges: implement `removeEdge` (+ optional `canRemoveEdge`); the base draws an x mid-edge (beside the
  label when there is one). A hovered node wins over edges, so node buttons never compete with edge buttons.
- Edge marks: set `markableEdges = true`; `markKeyAt` then returns `edge:<key>` for an edge near the pointer
  (the same key as the edge's label cell) and SceneSvg draws it heavier in the mark colour. Prune edge marks
  when edges go (graphs: `markKeys`; lists: `listMarkKeys`, each node's next and prev arrow and head's and tail's, so a
  mark stays on a pointer while its node is there; trees: `treeMarkKeys`, the edge down to each child).
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
