---
name: run-drawds
description: Build, run, and drive drawds (the tldraw data-structure sketching app). Use when asked to start or run drawds, open its dev server, sketch arrays, lists, trees, heaps or graphs on the canvas, edit cells, take a screenshot of the UI, export the canvas to SVG/PNG, run its tests, or check a UI change works in the real app.
---

drawds is a Vite + React + tldraw web app. Agents drive it with
`.claude/skills/run-drawds/driver.mjs`: a headless-Chrome command runner
(Playwright core + your installed Google Chrome) that reads one command per
line from stdin, starts the Vite dev server itself if it isn't running, and
reads app state through `window.editor` (exposed in dev builds by
`src/App.tsx`). All paths below are relative to the repo root.

Verified on macOS (Darwin 25, Node 26.8, npm 12, Google Chrome installed).
Not yet tried on Linux: there the driver falls back to `CHROME_PATH` or
Playwright's bundled Chromium (untested).

## Setup

```bash
npm install
```

## Run (agent path)

Pipe commands to the driver. It prints each command, then its JSON result,
and exits 1 at the first failure. It stops any dev server it started.

```bash
node .claude/skills/run-drawds/driver.mjs <<'EOF'
nav
array 300 200 5 right
array 900 200 3 left
array 300 700 4 up
dblclick 300 200
state
type 42
key Tab
type 7
key Enter
shapes
screenshot edited
export arrays
errors
EOF
```

`state` after the double-click should show
`"path":"select.editing_shape"` and `"focused":"Cell 0"`. `shapes` then shows
the first array starting `["42","7",...]`. Screenshots and exports land in
`$TMPDIR/run-drawds/` (printed as absolute paths; override with `OUT=dir`).
**Open the PNGs and look at them.**

Mid-gesture checks use the low-level mouse commands, for example Esc while
sketching:

```bash
node .claude/skills/run-drawds/driver.mjs <<'EOF'
nav
key Shift+A
move 600 400
down
move 800 400
eval editor.getCurrentPageShapes().length
key Escape
up
eval editor.getCurrentPageShapes().length
EOF
```

Linked lists: sketch, edit a node, drag a node by its handle, then Re-layout
from the context menu, and switch the selected list's Fill to ascending:

```bash
node .claude/skills/run-drawds/driver.mjs <<'EOF'
nav
list 200 150 4 right
dblclick 188 150
type 42
key Enter
dragnode n1 30 140
screenshot dragged
rclick 200 150
clicksel [data-testid="context-menu.drawds.relayout"]
clicksel [data-testid="style.fill-mode"]
clicksel [data-testid="style.fill-mode.ascending"]
shapes
errors
EOF
```

After `dragnode`, `shapes` marks moved nodes with `*` (e.g. `"41*"`). After
Re-layout the marks are gone. After the fill change the values are the same
numbers sorted, and `fill` is `"ascending"`.

