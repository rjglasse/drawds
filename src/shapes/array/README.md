# Arrays, stacks and queues

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

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
- Loop invariants (lecture 4, dds-szw.7): `Frame.band` `{ from, to, label }` puts a labelled bracket under array cells
  (right of a column), laid out by the array's `playbackLayout` (`band`, below the indices; strips go under it) and drawn
  in front of the canvas and in exported steps (`src/controls/BandSvg.tsx`). `sumWithInvariant`: lecture 4's sum with a
  while loop, total from nums[0], the band "total = 4 + 6 + 5 = 15" over the part done at the beginning, after each
  pass and at the end. A step's pointers drawn in front of the canvas keep their labels apart (`placePointers`'s
  `apart`: an overlapping label goes up a row).
- `src/shapes/array/scans.ts` - lectures 2-3's counted scans (Levitin's MaxElement, UniqueElements, SequentialSearch2):
  find the largest (`maxval` in a strip, n - 1 comparisons, updates counted), all unique? (every pair i < j, n(n - 1)/2
  at worst, a repeat stops it red), sentinel search (the key in an extra cell past the end, no i < n check, counts the
  checks saved). Lecture 3's faster unique checks: a set (`allUniqueBySet`: every value added to a `seen` strip, a
  repeat adding nothing, then size vs length once, as the lecture writes it) and sorting first (`allUniqueBySorting`: a
  copy `b` as the second row, sorted with its values sliding within it, `moves` `aux:<i>` -> `aux:<k>`; `AuxRow.marks`
  light its cells; merge sort's comparisons stand for the sort, then neighbours until a repeat, set against every pair's
  n(n - 1)/2). Scans in the Step by step menu's `scan` group; sentinel search with the searches, from a cell.
- `src/shapes/array/passes.ts` - lectures 2 and 3's sorts a pass at a time (Sorts > "a row per pass", selection and
  insertion): each outer pass one step, its row added under the array (a strip, `Strip.marks` colouring the sorted part
  green and what moved orange; the title what the pass cost), ending on the series written out and its closed form
  (selection 4 + 3 + 2 + 1 = n(n − 1)/2 on any input; insertion's while tests 2 + 3 + … + n = n(n + 1)/2 − 1 at worst, as
  lecture 3 counts them). The counts are the step-by-step sorts' (its test checks).
- `src/shapes/array/shuffles.ts` - lecture 2's shuffles step by step (`shuffle` group), named as its slides name them
  (the random index is the pointer `n`): the unfair shuffle (n from the whole array for every i) and Fisher-Yates (i
  from len - 1 down to 1, n from 0..i, placed values green); a pick then a swap per i, picks from the pinned seed if
  any (`seedForSketch`), the last step saying why (len^len runs against len! orders). `everyRun` (pure) lists every
  run of picks and the order it leaves: on [1, 2, 3] the unfair one's 27 runs come out 5/5/5/4/4/4, Fisher-Yates' 6
  once each.
- `src/shapes/array/merge.ts` - two sorted arrays merged (dds-55z.20.10, the list merge's counterpart): Sorts > Merge with
  the sorted array [..] for each other plain growing array in a row on the page, both sorted. merge(a, b): c a new array
  of n + m (a's second row, `AuxRow.drop` under b if b is in the way, `gap` for k above it), the smaller of a[i] and
  b[j] copied (a's on a tie), then the rest; b stays where it is, lit through `Frame.others` and pointed into with
  `otherKey(b, j)` (the step's pointers anchor on its cells, `stepAnchor`; its values slide from there into c,
  `crossSlides`' `fromOther`). Nothing changes; the result is a new array where the row was (`onCommit`, one undo
  step), a and b as they were: arrays copy, lists re-point.
- `src/shapes/array/counting.ts` - counting sort (dds-55z.20.8.6, Sorts > Counting sort, CLRS's, stable): count[] a strip
  under the array (labelled 0..k), one pass counting, prefix sums (count[v] = how many are ≤ v), then from the right
  each value to out[--count[v]] (the second row, `aux:<i>` moves), a = out; comparisons stay 0. Small whole numbers
  only (0..`COUNT_MAX` = 15), else one step saying why. Its code (`counting-sort`) was run in Python, Java and C.
- Amortised cost (lecture 7): Append 10 values (doubling or by one) shows each append's cost in a strip (from capacity 1
  doubling: 1 2 3 1 5 1 1 1 9 1, the aggregate 10 writes + 15 copies = 25) and sums it up; Append 10 values, 3 kr each
  (`appendAccounting`) is the accounting method: 2 kr saved per append as a badge on its cell (`Frame.badges`, drawn in
  array cells' corners), spent on the copies at each doubling, the bank in the play bar, never in debt.
- `src/shapes/array/stack-uses.ts` - what a stack is for (dds-55z.33), in a stack's Step by step, each asking for its
  input (the prompt's `promptValue`, an example filled in and selected, and `promptWidth`): are the brackets balanced?
  (an opener pushed, a closer pops the latest opener, which must be its kind; a closer with the stack empty, a pair that
  doesn't match, or openers left: unbalanced; other characters passed over) and a postfix expression's value (a number
  pushed, an operator pops b, then a, and pushes a op b, dividing toward 0; too few or too many operands, division by
  zero; the value written the usual way with only the brackets it needs). Each runs on a new, empty stack with the drawn
  one's room (a fixed one overflows: lecture 6's hand of five fingers), the input a strip (the token read orange, pairs
  and tokens done green, faults red), counting how deep it went; nothing changes. Code `stack-balanced` /
  `stack-postfix` on a growing stack (Java's ArrayDeque, a Python list, C an array as deep as the input) and `-fixed`
  (ArrayStack(CAPACITY); C checks before each push), made by `stackUses` in code.ts; run in python3, javac and cc against
  the steps' outcomes.
- A fixed stack's pop leaves the value in its slot (lecture 6): drawn faded, as any value in a spare slot is, off the stack
  until a push overwrites it (the caption says so). List find and delete count the nodes they visit; deleting the last node
  of a doubly linked list with a tail jumps there and takes tail.prev (no walk), a singly linked one says it had to walk.
- Stacks and queues are a *kind* of array (`kind`, the Kind picker; `src/shapes/array/kinds.ts`): a stack
  stands upright (layout axis `'up'` in `getArrayMetrics`: index 0 at the origin, which rises as cells come,
  so index 0 stays put; use `metrics.axis` and `layout.boundaryAt`, never `props.direction`; a step's cells and its
  pointers are laid out with the shape's own metrics, `stepAnchor`, so top follows a step with fewer cells; index -1, an
  empty stack's top, lies under the size / capacity footer), a queue lies in a
  row; with a fixed capacity a queue is a circular buffer (`front`; `isUsed` / `usedIndices`, values may wrap).
  Built-in markers (top, front, rear: `arrayMarkers`, via `CellShapeUtil.markerPointers`, ids `@...`) are
  laid out with the pointers but can't be picked up. `stack-queue.ts`: push / pop / peek, enqueue / dequeue /
  peek as frames (overflow, underflow, wrap-around, a list-queue's shifting); on-canvas buttons
  (`renderKindButtons`). A `recorder` turns what
  each step lights into flash changes and stamps values, pointers, `dim` and `counts` on every frame.
  `rearrange.ts` has the instant orders (sorted, reversed, shuffled). Offered from the context menu
  (Step by step: searches, insert / delete, sorts, capacity; Array: the instant orders; Show: indices), plus
  hover controls (x on the hovered cell's corner, + on the nearest boundary; `hoveredCell` in `layout.ts`).
