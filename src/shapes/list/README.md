# Linked lists

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

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