| command | what it does |
|---|---|
| `nav [url]` | open the app (default `http://localhost:5179`), wait for the canvas and `window.editor` |
| `array x y n [right\|left\|up\|down]` | Shift+A, then drag so an `n`-cell array appears with its first cell centred on (x, y). Assumes size style M (48 px cells). Prints `shapes`. |
| `list x y n [right\|left\|up\|down]` | Shift+N, then drag so an `n`-node linked list appears with its head node centred on (x, y). Size M: nodes are 115.2 px apart. Prints `shapes`. |
| `hover <key> [key2]` | move the pointer to a node of the only selected node-link shape, or half-way between two (on the arrow joining them); needed before clicking an x or + |
| `tree x y depth [lean]` | Shift+T, then drag down so a tree of `depth` levels appears with its root centred on (x, y); `lean` -1 (bare stick) .. 0 (random) .. 1 (perfect). Trees are random per sketch: for scripted edits start from `tree x y 1` (a lone root) and add children |
| `heap x y n` | Shift+P, then drag right so a heap of `n` values (inserted one per 48 px) appears with its root centred on (x, y). Tree node keys are `"0"`, `"1"`...; array cells `"a0"`, `"a1"`... |
| `graph x y n [cols]` | Shift+G, then drag a serpentine path (rows of `cols` nodes, default 3; `cols` = n is a line) so `n` nodes drop 110.4 px apart (size M), the first centred on (x, y). Moves at hand speed (one 8 px step per frame), so it takes a second or two. Node ids `v0`, `v1`...; edges vary per sketch (random seed) |
| `connect <id> <id2>` / `connect <id> x y` | drag a graph node's connect grip onto another node (new edge) or to page point (x, y) (new node + edge) |
| `dragnode <key> dx dy` | drag a handle of the **only selected** shape: a list or tree node (`n0`, `nL`, ...), an array cell (`cell:0`, ... - dropping on another cell swaps them), the end grip `grow` (arrays, lists) or a list's head grip `grow-start` |
| `drag x1 y1 x2 y2 [steps]` | press, move in `steps` (default 20), release |
| `move x y` / `down` / `up` | low-level mouse, for checks in the middle of a gesture |
| `click x y` / `dblclick x y` / `rclick x y` | mouse clicks (double-click a cell to edit it; right-click opens the context menu) |
| `clicksel <css>` | click the first match, e.g. `[data-testid="style.fill-mode"]` (tldraw menus have `data-testid`s) , a list node's x `[data-testid="remove-node-n1"]`, or the + on a node's next arrow `[data-testid="insert-on-n1->"]` |
| `key <combo>` / `type <text>` | Playwright key names: `Shift+A`, `Tab`, `Escape`, `Enter`, `ControlOrMeta+z` |
| `shapes` | id, type, x, y, and for arrays/lists direction, fill and values (`*` = node dragged off its layout) |
| `state` | tool path (`select.idle`, `array.sketching`, `select.editing_shape`...), editing shape, selection, focused element |
| `eval <js>` | evaluate an expression with `editor` (the tldraw Editor) in scope; prints the JSON result |
| `screenshot [name] [x y w h]` | full-page PNG, or just that clip; run the driver with `SCALE=3` in the environment for a 3x crop of small controls |
| `shot [name] [pad]` | just the drawing: a PNG clipped to every shape on the page, plus the play bar, strips and step pointers while an operation is open, `pad` px around (default 16); deselects and moves the pointer away first. `SCALE=2` for crisp README / slide images |
| `export [name]` | export all shapes the way tldraw does (`editor.getSvgString`), write `.svg`, render it to `.png` |
| `reset` | delete every shape, back to the select tool |
| `steps [name] [key=value...]` | every step of the open operation as numbered images into `$OUT/<name>/` plus `steps.json` (file, header, caption): `format=png\|svg`, `scale=2`, `aspect=1.7778`, `captions=off`, `background=off`. Puts the result in first, as the play bar's export does |
| `lesson [name] [key=value...]` | every operation in the board's lesson log, replayed as it was and exported: `$OUT/<name>/01-1042-insert-key/01-caption.png`..., plus `lesson.json` (each operation's times, each step's caption, file and when it was shown live). Options as for `steps`. The board is left as it was |
| `wait <ms>` | sleep |
| `errors` | console errors, page errors and HTTP >= 400 seen so far (should be `[]`) |

## Run (human path)

```bash
npm run dev -- --port 5179 --strictPort   # open http://localhost:5179; Ctrl-C to stop
```

## Notes after a live session

Everything played on a board is in its lesson log (Main menu > Lesson log…: replay or save any of it). After class,
`lesson <name>` exports it all with `lesson.json`, whose `shownAt` times line up each step with a transcript of the
session; every operation's folder has a `steps.json`, so `deck.py --section "Title|Line|<folder>"` makes slides of it.

## Slides from steps

Export each operation with `steps <name> captions=off background=off`, then build a 16:9 deck (title slide, a
heading per section, one slide per step: image, caption as editable text, notes) with python-pptx:

```bash
python3 .claude/skills/run-drawds/deck.py ~/Downloads/deck.pptx --title "Title" \
  --section "Inserting into a BST|One line about it|$TMPDIR/run-drawds/<name>"
```

Google Slides takes the .pptx as an upload (Drive converts it). The Drive connector can't carry an image-heavy
file (its upload goes inside the tool call), so hand the .pptx over rather than uploading it from here.

## Test

```bash
npm test            # vitest: pure layout/cell/geometry/fill/graph logic
npm run test:e2e    # Playwright suite in e2e/; starts or reuses the dev server on 5179
npm run typecheck
npm run build       # warns that the bundle is > 500 kB; that's tldraw and expected
```

The e2e suite is the regression net for gestures, editing, dragging, the Fill
picker and migrations; add a `*.e2e.ts` next to the others for new tools
(helpers in `e2e/helpers.ts`). The driver is for poking and screenshots.

