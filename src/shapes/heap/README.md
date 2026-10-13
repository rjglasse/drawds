# Heaps

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/heap/` - heaps stored as their array (`values`, index i's children 2i+1, 2i+2), drawn as the
  implicit complete tree (keys `"i"`) plus the array (keys `"a" + i`); marks keyed by index. `heap.ts` is pure
  (sift up/down with swaps + path, insert, removeAt, heapify, violations, `buildHeapSteps`: Floyd as frames, keyed
  by index; `inBothViews` lights tree and array); `steps.ts` (pure) the insert and remove steps, keyed by index too. Heap
  menu: build heap step by step, shuffle values. Code (`code.ts`, `heapCode(op, type)`): a min heap's and a max heap's,
  the same but for the comparison and the names: insert with its sift up inline, extractMin / Max and removeAt with
  siftUp / siftDown beside them, buildHeap calling siftDown; the traversals (`heap-<order>`, `traverseTree`'s
  `indexed`) are the tree's line for line over indexes (`2 * i + 1 < size`), a step naming i and the size.
