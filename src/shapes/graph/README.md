# Graphs

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/graph/` - graphs: nodes at free positions in cell units (so the size style scales the drawing), edges
  `{from, to, weight}` (weights always stored; shown when the `drawds:graph-weights` style says so; direction and
  A/0 labels are styles too, see `src/ui/GraphPickers.tsx`). `generate.ts` is the sketch: a node drops every
  GRAPH_SPACING along the drag, node k joins its nearest earlier node (connected) plus maybe two more nearby,
  skipping crossings, near misses and narrow angles (planar-ish); growth-stable like trees. Sketch options
  (styles `drawds:graph-density` sparse = a tree / medium / dense, `-parts` one piece or runs of the drag, `-order`
  any or DAG along the drag) feed `generateGraph`, and `withSketchOptions` rewires a selected graph. `model.ts` pure edits;
  `connect.ts` the connect grip (a 'create' handle `connect:<id>` on each node's right rim; drag state in a
  per-editor atom; drop on a node = edge, in empty space = new node + edge), and re-wiring (dds-55z.19.7): each edge's
  ends are 'create' handles `rewire:<edge>:from|to` a little along it (`edgeEndGrips`, the head's past its arrow,
  none on an edge too short), dragged onto another node to move that end (`rewireEdge`: id and weight kept; no
  self-loop, no edge already there), the edge hidden meanwhile and a dashed preview from the end that stays. A
  directed edge's menu reverses it (`reverseEdge`, not onto its twin), the graph's reverses every edge
  (`transpose`, Gᵀ); one undo step each. The graph tool pressed on a graph's node continues that graph (dds-55z.19.9,
  `createDragTool`'s `resume` hook: that shape and a gesture to go on from, one undo step, Esc takes it back):
  `extendingSketch` keeps new nodes clear of the old and the total at MAX_GRAPH_NODES, `extendGraph` joins each new
  node by the sketch's rules (nearest clean edge, extras by the graph's density, a DAG's order, complete stays
  complete), old nodes counting as earlier ones, ids and labels carrying on; the graph's position stays put.
  Re-layouts (dds-55z.19.2, `arrange.ts`, pure; Graph > Lay out round a circle / Tidy, one undo step each): round a
  circle in label order, A at the top, neighbours a spacing apart; tidy by forces (Fruchterman-Reingold from where the
  nodes are, each piece on its own, then scaled so edges average a spacing, nodes no nearer than a sketch's gap;
  pieces in a row as they were left to right). Both centred where the graph was, the same graph landing the same way.
  `algorithms.ts`: Dijkstra (distance
  badges, best edge green), Prim, Kruskal, topological sort (Kahn) as frames, reusing traverse.ts's `Recorder`
  (an edge only looked at flashes, then gets its colour back); unweighted graphs count every edge 1. `components`:
  connected components as lecture 9 counts them (a loop, pointer v, over the vertices: one visited already is skipped,
  else dfs(v) marks its whole component, coloured and numbered, and count += 1). BFS and DFS show lecture 9's visited[]
  (`visitedStrip`: booleans by vertex, a strip whose boxes have `labels`, marked on entry for DFS, when queued for BFS)
  beside the queue or call stack, and their code (`src/shapes/graph/code.ts`, with v and w; components too).
  `paths.ts` (lecture 9): a path from s to t with the fewest edges (`shortestPath`: BFS, distance badges, parent[]
  beside visited[], stopping when t is discovered, then x walks back the parents, lighting the path; a node's "Path
  from A to" asks for t) and Is there a cycle? (`findCycle`, Task 18: DFS from each unvisited vertex, s the loop's;
  undirected, a visited neighbour other than the parent closes one; directed, a neighbour still on the call stack, one
  that is done not; the cycle lit red; none: a forest, or a DAG), each with its code. Density `complete` (lecture 9a's
  fully connected): every pair joined, nodes round a circle so no edge runs through one (`completeGraph`; rewiring to it
  moves them there, node 0 kept). Show > degrees and neighbours (prop `degrees`): badges, directed in/out (`degrees` in
  model.ts), drawn by `NodeLinkShapeUtil.sceneBadges` while no operation is open; pointing at a node then lights it blue
  and its neighbours and the edges to them (`neighbourMarks` via `hoverHighlights`: green; directed, out green, in
  orange).