In e2e, open context menus with `rightClick(page, [x, y])`, never
`page.mouse.click(..., { button: 'right' })`. A closing menu or popover hands
focus back (to the canvas, or the button that opened it) in a timer after it
unmounts; Playwright's quick key presses and clicks can hold that timer back
until a new context menu is open, which then loses focus and closes at once.
`rightClick` waits for `menusClosed(page)` first (no `.tlui-menu` /
`.tlui-popover__content` left, then a frame and two timer turns), so no fixed
sleeps are needed. To wait for pointers to finish sliding, use
`transitionsDone(page)`.

To exercise internals without the app, import the pure modules in a vitest
file (e.g. `src/nodelink/geometry.ts`, `src/shapes/list/layout.ts`) and run
`npx vitest run src/nodelink`.

## Gotchas

- **Screen px == page px only on a fresh page.** Each driver run is a new
  browser context (empty IndexedDB, camera at the origin, 100% zoom), so
  pointer coordinates are canvas coordinates. Pan or zoom first and the
  `array` helper's arithmetic is off.
- **The array tool is `Shift+A`, not `A`** (`A` is tldraw's arrow tool).
  After a sketch the tool returns to select, so press `Shift+A` again for the
  next one (the `array` command does this). Esc in the middle of a sketch
  cancels it but leaves the array tool active; a second Esc returns to select.
- **Don't read shapes from the DOM.** `.tl-shape` elements aren't in creation
  order. Use `shapes` / `eval` (via `window.editor`). `window.editor` exists
  only in dev, so the driver can't drive a production build (`vite preview`):
  `nav` times out.
- **List values sit left of the node centre.** A list node is
  `[value | next]`, so at size M the value is 12 px left of the node's centre
  (`dblclick 188 150` for a head at x=200). Node drag handles sit on the
  middle of each node's bottom edge, and only show while the list is the
  only selected shape: `dragnode` errors if nothing is selected.
- **Growing: `dragnode grow dx dy`** on a selected array or list adds an
  element per cell (48 px) or list step (115.2 px) dragged past the end,
  rounding at half a step; dragging back removes them (minimum 1). The grip
  is a `create` handle, so tldraw only draws its dot on hover; our '+' glyph
  is drawn by the shape. Random fills append the next draws of the shape's
  seed, so `fillValues('random', seed, n)` predicts the grown values; with
  values 0-99, repeats are normal (about 1 in 100 per neighbouring pair).
- **BST / heap operations animate, then commit.** Insert: `clicksel
  [data-testid="insert-key"]`, `type 50`, `key Enter` (Shift+Enter keeps the
  highlights as marks). Delete: `hover <id>`, `clicksel
  [data-testid="remove-node-<id>"]`. The props only change after the last
  frame (about 420 ms per comparison or swap), so `wait 3000` before reading
  them; highlights fade ~2.2 s after the commit. BST kind:
  `[data-testid="style.tree-kind.bst"]` (with the tree tool or a tree
  selected); heap type: `[data-testid="style.heap-type.max"]`.
- **Marking**: `move x y` onto a cell / node (or `hover <id>`), then `key 1`..`key 4`
  (red, orange, green, blue) or `key 0` to clear; read back with
  `eval editor.getOnlySelectedShape().props.marks`. Digits never switch tools
  (`enableToolbarKeyboardShortcuts` is off). Context menu: `rclick x y`,
  `clicksel [data-testid="context-menu-sub.drawds-mark-button"]`, then
  `[data-testid="context-menu.mark-green"]`. Colour-blind cues (a shape per colour): `clicksel
  [data-testid="main-menu.button"]`, `clicksel [role="menuitemcheckbox"]` (the only checkbox at the top
  level; no test id), `key Escape`; or `eval localStorage.setItem('drawds:colour-cues','on')` then `nav`.
  Badges have `data-cue="<colour>"`.
- **Tree controls**: `hover <id>` then `[data-testid="add-child-<id>-left|right"]`
  (only for empty slots) or `[data-testid="remove-node-<id>"]` (never on the
  root `n`). Node ids are paths: `n`, `nL`, `nR`, `nLR`... Null children:
  `[data-testid="style.nulls.show"]` with a tree selected. A plain tree's node menu has
  `context-menu.tree-swap-children` and `tree-mirror` under `context-menu-sub.drawds-tree-actions-button`. BSTs and heaps ring rule-breaking values
  (`[data-warning]` in the DOM); `style.invariant.off` / `.check` toggles it.
- **Matrix**: `key Shift+M` then `drag x1 y1 x2 y2` (a row / column per 48 px); cell keys `r,c`
  (`dblclick` a cell to edit). Grips: `dragnode grow-cols dx 0`, `dragnode grow-rows 0 dy`. A cell's
  menu: `context-menu-sub.drawds-matrix-steps-button` (`matrix-row-major`, `matrix-col-major`,
  `matrix-transpose-steps` when square, `matrix-staircase` when sorted: opens `key-prompt`),
  `drawds-matrix-actions` (`matrix-row-above|below`, `matrix-col-left|right`, `matrix-delete-row|col`,
  `matrix-transpose`, `matrix-reroll`, `matrix-clear-labels` once a header is labelled). `dblclick` a row index
  (left) or column index (above) to label it (input `Cell row:<r>` / `Cell col:<c>`; Tab runs down / along the headers);
  props `rowLabels`, `colLabels` (typed ones only: `0x0` alone shows 0x0, 0x1, 0x2... down the rows); drawn as
  `[data-row-index]` / `[data-col-index]` text.
- **Graph views**: `rclick` a graph node, `context-menu-sub.drawds-graph-show-button`, then
  `context-menu.graph-show-matrix`, `graph-show-lists`, `graph-show-edges` (edge list) or `graph-show-union-find`
  (undirected): a `graph-view` shape appears to the graph's right (past any views it has; Kruskal opens the union-find
  one itself) and follows it (marks and BFS / DFS highlights too); its heading `[data-testid="graph-view-title"]`
  counts V, E and the cells. With a view selected, `style.graph-view.matrix|lists|edges`. Also in Show:
  `context-menu.graph-degrees` (degree badges; prop `degrees`).
