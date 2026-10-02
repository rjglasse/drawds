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
| `export [name]` | export all shapes the way tldraw does (`editor.getSvgString`), write `.svg`, render it to `.png` |
| `reset` | delete every shape, back to the select tool |
| `wait <ms>` | sleep |
| `errors` | console errors, page errors and HTTP >= 400 seen so far (should be `[]`) |

## Run (human path)

```bash
npm run dev -- --port 5179 --strictPort   # open http://localhost:5179; Ctrl-C to stop
```

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
  `[data-testid="context-menu.mark-green"]`.
- **Tree controls**: `hover <id>` then `[data-testid="add-child-<id>-left|right"]`
  (only for empty slots) or `[data-testid="remove-node-<id>"]` (never on the
  root `n`). Node ids are paths: `n`, `nL`, `nR`, `nLR`... Null children:
  `[data-testid="style.nulls.show"]` with a tree selected.
- **Graphs**: `shapes` lists graph edges as `A-B:7` (`A->B:7` when directed; `:7` is the
  weight, stored even when unweighted). Options with the graph tool or a graph selected:
  `[data-testid="style.graph-direction.directed"]`, `style.graph-weights.weighted`,
  `style.graph-labels.numbers`. Edge x: `hover <from> <to>` then
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
  The step-by-step toggle (`play-step-mode`) is remembered in localStorage: operations then
  open paused on step 1.
- **Graph traversals**: `rclick` a node, then `[data-testid="context-menu.graph-bfs"]` or
  `graph-dfs`. **Tree / heap traversals**: `rclick` a node, `clicksel
  [data-testid="context-menu-sub.drawds-node-operations-0-button"]` (Traverse from ...), then
  `context-menu.tree-in-order` (`tree-pre-order`, `tree-post-order`, `tree-level-order`; `heap-...`
  on heaps). Strips (call stack or queue, then the output) are each a
  `[data-testid="playback-strip"]`; pick one by its title text.
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
