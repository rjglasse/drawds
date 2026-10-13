# In memory

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/memory/` - a structure in memory (lecture 5's locality, dds-szw.25): Show > In memory on an array (any
  kind) or a linked list (`toggleMemoryView` in `show.ts`, placed by `putBeside`) opens a `memory-view` following it
  (`structureId`), redrawn from it as it renders, an operation's step and highlights included (as graph views are).
  `model.ts` is pure: a grid of 4-cell rows, 16 cells to start, each with its address (0x0..0xF); other data in some
  cells (style `drawds:memory-busy`, `MemoryPickers`: free, some (a cell a row), crowded (two a row)), each row's
  pattern seeded by its row, so growing moves nothing. An array books one block side by side (`a[i] at start + i`,
  named as the code beside it names it); outside crowded memory it books its block first, the other data around it;
  crowded, the first gap big enough, else a red "No room" (no 5 or more free cells side by side: the lecture's point).
  A list's nodes (prev, value, next; a sentinel too) each from a seeded address on, oldest id first, a whole row if
  there is one, so a new head moves no node; next / prev cells hold addresses, arrows chase them (prev dashed), drawn
  under the values. Memory grows a row at a time for nodes that don't fit (crowded leaves every row room for one).