- **Union-find**: `key Shift+U` then `drag x y x+dx y` (an element per 48 px, at least 2, element 0 under the press),
  each in a set of its own. Keys: element `<i>`, parent cell `p<i>`, size / rank cell `w<i>`, parent arrow `e<i>`. Right-click
  an element: `context-menu-sub.drawds-uf-steps-button` (`uf-find`, `uf-union`: then `key-prompt` takes a name or index),
  `drawds-uf-actions` (`uf-random`, `uf-reset`). Styles `style.uf-union.size|rank|naive`, `style.uf-compress.on|off`.
  Set a forest directly: `eval` an `updateShape` with `parent`, `sizes`, `ranks`.
- **Hash table**: `key Shift+B` then `drag x y x y+dy` (a bucket per 48 px, at least 3), filled to a
  load of about 0.6. `style.hash-strategy.chaining|probing`. Insert: `clicksel [data-testid="insert-key"]`,
  `type 22`, `key Enter`. A key's x deletes it (`hover k:22` or `hover s3`, then `remove-node-<key>`); its
  menu `context-menu-sub.drawds-hash-steps-button` has `hash-find`, `hash-delete`, and (anywhere)
  `hash-find-key` (prompt), `hash-rehash`; `drawds-hash-actions` has `hash-reroll`.
- **Value range**: `style.fill-range.few` (0-2), `small` (0-9), `medium`, `large` (0-999), `signed` (-50..50)
  under Fill, for arrays, lists, trees and heaps; redraws the selected values.
- **Seed**: the style panel's `[data-testid="seed-input"]` (with a structure tool out: `clicksel` it, `type 42`,
  `key Enter` pins 42 for every new sketch; with one structure selected it shows that one's seed, read-only) and the
  lock `seed-pin` (`data-pinned` when pinned; pins the shown seed or unpins). `seed-pinned-note` / `seed-unpin` when
  the selected structure has another seed. The pin is localStorage `drawds:seed`, so it outlasts `nav`: unpin
  (`eval localStorage.removeItem('drawds:seed')`) before relying on random values. New seeds are 1-9999.
