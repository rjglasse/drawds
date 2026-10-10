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
  ghost + target highlight while dragging). Values that move are `Slides` (new index -> old index: a swap, an
  instant sort/shuffle via `orderSlides`, a step's `swaps`/`moves` via `frameSlides`), drawn with the CSS
  `drawds-swap` keyframes keyed per move: crossing values arc (forward over, back under), a one-way shift slides
  straight. `ArrayShapeUtil.slide` animates once, then forgets.
- `src/shapes/array/operations.ts` - array algorithms as pure frame generators over `{values, marks}` (marks
  travel): binary / linear search, insertion / selection / bubble sort, Lomuto and Hoare partitions, merge sort (a
  `merged` strip, copy-back as `moves`), insert / delete by shifting. Fixed capacity (`sizing` 'fixed', the Length
  picker in `src/ui/ArrayPickers.tsx`): cells are the capacity, `used` (shown as "size") counts the values in use,
  the rest are blank spare slots; `usedCount(props)` everywhere, operations run on the used part (`play` pads frames
  back) unless `{ whole: true }` (insertFixed / deleteFixed / appendFixed / growFixed / appendMany). A step can show
  a second row under the array (`props.aux`: newArr), with `moves` keyed `aux:<i>` between the rows. Quicksort is
  `quicksorts.ts` (range faded with `dim`, open calls as a `call stack` strip, counts calls and max depth), with
  lecture 10a's improvements one at a time (`variant`): a random pivot (`k` from lo..hi, seeded, swapped to hi), the
  median of three (a value, not their average: `medianOf3`'s 2-3 comparisons, then to hi; ranges of two just
  partition), three-way (Dijkstra's lt / i / gt inside quicksort, Sedgewick's way, pivot a[hi]: equal values green
  at once; also alone, `partition3Array`) and a cut-off to insertion sort (k asked for, `$CUTOFF`; every call of at
  most k values insertion sorts, j stopping at lo); each ends with plain quicksort's counts on the same input, and
  with many equal values says only three ways helps. `sort-counts.ts`: every sort's counts without its steps
  (`countSort` over `ranks`, quicksorts on a stack of their own), the same numbers by the same names (its test runs
  both on every kind of input).
- Counts as n grows (lecture 10b, `src/shapes/growth/`, dds-szw.23): the lecture times sorts; drawds counts their
  comparisons, at n = 10, 100, 1000 on sorted, reversed, random and 0-2-only input (`growthInput`, pure), each count
  over its factor (×10 linear, ×15 n log n, ×100 quadratic) and a "grows as" row from the analysis (`GROWTH`: one run's
  factor can't tell n from n log n). A `sort-growth` shape following the array (`structureId`; `sort`, `seed`,
  `cutoff`), filled a row at a time by `growthOperation` (`Frame.growth`: the rows shown, the rest '?'), opened by
  `openGrowth`. Sorts > "Counts as n grows: <the sort last played on the array>" (`lastSorts`, insertion sort first).
  Fill range 0-2 (`few`) is the lecture's data with max 2.
- Loop invariants (lecture 4, dds-szw.7): `Frame.band` `{ from, to, label }` puts a labelled bracket under array cells
  (right of a column), laid out by the array's `playbackLayout` (`band`, below the indices; strips go under it) and drawn
  in front of the canvas and in exported steps (`src/controls/BandSvg.tsx`). `sumWithInvariant`: lecture 4's sum with a
  while loop, total from nums[0], the band "total = 4 + 6 + 5 = 15" over the part done at the beginning, after each
  pass and at the end. A step's pointers drawn in front of the canvas keep their labels apart (`placePointers`'s
  `apart`: an overlapping label goes up a row).
- `src/shapes/array/scans.ts` - lectures 2-3's counted scans (Levitin's MaxElement, UniqueElements, SequentialSearch2):
  find the largest (`maxval` in a strip, n - 1 comparisons, updates counted), all unique? (every pair i < j, n(n - 1)/2
  at worst, a repeat stops it red), sentinel search (the key in an extra cell past the end, no i < n check, counts the
  checks saved). Scans in the Step by step menu's `scan` group; sentinel search with the searches, from a cell.
- `src/shapes/array/shuffles.ts` - lecture 2's shuffles step by step (`shuffle` group), named as its slides name them
  (the random index is the pointer `n`): the unfair shuffle (n from the whole array for every i) and Fisher-Yates (i
  from len - 1 down to 1, n from 0..i, placed values green); a pick then a swap per i, picks from the pinned seed if
  any (`seedForSketch`), the last step saying why (len^len runs against len! orders). `everyRun` (pure) lists every
  run of picks and the order it leaves: on [1, 2, 3] the unfair one's 27 runs come out 5/5/5/4/4/4, Fisher-Yates' 6
  once each.
