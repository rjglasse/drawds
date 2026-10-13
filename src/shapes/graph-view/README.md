# A graph's views

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/graph-view/` - a graph's adjacency matrix, adjacency lists or Kruskal's union-find as a separate shape
  (`graphId`, style `drawds:graph-view`), redrawn from the graph as it renders (`model.ts` is pure; rows, columns and
  lists in label order, as BFS / DFS visit neighbours). The union-find view draws `Frame.sets` (Kruskal's frames carry
  each node's parent and size, keyed by node, plus what to light) while Kruskal plays, else where Kruskal ends
  (`kruskalSets`); laid out from the widest arrangement with room for the deepest step, so it holds still. Kruskal opens
  one if the graph has none (`playOperation`'s `onCancel` takes it back on Esc). A graph's strips and play bar go under
  any view beside it (`bottomBeside`). The graph's marks and an operation's highlights map onto it
  (`viewHighlights`: a node to its row / column headers or list head, `edge:<id>` to its cells or list entries).
  Toggled from the graph's Show menu (`toggleGraphView`; shown, its item reads Hide the ...), placed by `putBeside` as
  every view beside a structure is (`showGraphView`). The matrix reuses `MatrixSvg` with `rowLabels` /
  `colLabels` and `row:<r>` / `col:<c>` header tints. Lecture 9a: an edge-list view (`edges`: `edgeList`, a row per
  edge, sorted, the earlier label first when undirected; a node lights every cell naming it), and each view but the
  union-find under a heading of what it costs (`viewTitle`: V × V cells and how many are filled, V + 2E (directed V + E)
  list entries, E pairs, and the vertices on no edge that an edge list loses). `costs.ts`: what a change costs each
  representation, step by step (add a vertex: the matrix copied into a bigger one, V², the lists a head; remove one:
  (V - 1)², every list walked, V + E, the pairs scanned; remove an edge: 2 cells, the two ends' lists walked, O(deg u +
  deg v), not E; is u adjacent to v: 1 cell, u's list, the pairs); frames carry the graph (`props`, so the views draw
  the step's graph) and `Frame.views`, each view's own highlights for that step; counts per representation in the play
  bar. The graph's Step by step opens the matrix and lists for them (`playCosts`; Esc takes them back).
