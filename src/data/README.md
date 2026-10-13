# Values, fills and seeds

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/data/` - seeded RNG (`mulberry32`) and fill generators (`fillValues`, `extendValues`, `insertValue`, each
  taking a `range`: 0-2, 0-9, 0-99, 0-999, -50..50; sorted runs from 0-2 grow by 0 or 1, kept in range);
  `fill-style.ts` has the `drawds:fill` and `drawds:fill-range` StyleProps (every filled shape stores `range`) plus `refillSelectedShapes`. `newSeed` is short (1-9999, to note
  down). `seed.ts`: a pinned seed (localStorage `drawds:seed`) that `createDragTool` gives every new sketch instead
  (`seedForSketch`), so the same length draws the same values; set from the style panel's Seed row
  (`src/ui/SeedPicker.tsx`: with a tool out, type one; one structure selected, its seed read-only and the lock pins it).