- **Graphs**: `shapes` lists graph edges as `A-B:7` (`A->B:7` when directed; `:7` is the
  weight, stored even when unweighted). Options with the graph tool or a graph selected:
  `[data-testid="style.graph-direction.directed"]`, `style.graph-weights.weighted`,
  `style.graph-labels.numbers`, sketch options `style.graph-density.sparse|medium|dense|complete`,
  `style.graph-parts.connected|components` and (directed) `style.graph-order.any|dag`, which also
  rewire a selected graph. Edge x: `hover <from> <to>` then
  `[data-testid="remove-edge-<edge id>"]` (no edge buttons while a node is hovered).
  Marking an edge: `hover <from> <to>`, `key 3`; marks are keyed `edge:<edge id>`. The + grip
  (`dragnode grow dx dy`) places a lone node. After `connect` to empty space (or to a node on a
  weighted graph) the new label / weight opens for typing about 30 ms later: `wait 100` before
  `type`. Don't press Esc to leave it if nothing opened: Esc in idle deselects the graph. Clicks
  inside a selected graph's box but off its nodes/edges drag the whole graph (tldraw), and a
  double-click there makes a text shape.
- **Operations open a play bar** under the structure (`[data-testid="play-bar"]`): while it
  is open, `key Space` pauses / plays, `key ArrowRight` / `key ArrowLeft` step, `key Enter`
  finishes and closes (`Shift+Enter` keeps the highlights as marks), `key Escape` cancels
  (nothing changes). When an operation reaches its end the result is committed and the bar
  stays (`[data-testid="play-done"]` appears; `play-forward` is disabled): step back, `Space`
  replays, `Enter` / `Escape` / `play-done` close it, as does selecting another shape. Read `[data-testid="play-caption"]` and `[data-testid="play-counter"]` ("3/7").
  Operations open **paused on step 1** (`key Enter` to finish at once, `key Space` to play):
  the autoplay toggle (`play-autoplay`, remembered in localStorage) plays them straight away; `play-speed`
  cycles 1x, 2x, 4x, ½x (localStorage `drawds:speed`). An operation with code (an array's searches, scans and sorts)
  has `play-code` (</>): a code box to the structure's right shows the algorithm, the step's line lit
  (`[data-step-line]` gives its index) with a pc arrow (`[data-pointer="pc"]`); pressed again, it goes. Later
  operations on that structure show their code in it. An array's Step by step is in categories: `context-menu-sub.drawds-array-steps-basics-button` (searches, insert /
  delete, scans, sums, capacity), `-sorts-button`, `-shuffles-button`; open the category before clicking an item (a
  stack's or queue's items stay directly in Step by step). Shuffles (`context-menu.array-unfair-shuffle`,
  `array-fisher-yates`; pointers i and n) and their outcomes in a view beside the array
  (`[data-testid="shuffle-outcomes"]` with `data-kind` / `data-mode`): `array-unfair-every-run`,
  `array-fisher-yates-every-run` (tree, up to 3 values; nodes `[data-node-depth]`), `array-unfair-many`,
  `array-fisher-yates-many` (tally, up to 4 values; bars `[data-order][data-count]` in `[data-testid="shuffle-tally"]`). Values show after their lines (`[data-value-line]`: `i = 2`);
  right-click the box (no operation open), `context-menu-sub.drawds-code-show-button`, `context-menu.code-line-counts`
  for the times column (`[data-count-line]`: `×5`). Its language: `eval` an `updateShape` with
  `props: { language: 'python' }` (the style panel's picker needs the box selected, which closes the bar).
- **Graph traversals**: `rclick` a node, `clicksel [data-testid="context-menu-sub.drawds-graph-steps-button"]`,
  then `context-menu.graph-bfs` or `graph-dfs`; `graph-path` (opens `key-prompt`: the target's label; parent[]
  strip, then walked back) and `graph-cycle` (anywhere). Each view's cost (opens the matrix and lists): a node's
  `graph-remove-vertex-costs`, `graph-has-edge-costs` (prompt), the graph's `graph-add-vertex-costs`, and right-click
  an edge for `graph-remove-edge-costs`. **Tree / heap traversals**: `rclick` a node, `clicksel
  [data-testid="context-menu-sub.drawds-tree-steps-button"]` (`drawds-heap-steps` on heaps), then
  `context-menu.tree-in-order` (`tree-pre-order`, `tree-post-order`, `tree-level-order`; `heap-...`
  on heaps). Strips (call stack or queue, then the output) are each a
  `[data-testid="playback-strip"]`; pick one by its title text.
- **List operations**: `rclick` a list node, `clicksel
  [data-testid="context-menu-sub.drawds-list-steps-button"]` (Step by step), then
  `context-menu.list-find`, `list-find-value` (opens `key-prompt`), `list-insert-after`,
  `list-insert-head`, `list-delete`, `list-reverse`, `list-middle`, `list-insert-sorted` (opens `key-prompt`),
  `list-append`, `list-print`, `list-floyd` (cycle detection) or (doubly) `list-print-back`. Step with `key ArrowRight` (they open
  paused); a reversed list is drawn the other way (`direction` flips) with nodes in place. Anywhere on a list (any kind):
  `list-count`, `list-invariants`, and with a tail `list-insert-forget-tail` (empty) / `list-delete-forget-tail` (one
  node); `context-menu-sub.drawds-list-show-button` > `context-menu.list-size-field` (prop `showSize`; a size++ /
  size-- step ends every insert and delete).
- **List variants**: with a list selected, `clicksel [data-testid="style.list-variant.doubly"]` (`tail`,
  `circular`, `sentinel`) toggles each (one undo step each), or set props directly: `eval (() => { const s =
  editor.getOnlySelectedShape(); editor.updateShape({ id: s.id, type: s.type, props: { links: 'doubly', tail:
  'tail', ends: 'circular', sentinel: 'sentinel' } }); return 1 })()` (wrap calls that return the editor, or
  `eval` fails on circular JSON). A node's menu has `context-menu.list-make-cycle` (under
  `context-menu-sub.drawds-list-actions-button`, "Linked list") and, with a cycle, `list-remove-cycle`. Edge keys: `n1->` next, `n1<-` prev, `#head->`, `#tail->`.
