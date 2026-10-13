# Code boxes

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/code/` - code boxes (dds-9h0; Shift+C, a click places one and opens it for typing): an algorithm in
  C / Java / Python (style `drawds:code-language`), syntax highlighted as students see code everywhere else.
  Languages (dds-c72.12): `languages.ts` is what each spells its own way (comment, statement end, none, booleans,
  and / or, braces or a colon), and `highlight.ts`'s RULES its tokens, both records over every CodeLanguage, so a new
  language doesn't compile until it says; transcripts are written in `TRANSCRIBED` (transcript.ts) and say so in any
  other; an algorithm may lack a language while it is written (algorithms.test.ts's `WRITING`; Java shows meanwhile).
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
  `follow.ts`). The play bar's </> button (shown when the operation has `code`) opens one to the structure's right
  (`putBeside`: past anything in the way, the camera panning to it but never zooming, `keepOnScreen`'s `zoom: false`)
  or takes it away; while one is there, every operation with code shows its algorithm in it (`playOperation`'s `code`
  replaces the box's code, Esc puts the old back), the frame's `line` lit yellow with a pc arrow (room kept on the
  left whenever `algorithm` is set). Live values: a line tagged `$i` shows `i = 2` after it in violet (the pointers'
  colour) as the steps run; a value is the step's pointer of that name (at its element) or its `Frame.vars` (the
  array recorder's `r.let('maxval', v)`, kept for later steps; undefined: out of scope); `$min_idx=min` shows the
  step's `min` under the language's own name; room after those lines is kept in the layout (`after`), long values
  cut to fit. Tests as they are tested (beside an array, `tests.ts`, pure): a step on a while / for / if line (the
  line's first tag: a line that tests and acts, if (...) swap(...), tags its test first) boxes the condition green or red
  and writes it out after the line with the step's values (pointers at indexes, its variables, a[...] from the step's
  array, a.length, len(a), C's n; Python's for i in range(...) as `3 in range(1, 5)`), each && / and part coloured, a
  part never reached faded in the code and `…` after it, then `→ true` / `→ false`; one it can't work out (a method
  call, an unknown name) shows nothing. What a test reads comes from the structure (`testValues(shape, frame)` on the
  util; arrays, heaps and union-find through `indexTestValues`: a, heap / C's h->a, parent[] / u->parent, self. and
  this. read through). Beside lists, trees and graphs (dds-ung, `src/nodelink/scene-tests.ts`, from the step's scene):
  names refer to nodes, a pointer at a node or a label (head, tail, top) at the node its arrow points to, a null marker
  null; a tree's steps name nodes by value (curr = 40), the one node holding it; fields follow the arrows (next, prev;
  left / right by which side the child is drawn; value / key the node's value), C's `->` too; == compares which node,
  written as its value, `9@2` (the node at 2) when another node holds the same, so Floyd's slow == fast is right with
  repeated values. A graph's vertices go by their labels, its strips' arrays by vertex (visited[w], T / F booleans,
  the strip as it stands at the step). A one-line test that also acts, one tag (`if (key < curr.key) curr = curr.left;`:
  the step shows curr moved), reads the step before (`readsBefore`: only when what it assigns is a name the test reads,
  so not `tomb = i` after `table[i] == DELETED`); Python's two lines tag the statement, not the if. The room kept after
  a test line is what it reads as written out (`testWidth`). Hash tables (`hashTestValues`, dds-2tt.12): chaining's x
  is the chain node a step compares (its `x` variable names it by key; x.key the key of a key:value entry), probing's
  table[] the slots by key (null, DELETED), with m and the probe count k; Java's casts (`(int) table[i]`) and
  `.equals(...)`, C's `strcmp(a, b)` are read; C's probing (`t->slots[i].state`) shows nothing. The code's columns are
  the mono font's 0.6 em, so boxes sit on their characters.
  `algorithms.ts` (pure): each algorithm written per language with `@tag`s and `$tag`s at line ends,
  two spaces before (`parseCode`), `algorithmCode` (every algorithm in C, Java and Python; C as a slide would put it:
  arrays with their length, `swap(&a[i], &a[j])`, structs by pointer, `newNode`, `NULL`), `taggedLine` / `shownValues`
  (find a tag's line in code edited since, by its text). Line counts (dds-szw.14, lecture 3's "times" column): Show >
  Times each line runs (prop `lineCounts`) puts a column at the right, `×n` per counted line, ticking up as the steps
  go: frames carry `runs` (cumulative, by tag), which the array recorder keeps (`r.counting(...tags)` from 0, then
  `r.ran(...tags)` for every line the code runs on its way to the next step: loop headers once per test, so one more
  than their body when the loop runs out; a line's count is its tags' sum; `ran` ignores tags `counting` didn't name, so
  steps shared with uncounted operations, quicksort's variants calling Lomuto's partition, say what they run either way).
  Every tagged line runs as often in each language, so one-liners that run two ways are split (`if (a[mid] == key)` /
  `return mid;`) and a line only one language has (Python's `i += 1` before Hoare's inner while) gets a tag of its own.
  Counted: linear, binary (both), sentinel search, max, unique (all three), insertion sort (lecture 3's: `key = a[i]`,
  worst case while n(n + 1)/2 - 1), selection and bubble sort, both partitions, plain quicksort and merge sort (2n - 1
  calls, the copy-back n log₂ n); `src/shapes/array/line-counts.test.ts` pins the totals. Insertion sort's play bar counts comparisons of two
  values and, beside them, `while tests` (the test also runs when j > 0 stops it, comparing nothing: lectures 2-3's 54
  and 14 are the tests); its last step says why the two differ. Where a slide's count is off, drawds counts correctly. Picking another language swaps an unedited box to that language's version (`onBeforeUpdate`).
  The arrays' code is `src/shapes/array/code.ts` (searches, scans, every sort, shuffles, lecture 6's ArrayStack push / pop /
  peek for a fixed stack and ArrayQueue enqueue / dequeue / peek for the circular buffer, insert / delete by shifting, growing
  or with a fixed capacity), the lists' `src/shapes/list/code.ts` (lecture 5's indexOf for find, size counted,
  insert after / at the head, append, delete, reverse, insert in order, print, the middle and Floyd's cycle start (slow /
  fast), print backwards (doubly), and the linked stack's and queue's operations, `linked-*`), written by hand for the plain
  singly linked list (a tail its own version, `-tail`); every other mix of doubly / circular / sentinel / tail generated
  by `src/shapes/list/variant-code.ts`: each operation written once against a language (Java, C, Python: fields, null,
  declarations, loops, a circle's do-while), the flags choosing its lines as they choose its steps, ids `<base>-doubly-
  circular-sentinel-tail` with only the flags that change it (`listCode(props, base)` picks one; a cycle has only Floyd's).
  Round a circle without a sentinel, inserting or deleting at the head first finds `last` (head.prev, the tail, or a walk
  round, `findLast` steps); a doubly linked list with a tail deletes its last node with removeLast (no walk); insert in
  order round a circle without a sentinel has no code. The algorithms test runs every operation on all 16 mixes; curr,
  prev, node, slow, fast, last shown by their nodes'
  values through `Frame.vars`, since a list pointer is at a node key), the trees' `src/shapes/tree/code.ts` (traversals,
  measures, BST min / max, and lecture 8b's BST search, insert and delete as `bstInsertSteps` / `bstDeleteSteps` walk them,
  delete's three cases with the successor relinked, 3.1 or 3.2), the graphs' `src/shapes/graph/code.ts`, the heaps'
  `src/shapes/heap/code.ts`, the hash tables' `src/shapes/hash/code.ts`, union-find's `src/shapes/union-find/code.ts`.
