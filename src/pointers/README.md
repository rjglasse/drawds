# Pointers

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/pointers/` - named pointers (i, curr, root...): `props.pointers` on every cell shape, `{id, name, at}`
  with `at` an element key (arrays allow -1 and n, lists `#null`). Pure model (`pointers.ts`) and layout
  (`layout.ts`: labels side by side or stacked, arrow onto the element); `CellShapeUtil` renders them
  (`renderPointers`, sliding via a CSS transition; `renderPointerOverlays` for drag / click-to-pick-up / arrow
  keys / rename prompt). Shapes implement `pointerAnchor` (box + side), `pointerStep`, `pointerNames`;
  node-link shapes get defaults. Added from the context menu's Pointer submenu.
