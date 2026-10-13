# A circular buffer as a ring

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/ring/` - a circular buffer as a ring (dds-55z.31): Show > As a ring beside it on a queue with a fixed
  capacity (`toggleRingView`, placed by `putBeside`) opens a `ring-view` following it, redrawn from it as it renders (a
  step's values, front and used, and its highlights, as views are); the row stays as it is, closer to the code.
  `model.ts` is pure (`ringLayout`: cells as slices of a ring about a cell long, index 0 at the top and on clockwise,
  indices outside, a marker's arrow and name beyond them); values in spare slots faded as on the row, front and rear
  from `arrayMarkers` (one arrow when they share a cell), "size k of n" in the middle.
