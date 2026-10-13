# Boards as files

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/files/` - boards as files: Open board... / Save board / Save board as... first in the main menu (Ctrl+O / Ctrl+S /
  Ctrl+Shift+S), tldraw's `.tldr` JSON (`serializeTldrawJsonBlob` / `parseTldrawJsonFile`, so our shape migrations
  run on open). Chrome's File System Access pickers where present (Save then writes back to the picked file: handles
  are keyed by `document.meta.drawdsFile`, so undoing an Open never saves the old board over the file just opened),
  else a download and a file input. Opening is one undo step (its toast offers Undo); the board takes its file's
  name (`names.ts`, pure) and the tab title follows it. While typing on the board tldraw's shortcuts are off, so
  `BoardFileKeys` (a child of `<Tldraw>`, inside its UI) catches Ctrl+S / Ctrl+O there. A .tldr file dropped on the
  canvas opens too (`BoardFileDrop`, beside it: a 'files' external content handler; other files go to tldraw's
  default, images and videos as before). e2e stubs the pickers and drops files (`e2e/board-files.e2e.ts`).
