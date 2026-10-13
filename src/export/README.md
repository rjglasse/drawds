# Steps as images

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/export/` - an operation's steps as images (`exportSteps`: the play bar's download button, and in dev
  `window.drawdsSteps` / the driver's `steps`): puts the result in first, then for each step `showStep` + tldraw's
  `toImage` over one area (the union of every step, optionally grown to an `aspect`), named `01-caption-words.png`.
  While exporting (`whileExportingSteps`), shapes' `toSvg` draw the step as the canvas shows it (`exportingStep`) plus
  `StepExtrasSvg`: the step's pointers, strips and a wrapped caption under it (`captions: false` leaves it out); a
  graph's views draw it too. A new structure's `toSvg` must do the same. `saveStepImages`: Chrome's directory picker,
  else downloads. `.claude/skills/run-drawds/deck.py` turns exported steps into a 16:9 .pptx (Google Slides imports it).
