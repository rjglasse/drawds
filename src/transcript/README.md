# The code beside a structure

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/transcript/` - the code beside a structure (dds-2tt, every structure: arrays, stacks and queues, linked lists, binary trees, graphs, heaps, hash tables, matrices, union-find): every move kept as code. Each
  kind says what its log follows and how a change reads as moves (`Tracked` in `log.ts`): an array's values in use; a
  list's nodes by id (`list-moves.ts`: set / insertAtHead / append / insert / remove / reverse / cycle, exact as nodes
  have ids; a later node holding a value an earlier one holds goes by its place, remove_at), written with drawds' own list
  methods (insert_at_head, insert_after, remove) and node_at(i); a tree's nodes by their paths from the root
  (`tree-moves.ts`: set / add / remove / swap / mirror, each checked by making it with the tree's own edits in
  `model.ts`), as a `Tree` with `root` and `Node(8, Node(3), None)`, a BST's nodes holding `key`; a call's parameters
  told from what it did (`args`: the key put in, the node taken out: t.insert(5), t.delete(t.root.left)); a graph's
  vertices by their labels (`graph-moves.ts`: vertices and edges in and out, a vertex taking its edges, labels typed,
  weights; where nodes are drawn logs nothing; a rewire or a switch of labels builds it again), as `Graph` / `DiGraph`
  with add_edge (weights while it shows them), directed and weighted read as it is drawn; a heap's array and type
  (`heap-moves.ts`: a value typed, `a.heap[4] = 0`, no sifting; the values Floyd's heapify gives as build_heap(); else a
  new heap), as a `MinHeap` / `MaxHeap` made from its array as it is, its operations calls to the heap's own code (insert
  / extract_min / remove_at / build_heap, the value or index told from what it did); min to max logs a new MaxHeap of the
  same values, then build_heap(), its shuffle `random.shuffle(a.heap)` and what came out; a hash table's keys bucket by
  bucket and its scheme (`hash-moves.ts`), as a `ChainingHashTable` / `ProbingHashTable` of m buckets with its keys put
  in, in an order checked to give that very table (`tableOf`: chains and probes depend on order; one no order gives, a
  deleted marker or a key typed into the wrong bucket, is laid out bucket by bucket), a comment naming index(key) when it
  isn't plain mod m, a key typed over or away at its place in its chain (`a.table[1].next.key = 29`) or slot, insert /
  remove / rehash calls to the table's own code (past the 31 buckets drawds draws, the table it made instead); the style
  panel puts the scheme and the rebuilt table in in one change, so another scheme is one new table; a matrix's values
  (`matrix-moves.ts`: a value typed, rows / columns added at the end by a grip or put in, taken off or out, transposed;
  labels log nothing), Python a list of rows (`for row, v in zip(a, [5, 6]): row.append(v)`), Java an int[][] made anew
  when its shape changes (`a = insertCol(a, 2, new int[]{...})`, as drawds' matrix model names them), C a matrix type;
  union-find's arrays and kind (`union-find-moves.ts`), as a `UnionFind(n)` whose `by` and `compress` fields say how
  union and find work, `make_set()`, a parent typed with the roots' size / rank it recounts (the code reads only roots),
  union(a, b) and find(i) by index as the operation says (`playOperation`'s `args`: a union can't be told from its
  result), names in a comment; drawds counts sizes under every union rule, the code only by size, so a switch back to
  size after unions by rank or naively writes the sizes drawds kept; stacks and queues by what they are: growing ones are
  lists (`s.append(5)`, `del q[0]`), fixed-capacity ones lecture 6's ArrayStack / ArrayQueue (`Fixed` in
  `array-moves.ts`, `diffArray`: push / pop, enqueue / dequeue with the front moving on, a value typed at its place in
  the buffer; a buffer whose front has moved on is laid out as it is), linked ones a LinkedStack (top first, as drawn) /
  LinkedQueue (`ListKind`, push / pop / enqueue / dequeue moves); their calls are those moves; named s and q (`named`).
  Typing straight into what a +
  just put in folds into that insert (a connect grip's new vertex: its label into its addVertex and edges). `log.ts`: a store
  side effect (`startCodeLog`, App onMount) keeps language-neutral moves (`array-moves.ts`: new / set / append / insert
  / pop / delete / swap / sort / reverse / shuffle / assign / call) in the shape's meta (`drawdsCode`), inside the same
  change, so undo, redo and board files carry them; a change bringing its own log (undo, redo, a load) passes through.
  Moves come from a diff of the values in use (`diffValues`, pure), or from what our code says it did (`withMoves`:
  rearrange's sort / reverse / shuffle, and playback's commit, a call to the operation's algorithm with the diff kept as
  its effect). Runs rewrite their own lines: typing in one cell, the creating drag, a grip dragged (ended on pointer up).
  `render.ts` writes a log out: Python a list, Java a List (ArrayList), C a list type (`append(&a, 7)`, items / size);
  a call from its algorithm's own signature in that language (a, n, lo, hi filled in), else its effect under a comment.
  The view is a code box with `transcript` on, following the structure: its text is worked out as it is drawn
  (`CodeShapeUtil.shown`), it can't be edited, and the play bar's algorithm box never takes it over (`codeBoxesOf`).
  Long code beside a structure folds (dds-2tt.11, prop `fold`, on by default): past `FOLD_LINES` (16) rows a transcript
  shows its first line (where the structure is made), a "⋯ n lines" row and its latest lines; an algorithm's code (as
  drawds wrote it) folds the longest runs of lines no step reaches (no @ or $ tag: a helper like `matches` or `apply`),
  so the lit line never hides and the box holds still (`foldsFor`, pure, in `layout.ts`; the layout maps lines to rows,
  `hidden(i)`, `folds`). Code typed into a box of its own never folds; editing an algorithm's box unfolds it (out of
  undo). Show > All n lines (k folded) / Fold it to 16 lines; Copy the code copies every line; export draws it as seen.
  Show > Code beside it (`toggleTranscript`). The Python of 200 random array logs, 400 list logs (many repeated values)
  300 tree logs, 300 graph logs, 300 heap logs, 400 hash table logs (against classes made of their own Python code;
  every scheme, deleted markers, keys typed anywhere), 300 matrix logs and 400 union-find logs (against the code's own
  union and find per kind), run, rebuilt their structures. The code box goes right of the structure, past its grips,
  else further right or under it, whichever is nearer (`putBeside`, `spotBeside` pure, `src/cells/beside.ts`). Stacks and queues: 400 array logs and 300
  linked ones against lecture 6's code, run, rebuilt. A drag of a 40-node graph's node costs the log ~2-3 µs a change.
  The board's code as one runnable Python script (dds-2tt.10, `script.ts`; main menu > Download the board's code, dev
  `window.drawdsScript`): every structure's code in turn (`renderLog`, the board's names kept apart), after the classes
  and functions it calls, made of drawds' own Python (`algorithmCode`'s methods in a class with a hand-written
  `__init__` / `__repr__`; one `Node` for lists, trees and hash chains, a class per hash scheme via `renderHashLog`'s
  `classOf`, union-find dispatching on `by` / `compress`), only what the board uses, then each structure printed; a
  shuffle puts back the order the board got. Java and C aren't made runnable. `script.test.ts` runs every kind through
  python3 (skipped without it); a code box's actions > Copy the code copies its text as drawn.
  Track with code (dds-2tt.5, main menu: a toggle and Code language), the board's setting in its document meta
  (`mode.ts`: `drawdsCode` {on, language}), so a reload and a board file keep it. It is out of undo, as the lesson
  log is (an undo puts back the whole document record), and what it does to boxes is an undo step of its own. On
  (`trackWithCode`): a box beside every structure on the board without one; off takes every one away. While on, a
  new structure gets its box when its drag ends, in the undo step that drew it (`startTrackingWithCode`: an
  after-create handler queues it, a tick waits out the sketch). Not when it can redo (an undo brought the structure
  back), nor a replay's (an operation open), nor a board loaded (side effects off). Code language (`codeIn`): every
  transcript, and every algorithm box beside a structure still as drawds wrote it, switches; new boxes start in it
  (`codeLanguage`: the board's, else the style panel's last).
