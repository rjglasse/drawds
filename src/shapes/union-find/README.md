# Union-find

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/union-find/` - union-find (disjoint sets), node-link: `parent` (a root is its own parent), `sizes`,
  `ranks` (kept as the code keeps them, meaningful at roots), `labels`; styles `drawds:uf-union` size / rank / naive and
  `drawds:uf-compress` on / off (`src/ui/UnionFindPickers.tsx`). Drawn as a forest (`forestPositions`: n-ary tidy trees
  side by side, arrows up to the parent) centred over the parent array (index row, `parent`, then `size` / `rank`; the
  array starts at x = 0 and holds still). Keys: element `<i>`, parent pointer edge `e<i>` (marks `edge:e<i>`), cells
  `p<i>` / `w<i>`; an element's mark lights its parent cell. As trees merge or a path is compressed its nodes glide to
  their new places (`glides` on NodeLinkShapeUtil, canvas only: SceneSvg's `glide` draws each node in a group moved by a
  CSS transition and eases edge paths with CSS `d`, the scene in layout coordinates at the layout offset, which jumps;
  a new edge fades in; off under prefers-reduced-motion). `union-find.ts` pure model, `operations.ts` frames: find
  (walk up with `curr`, then compression re-points arrows in a `scene` frame where the nodes are, then tidies) and
  union (both finds, then link by size / rank / naively, or refuse: one set already, Kruskal's cycle). Element menu: Find,
  Union with... (prompt: a name or index), Same set as... (`connectedSteps`, code `uf-connected`: both finds, the roots
  compared, nothing linked; the board script's UnionFind has it too); actions: Random unions, reset. Union by a gesture
  (dds-55z.34.2, `drag.ts`): each element's grip on its right rim (a 'create' handle, drawn on hover), dragged onto
  another element or its parent / size cell, plays union(a, b) (a dashed line, the target ringed, union(a, b) by the
  pointer). Type a parent into its cell (a loop is refused;
  sizes and ranks recounted). Shift+U. Code (`code.ts`, `unionFindCode`): find walking up (with
  compression a second loop re-pointing each node on the way, in the steps' order) and union (C's `unite`) by size / rank /
  naively with find under it, so a union's finds step into it; checked by running 40 random unions in real Python and
  Java against `unionSteps`.
