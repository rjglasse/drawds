# Cells: editing, marks, clean copies, followers

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/cells/` - shared in-place cell editing: `EditableCells<S>` (hit-test, box, get/set, neighbours) and
  `CellShapeUtil`, a ShapeUtil base that wires tldraw's edit lifecycle and renders the inline input. A cell named by
  its value (a hash table's chained key, `k:<entry>`) is renamed as it is typed (`renameEditingCell`), the input staying.
- `src/cells/clean-copy.ts` - Clean copy, last in every structure's own submenu (`NodeOperationsMenu` adds it): the
  same props (values, shape, seed) without marks or pointers, under the original past anything in the way
  (`freeTopBelow`, pure), selected, one undo step; followers stay with the original.
- `src/cells/followers.ts` - shapes that follow a structure (`graphId` on graph views, `structureId` on recursion trees
  and code boxes): `followersOf` is what the lesson log records and replays with an operation and what step export
  draws; the strips go under followers beside a structure if one is in their way, else they stay right under it
  (`besideBoxes`, used by `placementFor` in `src/controls/placement.ts`), and the play bar takes the highest spot it fits
  at the zoom it is drawn at (`barSpots` / `barSpot`: under the structure, then under each follower in turn, as wide as
  the room before the next follower reaching lower, its caption wrapping under the buttons; `MIN_BAR_WIDTH`), so a tall
  code box doesn't push it off screen; they are deleted with it (`deleteFollowersWithTheirStructure`, an after-delete
  side effect registered in App's onMount). tldraw measures a shape for hit-testing and culling only when its own record
  changes, and a follower drawn from its structure (a transcript, a graph's views, memory, a ring) grows while its record
  stays the same: `keepFollowersMeasured` writes a follower's new size into its meta (`drawdsDrawn`) in the change that
  made it, so it is found where it is drawn (one undo takes both back).
