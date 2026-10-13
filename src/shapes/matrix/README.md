# Matrices

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

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
  matrices); step pointers i / j sit at `row:<r>` / `col:<c>` (the index labels), and so do the teacher's (names i, j,
  k; drawn left of a row's index and above a column's, room kept by `pointerRoom` in `cells.ts`; arrows step a row's
  pointer up and down, a column's along). Pointers on cells: not yet (a label inside the grid covers a neighbour).
