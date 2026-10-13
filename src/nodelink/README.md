# Node-link structures and playback

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/nodelink/` - node-link structures (lists, trees, heaps, graphs). Decision (dds-55z.15.1): ONE
  shape per structure, props hold the model. A subclass of `NodeLinkShapeUtil` turns props into a `Scene`
  (positioned nodes + edges, shape space) and applies model edits; the base does geometry, `SceneSvg`
  rendering/export, value editing via `sceneCells`, and node dragging via tldraw handles (bottom edge of each
  node). `geometry.ts` is the pure edge routing (clipping, curved twins, self-loops, arrowheads).
- `src/nodelink/playback.ts` - animated operations, stepped through: frames (props override, value swaps
  between node keys and one-way `moves` (copies), highlights on nodes and `edge:` keys that accumulate and can
  be cleared with null, badges, a queue/stack `strip`, faded elements `dim` and running `counts` (both
  replacing earlier ones; counts show in the play bar), `others` (highlights on other shapes' cells, drawn by them via
  `otherMarks`, exported with the steps), a one-line `caption`) shown every STEP_MS, then the final update commits as one undo
  step; highlights fade (FADE_MS) or, with Shift, become marks. While an operation is open `PlayBar` sits
  under the structure (drawn by `PlaybackOverlay` in tldraw's InFrontOfTheCanvas, with the queue/stack strip,
  so neither lies outside the shape's box). It holds still: shapes report each step's extent
  (`playbackLayout(shape, frame)`: left edge, bottom), and the overlay places strips and bar once per
  operation (`view.frames`), from the leftmost edge and under the lowest point any step reaches; the bar's
  buttons come first in fixed places, the caption last and keys go to it first (window capture: Space, Left/Right and PageUp/PageDown (clickers), Enter /
  Shift+Enter, Esc cancels without changing anything: `onCancel` undoes to before what the operation set up, a view or
  recursion tree it opened, the code it showed, and `keepingWhatWasAdded` puts back what the teacher added meanwhile, a
  code box from </>, a pen stroke, as an undo step of its own). An operation whose steps draw another shape too (a list
  merged in) names it in `covers` (hidden meanwhile, `isCovered`) and changes it in `onCommit` (the result's undo
  step); a shape `onCommit` makes and returns (the array a merge fills) is covered while a step before the last
  shows, so stepping back or the bar's replay draw the steps, not it. Once the result is committed the bar stays (`done`):
  step back through it or replay it, then Done / Enter / Esc, or select something else / edit the shape;
  `isBusy` says when the shape's own controls should hide. Once the result is in, a step with no props or scene of
  its own shows the structure as it was before (`committed.before`), the last step the result (`isLastFrame`). Operations open paused on step 1 so the teacher sets
  the pace; the bar's autoplay toggle (localStorage) plays them straight away instead, at the bar's speed
  (`SPEEDS` ½x-4x, localStorage; animations within a step use `animationMs` to fit while playing). The bar is two rows:
  its buttons (ending with A− / A+), then the running counts and the caption as one paragraph at the caption size
  (`src/controls/caption-size.ts`: 13-36 px, localStorage `drawds:caption-size`, so a class can read it and later
  bars keep it), wrapping at about 60 characters (32em) or the room the bar has; step exports keep their own. Predict mode (the
  bar's ? toggle, localStorage `drawds:predict`): stepping by hand, each step is first a question in the caption's place
  (`Frame.ask`, else `DEFAULT_QUESTION`; `askFocus` elements pulse violet inside their outline: SceneSvg, ArraySvg and
  MatrixSvg `pulse`) over the step before, and the next press reveals it; `ask: false` (nothing to guess: the swap a
  step announced, a summing-up) shows straight away; back undoes one press at a time; playing goes straight through,
  and once the result is in nothing is asked. `stepFrom` / `shownFrame` are the pure position logic. `stateAt(frames, step)` is the pure accumulation. `displayScene` (frame or committed)
  feeds rendering and the selection outline (arrays: `displayShape`, which also sizes the geometry, so a step
  with an extra cell stays in the box). SceneSvg draws node shapes then values in two passes so a value
  in flight is never painted over. Any `CellShapeUtil` with `playbackLayout` can play operations; it may hand
  the overlay the step's own pointers to draw (arrays do: lo / mid / hi above the cells, -1 / n slots).