- `src/shapes/outcomes/` - a shuffle's outcomes (dds-szw.16, lecture 2's "Draw: Unfair / FY Shuffle Permutations" and
  its demo "run a shuffle many times and show the distribution"), a `shuffle-outcomes` shape following the array
  (`structureId`; `kind` unfair / fisher-yates, `mode` tree / tally, the start `values`, a `seed`). `outcomes.ts` (pure):
  `outcomeTree` (a level per pick, a child per n), `tallyOf` (every order, by `everyOrder`, its count), `simulate`
  (seeded runs, more extend fewer), and the array operations: `everyRunOperation` (the tree a level at a time, then the
  leaves coloured by order and the tally: fair or not) and `manyRunsOperation` (1, 10, 100, 1000 runs per order). Frames
  say how much shows (`Frame.outcomes`: `level` or `runs`); not playing, the view shows all of it. `layout.ts`: the tree
  over its leaves, bars on a share scale (full height = 1.5 fair shares, capped) with the fair share dashed; six or
  fewer orders get a colour each. The tree for up to three values (`TREE_MAX`), the tally up to four (`TALLY_MAX`);
  `openOutcomes` puts one to the right (a tally with the same values takes the new seed), Esc takes it back.
- Amortised cost (lecture 7): Append 10 values (doubling or by one) shows each append's cost in a strip (from capacity 1
  doubling: 1 2 3 1 5 1 1 1 9 1, the aggregate 10 writes + 15 copies = 25) and sums it up; Append 10 values, 3 kr each
  (`appendAccounting`) is the accounting method: 2 kr saved per append as a badge on its cell (`Frame.badges`, drawn in
  array cells' corners), spent on the copies at each doubling, the bank in the play bar, never in debt.
- A fixed stack's pop leaves the value in its slot (lecture 6): drawn faded, as any value in a spare slot is, off the stack
  until a push overwrites it (the caption says so). List find and delete count the nodes they visit; deleting the last node
  of a doubly linked list with a tail jumps there and takes tail.prev (no walk), a singly linked one says it had to walk.
- Stacks and queues are a *kind* of array (`kind`, the Kind picker; `src/shapes/array/kinds.ts`): a stack
  stands upright (layout axis `'up'` in `getArrayMetrics`: index 0 at the origin, which rises as cells come,
  so index 0 stays put; use `metrics.axis` and `layout.boundaryAt`, never `props.direction`), a queue lies in a
  row; with a fixed capacity a queue is a circular buffer (`front`; `isUsed` / `usedIndices`, values may wrap).
  Built-in markers (top, front, rear: `arrayMarkers`, via `CellShapeUtil.markerPointers`, ids `@...`) are
  laid out with the pointers but can't be picked up. `stack-queue.ts`: push / pop / peek, enqueue / dequeue /
  peek as frames (overflow, underflow, wrap-around, a list-queue's shifting); on-canvas buttons
  (`renderKindButtons`). A `recorder` turns what
  each step lights into flash changes and stamps values, pointers, `dim` and `counts` on every frame.
  `rearrange.ts` has the instant orders (sorted, reversed, shuffled). Offered from the context menu
  (Step by step: searches, insert / delete, sorts, capacity; Array: the instant orders; Show: indices), plus
  hover controls (x on the hovered cell's corner, + on the nearest boundary; `hoveredCell` in `layout.ts`).
- `src/shapes/matrix/` - matrices (2D arrays): `values: string[][]`, cell keys `r,c`, row indices left and column
  indices above inside the box (`getMatrixLayout`). Sketch by dragging a rectangle (`MatrixShapeTool`, Shift+M);
  random fills are stable per cell as it grows (`shellIndex`: each k x k square takes the first k² values), sorted
  fills run row-major (so rows and columns are sorted). Grips `grow-cols` / `grow-rows`; a cell's menu inserts /
  deletes rows and columns (`moveMarks` keeps marks on their cells). Headers are editable cells too (`row:<r>` / `col:<c>`, props
  `rowLabels` / `colLabels`, '' = the index; e.g. addresses 0x0, 0x1): labelled rows widen the left strip (the shape
  moves via `layoutOffset`, so the cells stay put). A numbered label carries on in the unlabelled headers after it
  (`numbering.ts`, pure: 0x0 then 0x1, 0x2...; two typed in a row set the step), derived, not stored, so growing
  counts on; names move with their rows and columns, but when every header is numbered they number the places
  (`shiftLabels`), so an insert or delete keeps the addresses in order. `operations.ts`: row- vs column-major
  traversal with a "place in memory" strip, transpose (swaps across the diagonal), staircase search (sorted
  matrices); step pointers i / j sit at `row:<r>` / `col:<c>` (the index labels).
- `src/shapes/graph-view/` - a graph's adjacency matrix, adjacency lists or Kruskal's union-find as a separate shape
  (`graphId`, style `drawds:graph-view`), redrawn from the graph as it renders (`model.ts` is pure; rows, columns and
  lists in label order, as BFS / DFS visit neighbours). The union-find view draws `Frame.sets` (Kruskal's frames carry
  each node's parent and size, keyed by node, plus what to light) while Kruskal plays, else where Kruskal ends
  (`kruskalSets`); laid out from the widest arrangement with room for the deepest step, so it holds still. Kruskal opens
  one if the graph has none (`playOperation`'s `onCancel` takes it back on Esc). A graph's strips and play bar go under
  any view beside it (`bottomBeside`). The graph's marks and an operation's highlights map onto it
  (`viewHighlights`: a node to its row / column headers or list head, `edge:<id>` to its cells or list entries).
  Created from the graph's menu (`showGraphView`, to its right). The matrix reuses `MatrixSvg` with `rowLabels` /
  `colLabels` and `row:<r>` / `col:<c>` header tints. Lecture 9a: an edge-list view (`edges`: `edgeList`, a row per
  edge, sorted, the earlier label first when undirected; a node lights every cell naming it), and each view but the
  union-find under a heading of what it costs (`viewTitle`: V × V cells and how many are filled, V + 2E (directed V + E)
  list entries, E pairs, and the vertices on no edge that an edge list loses). `costs.ts`: what a change costs each
  representation, step by step (add a vertex: the matrix copied into a bigger one, V², the lists a head; remove one:
  (V - 1)², every list walked, V + E, the pairs scanned; remove an edge: 2 cells, the two ends' lists walked, O(deg u +
  deg v), not E; is u adjacent to v: 1 cell, u's list, the pairs); frames carry the graph (`props`, so the views draw
  the step's graph) and `Frame.views`, each view's own highlights for that step; counts per representation in the play
  bar. The graph's Step by step opens the matrix and lists for them (`playCosts`; Esc takes them back).
- `src/cells/clean-copy.ts` - Clean copy, last in every structure's own submenu (`NodeOperationsMenu` adds it): the
  same props (values, shape, seed) without marks or pointers, under the original past anything in the way
  (`freeTopBelow`, pure), selected, one undo step; followers stay with the original.
- `src/cells/followers.ts` - shapes that follow a structure (`graphId` on graph views, `structureId` on recursion trees
  and code boxes): `followersOf` is what the lesson log records and replays with an operation and what step export
  draws; the play bar goes under followers beside a structure, and its strips too if one is in their way, else they
  stay right under it (`besideBoxes`, used by `placementFor` in `src/controls/placement.ts`); they are deleted with it
  (`deleteFollowersWithTheirStructure`, an after-delete side effect registered in App's onMount).
- `src/shapes/recursion/` - recursion trees (dds-szw.13): a recursive operation's frames carry `calls` (`{ call:
  'sum(0, 3)' }` made by the call running, `{ returns: '9' }` by it), `calls.ts` (pure) replays them into a `CallRun`
  (each call's caller, result, the steps it opened and returned at), `callStates` per step (running red: the call
  returning now, else the newest open; waiting orange, with the edge up to its caller: the stack; returned blue) and a
  tidy layout of the whole run (`callTreeLayout`, text widths per font), so the tree holds still while it grows. The
  `recursion-tree` shape stores the run's calls and follows the playing operation whose calls match its own
  (`callsSignature`); else it shows the whole run, every result, and its heading counts calls and depth (held back
  while playing, so the class can guess). `openRecursionTree` (before `playOperation`, its take-back as `onCancel`)
  puts one to the structure's right unless one there already shows the same calls, so two runs can be compared side
  by side. Arrays: Sum: last value + sum of the rest (a stick n deep) and Sum by halves (`sumByRest` / `sumByHalves`,
  shown when every value is a number), counts calls, max depth and additions. Lecture 4: merge sort and quicksort feed
  it too (`callEvents` in operations.ts: each call shows the values it is handed and returns them sorted, `id` its
  range so equal values aren't repeats, `size` how many values it works on; quicksort's returns ride on the next step);
  calls with sizes get a "values" column right of the tree, each level's sizes added up and totalled (`levelSizes`:
  merge sort n per level, quicksort on sorted input n, n - 1, ...), and the last step sums up the levels. Binary
  search, recursive (`recursiveBinarySearch`, low / mid / high as lecture 4 names them) makes a chain, returning up it. Repeated calls (`repeatedCalls`: the
  same call already finished elsewhere, not an ancestor) are green and counted in the heading (fib's overlap).
- Recursion tracer (dds-szw.13.4, `recursion-tracer`, Shift+R, a click places it): a function traced on the call
  stack. Props `fn` (style `drawds:recursion-fn`: gcd, fact, fib, sum, hello = sayHello with no base case, stuck = a
  sum whose n never shrinks) and `call`, main's one editable cell (typing another function's name picks it; the
  picker types its example call; `onBeforeCreate` / `onBeforeUpdate` keep the two in step). `tracer.ts` is pure:
  `parseCall` (or why it can't be traced), `traceCall` frames whose props carry `trace` (the stack from main up, the
  code line, overflow, done) plus `calls` for the tree and `moves` `slot:<i>` with `flowing` values (a returned value
  drops into the frame below: `drawds-drop` keyframes). A frame that returns stays for its step and goes at the next.
  The never-ending ones overflow at `STACK_ROOM` frames (output strip for sayHello). `tracer-layout.ts`: sized for the
  whole run (a spare slot unless it overflows), main's slot kept still via `layoutOffset`; Java code under the stack,
  the step's line lit (base green, recursive orange, print blue). Its recursion tree opens only when calls branch
  (`branches`: fib); a chain is what the stack shows.
- `src/shapes/code/` - code boxes (dds-9h0; Shift+C, a click places one and opens it for typing): an algorithm in
  C / Java / Python (style `drawds:code-language`), syntax highlighted as students see code everywhere else.
  `highlight.ts` is a pure tokenizer over the whole code (so a comment or string over several lines colours each);
  token kinds map to theme colours in `CodeSvg`, the one component for canvas and export. The editor is a see-through
  textarea laid exactly over the drawn text (same mono font, size and line height, `layout.ts`), so the code
  highlights as it is typed; `editing.ts` (pure): Tab / Shift+Tab, Enter keeping the indent (one more after `{` or a
  Python `:`), `}` stepping out, each one range replaced via `execCommand('insertText')` so the browser's own undo
  keeps up. Esc or Cmd/Ctrl+Enter finish; an empty box goes; a new box's first edit goes on from its creation mark
  (`beginCellEdit`'s `markId`), so one undo removes it. Lines mark like cells (`L<i>`); Show > Line numbers. Pointers
  (pc, here) sit left of a line, stepped with the arrow keys: the layout makes room for them on the left (`left`,
  `pointerReachSideways`) and `layoutOffset` moves the shape so the code stays put. `convert.ts`: right-click a tldraw
  text box > Make a code box (its plain text, the language guessed from telltale signs by `guessLanguage`, pure).
  The running algorithm's code (dds-2tt.4): a code box can follow a structure (props `structureId`, `algorithm`;
  `follow.ts`). The play bar's </> button (shown when the operation has `code`) opens one to the structure's right or
  takes it away; while one is there, every operation with code shows its algorithm in it (`playOperation`'s `code`
  replaces the box's code, Esc puts the old back), the frame's `line` lit yellow with a pc arrow (room kept on the
  left whenever `algorithm` is set). Live values: a line tagged `$i` shows `i = 2` after it in violet (the pointers'
  colour) as the steps run; a value is the step's pointer of that name (at its element) or its `Frame.vars` (the
  array recorder's `r.let('maxval', v)`, kept for later steps; undefined: out of scope); `$min_idx=min` shows the
  step's `min` under the language's own name; room after those lines is kept in the layout (`after`), long values
  cut to fit. `algorithms.ts` (pure): each algorithm written per language with `@tag`s and `$tag`s at line ends,
  two spaces before (`parseCode`), `algorithmCode` (C falls back to Java for now), `taggedLine` / `shownValues`
  (find a tag's line in code edited since, by its text). Line counts (dds-szw.14, lecture 3's "times" column): Show >
  Times each line runs (prop `lineCounts`) puts a column at the right, `×n` per counted line, ticking up as the steps
  go: frames carry `runs` (cumulative, by tag), which the array recorder keeps (`r.counting(...tags)` from 0, then
  `r.ran(...tags)` for every line the code runs on its way to the next step: loop headers once per test, so one more
  than their body when the loop runs out; a line's count is its tags' sum). Counted so far: linear search, max,
  unique, insertion sort (lecture 3's: `key = a[i]`, worst case while n(n + 1)/2 - 1), selection and bubble sort;
  `src/shapes/array/line-counts.test.ts` pins the lecture's totals. Insertion sort's play bar counts comparisons of two
  values and, beside them, `while tests` (the test also runs when j > 0 stops it, comparing nothing: lectures 2-3's 54
  and 14 are the tests); its last step says why the two differ. Where a slide's count is off, drawds counts correctly. Picking another language swaps an unedited box to that language's version (`onBeforeUpdate`).
  The arrays' code is `src/shapes/array/code.ts` (searches, scans, every sort, shuffles, lecture 6's ArrayStack push / pop /
  peek for a fixed stack; Java and Python), the lists' `src/shapes/list/code.ts` (lecture 5's indexOf for find, on a plain
  list: curr shown by its node's value through `Frame.vars`, since a list pointer is at a node key).
- `src/shapes/hash/` - hash tables (node-link): `buckets: string[][]` (a chain per bucket, or one entry per slot with
  `TOMBSTONE` for deleted), strategy style `drawds:hash-strategy` chaining / probing (switching re-inserts the
  keys). Lecture 7: a hash code (`drawds:hash-code`: character codes added; the first three letters, A = 1, added, the
  class exercise KIM = 33; Java's String.hashCode, `javaHashCode`, 32-bit, misused / horsemints collide; direct
  addressing, the key is the index, the Bus Map) and a compression (`drawds:hash-compress`: mod m, floorMod for negative
  codes, or MAD `((a·h + b) mod p) mod m`, constants in `MAD`), props `code` / `compress`; the pure functions take a
  `HashScheme` (or just a strategy: sum, mod), `hashOf` says how each step was worked out. Direct addressing refuses
  what it can't place and says why (256 in a small table: the slots it would waste; X70: no index); switching to it
  sizes the table for the largest key (`withScheme`), and it has no compression to pick and nothing to rehash. `hash.ts` is pure: `hashOf` (k mod m, or character codes added; with how, for captions), `buildTable`,
  `misplaced` (keys a find wouldn't reach: the red ring), insert / find / delete / rehash as frames. Entries are
  keys or `key:value`; scene keys `b<i>` buckets, `k:<entry>` chained entries, `s<i>` slots, `#load`. Shift+B.
- `src/nodelink/playback.ts` - animated operations, stepped through: frames (props override, value swaps
  between node keys and one-way `moves` (copies), highlights on nodes and `edge:` keys that accumulate and can
  be cleared with null, badges, a queue/stack `strip`, faded elements `dim` and running `counts` (both
  replacing earlier ones; counts show in the play bar), a one-line `caption`) shown every STEP_MS, then the final update commits as one undo
  step; highlights fade (FADE_MS) or, with Shift, become marks. While an operation is open `PlayBar` sits
  under the structure (drawn by `PlaybackOverlay` in tldraw's InFrontOfTheCanvas, with the queue/stack strip,
  so neither lies outside the shape's box). It holds still: shapes report each step's extent
  (`playbackLayout(shape, frame)`: left edge, bottom), and the overlay places strips and bar once per
  operation (`view.frames`), from the leftmost edge and under the lowest point any step reaches; the bar's
  buttons come first in fixed places, the caption last and keys go to it first (window capture: Space, Left/Right and PageUp/PageDown (clickers), Enter /
  Shift+Enter, Esc cancels without changing anything). Once the result is committed the bar stays (`done`):
  step back through it or replay it, then Done / Enter / Esc, or select something else / edit the shape;
  `isBusy` says when the shape's own controls should hide. Once the result is in, a step with no props or scene of
  its own shows the structure as it was before (`committed.before`), the last step the result (`isLastFrame`). Operations open paused on step 1 so the teacher sets
  the pace; the bar's autoplay toggle (localStorage) plays them straight away instead, at the bar's speed
  (`SPEEDS` ½x-4x, localStorage; animations within a step use `animationMs` to fit while playing). Predict mode (the
  bar's ? toggle, localStorage `drawds:predict`): stepping by hand, each step is first a question in the caption's place
  (`Frame.ask`, else `DEFAULT_QUESTION`; `askFocus` elements pulse violet inside their outline: SceneSvg, ArraySvg and
  MatrixSvg `pulse`) over the step before, and the next press reveals it; `ask: false` (nothing to guess: the swap a
  step announced, a summing-up) shows straight away; back undoes one press at a time; playing goes straight through,
  and once the result is in nothing is asked. `stepFrom` / `shownFrame` are the pure position logic. `stateAt(frames, step)` is the pure accumulation. `displayScene` (frame or committed)
  feeds rendering and the selection outline (arrays: `displayShape`, which also sizes the geometry, so a step
  with an extra cell stays in the box). SceneSvg draws node shapes then values in two passes so a value
  in flight is never painted over. Any `CellShapeUtil` with `playbackLayout` can play operations; it may hand
  the overlay the step's own pointers to draw (arrays do: lo / mid / hi above the cells, -1 / n slots).
- `src/pointers/` - named pointers (i, curr, root...): `props.pointers` on every cell shape, `{id, name, at}`
  with `at` an element key (arrays allow -1 and n, lists `#null`). Pure model (`pointers.ts`) and layout
  (`layout.ts`: labels side by side or stacked, arrow onto the element); `CellShapeUtil` renders them
  (`renderPointers`, sliding via a CSS transition; `renderPointerOverlays` for drag / click-to-pick-up / arrow
  keys / rename prompt). Shapes implement `pointerAnchor` (box + side), `pointerStep`, `pointerNames`;
  node-link shapes get defaults. Added from the context menu's Pointer submenu.
- `src/shapes/heap/` - heaps stored as their array (`values`, index i's children 2i+1, 2i+2), drawn as the
  implicit complete tree (keys `"i"`) plus the array (keys `"a" + i`); marks keyed by index. `heap.ts` is pure
  (sift up/down with swaps + path, insert, removeAt, heapify, violations, `buildHeapSteps`: Floyd as frames, keyed
  by index; `inBothViews` lights tree and array). Heap menu: build heap step by step, shuffle values.
- `src/shapes/union-find/` - union-find (disjoint sets), node-link: `parent` (a root is its own parent), `sizes`,
  `ranks` (kept as the code keeps them, meaningful at roots), `labels`; styles `drawds:uf-union` size / rank / naive and
  `drawds:uf-compress` on / off (`src/ui/UnionFindPickers.tsx`). Drawn as a forest (`forestPositions`: n-ary tidy trees
  side by side, arrows up to the parent) centred over the parent array (index row, `parent`, then `size` / `rank`; the
  array starts at x = 0 and holds still). Keys: element `<i>`, parent pointer edge `e<i>` (marks `edge:e<i>`), cells
  `p<i>` / `w<i>`; an element's mark lights its parent cell. `union-find.ts` pure model, `operations.ts` frames: find
  (walk up with `curr`, then compression re-points arrows in a `scene` frame where the nodes are, then tidies) and
  union (both finds, then link by size / rank / naively, or refuse: one set already, Kruskal's cycle). Element menu: Find,
  Union with... (prompt: a name or index); actions: Random unions, reset. Type a parent into its cell (a loop is refused;
  sizes and ranks recounted). Shift+U.
- `src/shapes/tree/bst.ts` - BST as a *kind* of binary tree (`drawds:tree-kind` style): in-order key placement,
  insert (path), delete (leaf / one child / two children: the successor node moves up, relinked as lecture 8b does, no key
  copied: 3.1 the successor is the right child, 3.2 it is deeper and its right subtree takes its place), violation check
  with ancestor bounds. Lecture 8: `measure.ts` (height with a leaf 0 or 1, count the leaves, size: post-order recursion
  from a node, the call stack as a strip, each node's answer badged as its call returns, the caption forming the sum or
  max; the code checks for null so a node with one child works), `search.ts`'s `bstExtreme` (min / max: hops counted)
  and `bstBuild` (the tree's keys inserted again sorted, a stick, or shuffled; BST Step by step, `shapeOperations`). The
  traversals, measures and min / max have code beside the tree (`src/shapes/tree/code.ts`; traversals in lecture 8's
  three-line form).
  `search.ts`: search as frames (curr walks down, each ruled-out subtree fades via `dim`). Invariant checks:
  BSTs and heaps ring offending elements in dashed red (`sceneWarnings` -> SceneSvg `warnings`, toggled by the
  `drawds:invariant` style, `src/cells/invariant-style.ts`; hidden while an operation is open).
- `src/shapes/tree/` - binary trees: nodes with `children: [left, right]` slots (null = empty), root first; layouts
  (trees and heaps) put the root at x = 0, so a tree that widens grows both ways and its root holds still on the page
  (the layout offset moves the shape), during an operation's steps too;
  `generate.ts` (random shapes by depth + fullness, growth-stable: existence depends only on seed + path, ids
  are `n` + path), `layout.ts` (contour-based tidy layout; a lone child offset `lone`, well under half the
  sibling spacing, so parentage stays unambiguous), `model.ts` (add child, remove subtree, swap children,
  mirror a subtree: plain trees' node menu, one undo step each).
- `src/shapes/graph/` - graphs: nodes at free positions in cell units (so the size style scales the drawing), edges
  `{from, to, weight}` (weights always stored; shown when the `drawds:graph-weights` style says so; direction and
  A/0 labels are styles too, see `src/ui/GraphPickers.tsx`). `generate.ts` is the sketch: a node drops every
  GRAPH_SPACING along the drag, node k joins its nearest earlier node (connected) plus maybe two more nearby,
  skipping crossings, near misses and narrow angles (planar-ish); growth-stable like trees. Sketch options
  (styles `drawds:graph-density` sparse = a tree / medium / dense, `-parts` one piece or runs of the drag, `-order`
  any or DAG along the drag) feed `generateGraph`, and `withSketchOptions` rewires a selected graph. `model.ts` pure edits;
  `connect.ts` the connect grip (a 'create' handle `connect:<id>` on each node's right rim; drag state in a
  per-editor atom; drop on a node = edge, in empty space = new node + edge). `algorithms.ts`: Dijkstra (distance
  badges, best edge green), Prim, Kruskal, topological sort (Kahn) as frames, reusing traverse.ts's `Recorder`
  (an edge only looked at flashes, then gets its colour back); unweighted graphs count every edge 1. `components`:
  connected components as lecture 9 counts them (a loop, pointer v, over the vertices: one visited already is skipped,
  else dfs(v) marks its whole component, coloured and numbered, and count += 1). BFS and DFS show lecture 9's visited[]
  (`visitedStrip`: booleans by vertex, a strip whose boxes have `labels`, marked on entry for DFS, when queued for BFS)
  beside the queue or call stack, and their code (`src/shapes/graph/code.ts`, with v and w; components too).
  `paths.ts` (lecture 9): a path from s to t with the fewest edges (`shortestPath`: BFS, distance badges, parent[]
  beside visited[], stopping when t is discovered, then x walks back the parents, lighting the path; a node's "Path
  from A to" asks for t) and Is there a cycle? (`findCycle`, Task 18: DFS from each unvisited vertex, s the loop's;
  undirected, a visited neighbour other than the parent closes one; directed, a neighbour still on the call stack, one
  that is done not; the cycle lit red; none: a forest, or a DAG), each with its code. Density `complete` (lecture 9a's
  fully connected): every pair joined, nodes round a circle so no edge runs through one (`completeGraph`; rewiring to it
  moves them there, node 0 kept). Show > degrees (prop `degrees`): badges, directed in/out (`degrees` in model.ts),
  drawn by `NodeLinkShapeUtil.sceneBadges` while no operation is open.
- `src/controls/` - on-canvas controls shown while a structure is the only selected shape
  (`showsStructureControls`): grow grips (tldraw `create` handles `grow` / `grow-start`, drawn only on hover,
  plus our own '+' `GrowGrip`; `grownCount` is pure) and `ControlButton` (HTML insert '+' / remove 'x',
  since handles can't be clicked). New values come from `extendValues` in `src/data/fill.ts` (end or start).
- `src/data/` - seeded RNG (`mulberry32`) and fill generators (`fillValues`, `extendValues`, `insertValue`, each
  taking a `range`: 0-2, 0-9, 0-99, 0-999, -50..50; sorted runs from 0-2 grow by 0 or 1, kept in range);
  `fill-style.ts` has the `drawds:fill` and `drawds:fill-range` StyleProps (every filled shape stores `range`) plus `refillSelectedShapes`. `newSeed` is short (1-9999, to note
  down). `seed.ts`: a pinned seed (localStorage `drawds:seed`) that `createDragTool` gives every new sketch instead
  (`seedForSketch`), so the same length draws the same values; set from the style panel's Seed row
  (`src/ui/SeedPicker.tsx`: with a tool out, type one; one structure selected, its seed read-only and the lock pins it).
- `src/export/` - an operation's steps as images (`exportSteps`: the play bar's download button, and in dev
  `window.drawdsSteps` / the driver's `steps`): puts the result in first, then for each step `showStep` + tldraw's
  `toImage` over one area (the union of every step, optionally grown to an `aspect`), named `01-caption-words.png`.
  While exporting (`whileExportingSteps`), shapes' `toSvg` draw the step as the canvas shows it (`exportingStep`) plus
  `StepExtrasSvg`: the step's pointers, strips and a wrapped caption under it (`captions: false` leaves it out); a
  graph's views draw it too. A new structure's `toSvg` must do the same. `saveStepImages`: Chrome's directory picker,
  else downloads. `.claude/skills/run-drawds/deck.py` turns exported steps into a 16:9 .pptx (Google Slides imports it).
- `src/lesson/` - the lesson log: every operation played (not replays) is recorded through `recordOperations`
  (playback.ts) into the board's document meta (`drawdsLesson`, history-ignored, so undo never drops a record and it is
  saved with the board): the shape and its views as they were, the frames, the result, the outcome, and when each step
  was shown. `replayEntry` puts the recorded records back in place (migrated from the schema they were saved with,
  history-ignored; `drawdsReplay` keeps the current ones to put back on close, or on the next mount after a reload) and
  plays it with `replay: true` (not recorded; its commit stays out of undo). `exportLesson` replays and exports each in
  order; `lessonManifest` is the lesson.json beside the images (captions, times shown) to line up with a transcript.
  Main menu > Lesson log… (`LessonDialog`); dev `window.drawdsLesson`, driver `lesson`.
- `src/files/` - boards as files: Open board... / Save board / Save board as... first in the main menu (Ctrl+O / Ctrl+S /
  Ctrl+Shift+S), tldraw's `.tldr` JSON (`serializeTldrawJsonBlob` / `parseTldrawJsonFile`, so our shape migrations
  run on open). Chrome's File System Access pickers where present (Save then writes back to the picked file: handles
  are keyed by `document.meta.drawdsFile`, so undoing an Open never saves the old board over the file just opened),
  else a download and a file input. Opening is one undo step (its toast offers Undo); the board takes its file's
  name (`names.ts`, pure) and the tab title follows it. While typing on the board tldraw's shortcuts are off, so
  `BoardFileKeys` (a child of `<Tldraw>`, inside its UI) catches Ctrl+S / Ctrl+O there. e2e stubs the pickers
  (`e2e/board-files.e2e.ts`).
- `src/ui/` - toolbar/shortcuts/context menu (`overrides.tsx`), style panel Fill picker, icons. tldraw's UI
  inherits the page font: `drawds.css` sets the system sans-serif and 13px menus.

## Conventions & Patterns

- Render shapes as SVG via one component shared by `component()` and `toSvg()` so export matches the canvas.
- Everything a shape draws must start at its origin and lie inside its geometry bounds: tldraw places the shape's
  box at the origin, sized to the bounds, and content outside it leaves ghosts when the camera moves (dds-55z.29).
  Node-link scenes are moved there automatically (`getScene` is the moved layout; models and `getGrowGrips` use
  layout coordinates; handles convert with `layoutOffset(initial)`); arrays make room in `getArrayMetrics().origin`.
  When the offset changes, `CellShapeUtil.onBeforeUpdate` moves the shape so nothing shifts on the page. While an
  operation is open, node-link steps can draw more than the shape (a rehash, a heap's new level, a list node off the
  line): `withPlaybackRoom` puts the union of every step's extent in `meta.drawdsRoom` (playback.ts `ROOM_KEY`; set on
  open, cleared with null around the commit and on close, always history-ignored), the layout counts it and the
  geometry gets two internal corner points, so the box holds every step and still. Caches keyed by props must also
  key on the meta / layout offset (layouts, placed pointers, the bar's placement; tldraw's own indicator cache is per
  props, so `getIndicatorPath` reads the live record). `clearStaleRooms` (App onMount).
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
- Colour-blind cues (`src/cells/cues.ts`, `CueBadge.tsx`; main menu toggle, localStorage `drawds:colour-cues`, off by
  default): every mark and highlight colour also gets a shape (red triangle, orange diamond, green square, blue
  circle) as a badge in an element's top-left corner (on a circle's rim), and marked or highlighted edges a line
  pattern (`cueDash`: green solid, red dashes, orange dots, blue dash-dot, the plain edge underneath). Shapes stand for
  the colour, not a meaning. Utils read `showsColourCues()` in `component` / `toSvg` and pass `cues` to SceneSvg,
  ArraySvg and MatrixSvg; a new renderer of marks or highlights must draw them too. The Mark menu shows the glyphs.
- Random fills are distinct (`random`, `letters`; sorted modes strictly monotone) until the pool runs out;
  growth and insertion skip values already present. `repeats` keeps duplicates.
- Child slots: implement `getEmptySlots` + `addChildAt`; the base draws a + on the hovered node's lower-left /
  lower-right corner per empty slot and opens the new child for editing.
- Animated operations: implement `removeNodeAnimated` and/or `getInsertPrompt` + `insertKey`, build frames and
  call `playOperation`; compare keys with `compareKeys` (numeric when both are numbers). Give every frame a
  `caption` saying why (the teacher may pause on it), and end with a frame showing why it stopped. Where predict
  mode's default question is weak, give a frame an `ask` worded so it doesn't give the answer away: the same question
  whichever way the step goes (BFS / DFS "A–B: is B new?", BST "30 vs 21: which way?", hashing "which bucket does
  h(22) give?", binary search "found it, or which half?", sorts "swap them or not?", recursion "which call comes
  next?", list code "which line comes next?"); array operations pass `ask` / `askFocus` to the recorder's `step`.
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
  append, print, print backwards, Floyd's cycle detection), narrated as the code a teacher writes. Once the result is in, steps are
  drawn less the move the commit made (`PlaybackView.committed`), so a new head doesn't shift them or the bar.
- A plain list (not circular, no sentinel, no cycle: `canBeEmpty`) can be empty, as lecture 5 starts: head and tail point
  at null. Deleting its only node empties it (tail = null too); empty, its menu offers Insert at the head and Append
  (`shapeOperations`), both making the new node head and tail; the grips still grow it.
- Lecture 5's size and invariants (`src/shapes/list/size.ts`, every kind of list): Show > the size field (prop
  `showSize`, a `#size` box named `#size-label` before the head label, above it on a vertical list; derived from the
  node count, toggling it keeps the head where it was), and every operation that adds or removes a node ends with a
  step of its own doing size++ / size-- (`withSizeStep` in `play`, after `endTidied`: earlier steps show the old size).
  Count the nodes walks curr to null, O(n), against reading the field, O(1) (`list-count` code); Check the invariants
  steps through the lecture's slide (size 0: head and tail null; size > 0: both at nodes; size 1: head == tail; the
  last node's next null; doubly, head.prev null), each O(1) (a cycle breaks the last). With a tail, the two bugs the
  lecture names are shown and not kept (`forgetTail` on `insertIntoList` / `deleteFromList`): the first insert setting
  head but not tail, the only node deleted with tail left on it. drawds derives head, tail and size from the nodes,
  so between operations the invariants always hold.
- List variants (`src/ui/ListPickers.tsx`, four combinable toggles): `links` singly / doubly (a `pointer.back`
  prev compartment, `<-` edges with `fromPointer: 'prev'` in parallel `lane`s), `tail` (a `#tail` label),
  `ends` null / circular, `sentinel` (a dashed `#sentinel` ghost node first in `chainKeys`), plus `cycleTo`
  (the last node's next points at that node: "Make a cycle" in a node's menu). Arrows back along the list get
  rounded `via` corners from `loopBack` (operations pass the nodes they float off the line). Every operation
  narrates the assignments its variant needs; `listOf(props)` and `retarget(scene, {edgeKey: to})` help.
  Operations that change the list end on it tidied (`endTidied`: the result's layout shifted by `anchorShift`),
  so nothing moves on commit or Done; a closing remark that changes nothing moves onto that step.
- Linked stacks and queues are a *kind* of list (`kind`, the Kind picker): a stack's head label reads top, a
  queue always has a tail (rear) and its head is the front (`listVariant(...).names`); circular, sentinel and
  cycles are for plain lists. They may be empty (the labels point at a `#null` where the first node goes).
  `stack-queue.ts`: push / pop / peek, enqueue / dequeue / peek as frames (`shapeOperations`, so they work on an
  empty one), plus on-canvas buttons via the `renderStructureControls` hook; no x / + on their nodes or arrows.
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