- **Linked stack / queue**: `clicksel [data-testid="style.list-kind.stack"]` (`queue`, `list`). Buttons while it
  is selected: `stack-push`, `stack-pop`, `queue-enqueue`, `queue-dequeue` (each opens a play bar); or `rclick`,
  `context-menu-sub.drawds-list-steps-button`, then `context-menu.list-push` (`list-push-value`,
  `list-pop`, `list-peek`, `list-enqueue`, `list-enqueue-value`, `list-dequeue`). They can be popped to empty.
- **Graph algorithms**: `rclick` a node, `context-menu-sub.drawds-graph-steps-button`, then
  `context-menu.graph-dijkstra`, (undirected) `graph-prim` and `graph-kruskal`, or (directed)
  `graph-topological-sort`. Distances / in-degrees are node badges; `play-counts` shows updates or
  total weight. Weights count only with `style.graph-weights.weighted` (else every edge is 1).
- **BST search / build heap**: `rclick` a BST node, `context-menu-sub.drawds-tree-steps-button`, then
  `context-menu.bst-search` or `bst-search-value` (opens `key-prompt`). Heaps: `rclick` the heap,
  `context-menu-sub.drawds-heap-steps-button` then `heap-build`, or `drawds-heap-actions` then `heap-shuffle`.
- **Context menus** have one layout on every structure: `context-menu-sub.drawds-<array|matrix|list|tree|heap|hash|graph>-steps-button`
  (Step by step: animated), `-actions-` (named after the structure: instant changes), `-show-` (views, indices),
  then the shared `drawds-mark` and `drawds-pointer`; each only when it has items. Every structure's `-actions-` submenu ends with
  `context-menu.clean-copy` (a copy underneath without marks or pointers, selected). The style panel's
  `[data-testid="structure-hint"]` opens "What can I do?" (`structure-hint-content`) for the selected structure.
