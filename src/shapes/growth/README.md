# Counts as n grows

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- Counts as n grows (lecture 10b, `src/shapes/growth/`, dds-szw.23): the lecture times sorts; drawds counts their
  comparisons, at n = 10, 100, 1000 on sorted, reversed, random and 0-2-only input (`growthInput`, pure), each count
  over its factor (×10 linear, ×15 n log n, ×100 quadratic) and a "grows as" row from the analysis (`GROWTH`: one run's
  factor can't tell n from n log n). A `sort-growth` shape following the array (`structureId`; `sort`, `seed`,
  `cutoff`), filled a row at a time by `growthOperation` (`Frame.growth`: the rows shown, the rest '?'), opened by
  `openGrowth`. Sorts > "Counts as n grows: <the sort last played on the array>" (`lastSorts`, insertion sort first).
  Fill range 0-2 (`few`) is the lecture's data with max 2.
