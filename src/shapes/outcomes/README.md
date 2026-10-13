# A shuffle's outcomes

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/outcomes/` - a shuffle's outcomes (dds-szw.16, lecture 2's "Draw: Unfair / FY Shuffle Permutations" and
  its demo "run a shuffle many times and show the distribution"), a `shuffle-outcomes` shape following the array
  (`structureId`; `kind` unfair / fisher-yates, `mode` tree / tally, the start `values`, a `seed`). `outcomes.ts` (pure):
  `outcomeTree` (a level per pick, a child per n), `tallyOf` (every order, by `everyOrder`, its count), `simulate`
  (seeded runs, more extend fewer), and the array operations: `everyRunOperation` (the tree a level at a time, then the
  leaves coloured by order and the tally: fair or not) and `manyRunsOperation` (1, 10, 100, 1000 runs per order). Frames
  say how much shows (`Frame.outcomes`: `level` or `runs`); not playing, the view shows all of it. `layout.ts`: the tree
  over its leaves, bars on a share scale (full height = 1.5 fair shares, capped) with the fair share dashed; six or
  fewer orders get a colour each. The tree for up to three values (`TREE_MAX`), the tally up to four (`TALLY_MAX`);
  `openOutcomes` puts one to the right (a tally with the same values takes the new seed), Esc takes it back.
