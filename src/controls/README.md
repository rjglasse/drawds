# On-canvas controls

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/controls/` - on-canvas controls shown while a structure is the only selected shape
  (`showsStructureControls`): grow grips (tldraw `create` handles `grow` / `grow-start`, drawn only on hover,
  plus our own '+' `GrowGrip`; `grownCount` is pure) and `ControlButton` (HTML insert '+' / remove 'x',
  since handles can't be clicked). New values come from `extendValues` in `src/data/fill.ts` (end or start).