- **Array operations**: `rclick` a cell, `clicksel` a submenu (stable ids):
  `[data-testid="context-menu-sub.drawds-array-steps-button"]`, then a category: `-steps-basics-button` (items
  `context-menu.array-binary-search`, `array-binary-search-value` (opens `key-prompt`), `array-linear-search`,
  `array-linear-search-value`, `array-sentinel-search` / `-value`, `array-insert`, `array-delete`, the scans
  `array-find-max` (a `maxval` strip) and `array-all-unique`, and when every value is a number `array-sum-rest`,
  `array-sum-halves`: these open a `recursion-tree` shape to the array's right, `[data-testid="recursion-tree"]`, each
  call a `[data-call="sum(0, 3)"]` group), `-steps-sorts-button` (`array-insertion-sort`, `array-selection-sort`,
  `array-bubble-sort`, `array-merge-sort`, `array-partition`, `array-hoare-partition`, `array-partition-3way`,
  `array-quicksort`, `array-quicksort-random` (pointer `k`), `array-quicksort-median`, `array-quicksort-3way` (pointers
  `lt`, `i`, `gt`), `array-quicksort-cutoff` (opens `key-prompt`: the cut-off), `array-sort-growth` ("Counts as n grows:"
  the sort last played; a `[data-testid="sort-growth"]` table to the right, `data-rows` = rows shown, cells
  `[data-count]`, `[data-growth]`)) or
  `-steps-shuffles-button`; `drawds-array-actions`
  (instant: `array-sort`, `array-sort-descending`, `array-shuffle`, `array-reverse`, `array-reroll`) or
  `drawds-array-show` (`array-indices`). The step's pointers (lo, mid, hi, i, j, min) are drawn in front of the canvas:
  `[data-pointer="lo"]`; running totals are `[data-testid="play-counts"]` ("comparisons 3 · swaps 1").
  Fixed capacity: `[data-testid="style.array-sizing.fixed"]` with the array selected (the grip then adds
  blank spare slots; `[data-testid="array-capacity"]` reads "size 3 · capacity 6"); props `sizing`, `used`.
  In `drawds-array-steps` too: `array-append`, `array-grow`, `array-append-many-double`,
  `array-append-many-plus-one`; a step's new array is `[data-testid="array-aux"]`.
  Stacks and queues: `key Shift+A`, `clicksel [data-testid="style.array-kind.stack"]` (or `.queue`), then
  `array x y n up` (a stack grows up from the press point; index 0 at the bottom). Props `kind`, `front` (a
  fixed queue's circular-buffer front). Markers `[data-pointer="top"]`, `front`, `rear`. Menu
  `drawds-array-steps`: `array-push`, `array-push-value`, `array-pop`, `array-peek` (a queue: `array-enqueue`,
  `array-enqueue-value`, `array-dequeue`, `array-peek`); buttons `stack-push`, `stack-pop`,
  `queue-enqueue`, `queue-dequeue` while selected.
  Set known values first with `eval (editor.updateShape({id: editor.getOnlySelectedShape().id, type: 'array',
  props: {values: ['3','8','15']}}), 1)` (wrap in `(..., 1)`: the update returns something unserialisable).
  Hover controls: `move` onto a cell, then `[data-testid="remove-cell-<k>"]` (x on its top-right corner) or
  `insert-cell-<b>` (+ on the nearest boundary b, its lower end; none past the end); an inserted cell opens
  for typing.
- **Recursion tracer**: `key Shift+R`, `click x y` (main's frame, left end, at the press; the stack above, the code
  below). Function picker `style.recursion-fn.gcd|fact|fib|sum|hello|stuck` (with the tool or a tracer selected);
  or `dblclick` main's call (right part of the bottom frame) and `type fib(6)`. `rclick` it,
  `context-menu-sub.drawds-tracer-steps-button`, `context-menu.tracer-run`. Frames are `[data-frame="fact(2)"]`
  (`data-state` red / orange / green / plain), the lit code line `[data-lit]` (`data-line` base / recursive / print),
  a value dropping down `[data-flowing]`, overflow `[data-testid="tracer-stack"][data-overflow]`. fib opens a
  `recursion-tree` beside it; chains (gcd, fact, sum, sayHello) don't.
- **Code box**: `key Shift+C`, `click x y` (the first line starts at the click) opens it for typing (`state`:
  focused "Code"); `type`, `key Enter` (keeps the indentation), `key Tab` / `Shift+Tab`, `key Escape` finishes.
  The driver's `type` squashes runs of spaces. Language `style.code-language.c|java|python` (with the tool or a box
  selected). Drawn tokens: `[data-testid="code-box"] tspan[data-kind=keyword|type|constant|string|number|comment|meta]`;
  the editor `[data-testid="code-editor"]`. Marks keyed `L<i>` (point at a line, `key 3`); `rclick`,
  `context-menu-sub.drawds-code-show-button`, `context-menu.code-line-numbers`. The tool sits under the toolbar's ^.
  Pointer at a line: `rclick` it, `context-menu-sub.drawds-pointer-button`, `context-menu.pointer-pc`; `clicksel
  [data-testid="pointer-pc"]`, `key ArrowDown`. A tldraw text box (`key t`, `click`, `type`): `rclick` it,
  `context-menu.make-code-box`. Typing fast into tldraw's own text box can scramble it: in e2e, create the text shape.
