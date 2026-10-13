# Sketch tools

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/sketch/` - press-and-drag tools: `createDragTool` (generic gesture state; trees, heaps, graphs) and
  `createLineSketchTool` on top of it (`nextSketchState`, pure; arrays, lists). The latest gesture state is always
  kept; `same` only decides whether the shape is redrawn, so gestures can follow the pointer's path (graphs).