- **Pointers**: `rclick` an element, `clicksel [data-testid="context-menu-sub.drawds-pointer-button"]`,
  then `[data-testid="context-menu.pointer-i"]` (names depend on the structure; `pointer-custom`
  opens a name prompt, `key-prompt`). **Wait ~400 ms between context menus**: a menu that is
  still closing swallows the next right-click. A pointer's label is `[data-testid="pointer-<name>"]`
  (only while its shape is selected): click it to pick it up, then arrow keys step it, `Delete`
  removes, `Enter` renames, `Escape` puts it down; or drag it onto another element. Pointers slide
  for 280 ms: `wait 400` before a screenshot. Read them with
  `eval editor.getOnlySelectedShape().props.pointers`.
- **Exports fetch tldraw's fonts from its CDN** to embed them, so export tests take 5-20 s
  depending on the network; a timeout there is usually latency, not a hang.
- **tldraw coalesces pointer moves**: Playwright's `mouse.move(..., { steps })` sends them faster
  than a frame, so path-following tools (graphs) see corners cut. `graph` and the e2e
  `sketchGraph` helper move one step per frame.
- **x / + buttons only exist near the pointer** (mouse) and only while the
  list is the only selected shape: `hover n1` before `clicksel
  [data-testid="remove-node-n1"]`, `hover n1 n2` before
  `[data-testid="insert-on-n1->"]`, `hover n2 #null` for the tail's arrow.
- **List x / + buttons and the head grip** only exist while the list is the
  only selected shape (`remove-node-<id>`, `insert-on-<id>->` test ids; no x
  on the last node). Clicking a + leaves the new node in edit mode
  (`state` shows `"focused":"Cell n<k>"`): `type` replaces the generated
  value, `key Enter` / `key Escape` keeps it.
  Removing or prepending keeps the first surviving original node at the same
  page position, so check positions with `eval` + `getShapePageTransform`,
  not the shape's `x`.
- **Changing Fill on a selected shape regenerates its values** from its
  stored seed (typed values are replaced; one undo restores them).
- **Shape props are persisted**, so a props change without a migration
  breaks existing drawings in a human's browser. Driver runs start empty and
  won't show it. Check with `npm run test:e2e` (`e2e/migration.e2e.ts` loads
  an old-format snapshot via `editor.loadSnapshot`). Schema sequence ids are
  `com.tldraw.shape.array` / `com.tldraw.shape.linked-list`.
- **Double-click editing focus.** Editing starts on the second press of a
  double-click, and the browser's mousedown default then moves focus to
  tldraw's container. `CellShapeUtil` cancels that one mousedown. If it
  regresses, `state` after `dblclick` shows `"focused":"tldraw"` instead of
  `"Cell N"`, and typed letters fire tldraw shortcuts (`h` switches to the
  hand tool, `d` to draw), which can wreck the drawing.
- **tldraw handles keys on its container, before React's bubble handlers.**
  Inputs inside shapes must handle keys in the capture phase and call
  `editor.markEventAsHandled(e)`, or Esc/Enter reach tldraw first.
- **Custom toolbar icon renders as a solid square.** tldraw puts string icon
  URLs in an unquoted CSS `url()`, and Vite inlines small SVGs as data URIs
  containing quotes, so the mask is dropped. Use `maskIcon()` in
  `src/ui/overrides.tsx`.
- **Exported SVGs are about 800 kB** because tldraw embeds the font. That's
  normal.
- Screenshots show a "Get a license for production" badge. That's the tldraw
  SDK in dev, and it's expected.

## Troubleshooting

- **`npm error code EEXIST ... EACCES: permission denied, mkdir '~/.npm/_cacache/...'`**:
  files in `~/.npm` owned by root (an old `sudo npm install`). Fix once with
  `sudo chown -R "$(whoami)":staff ~/.npm`. Until then,
  `npm install --cache <some writable dir>` works.
- **`chromium-cli: command not found`** (the generic `/run` recipe): not
  installed here. Use this driver instead; it needs no browser download when
  Google Chrome is installed.
- **`errors` reports `Failed to load resource: ... 404`**: the response
  listener records the failing URL alongside it. The one hit so far was
  `/favicon.ico`, fixed by `public/favicon.svg` and the `<link rel="icon">`
  in `index.html`.
