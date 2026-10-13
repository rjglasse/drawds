# The lesson log

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/lesson/` - the lesson log: every operation played (not replays) is recorded through `recordOperations`
  (playback.ts) into the board's document meta (`drawdsLesson`, history-ignored, so undo never drops a record and it is
  saved with the board): the shape and its views as they were, the frames, the result, the outcome, and when each step
  was shown. `replayEntry` puts the recorded records back in place (migrated from the schema they were saved with,
  history-ignored; `drawdsReplay` keeps the current ones to put back on close, or on the next mount after a reload) and
  plays it with `replay: true` (not recorded; its commit stays out of undo). `exportLesson` replays and exports each in
  order; `lessonManifest` is the lesson.json beside the images (captions, times shown) to line up with a transcript.
  Main menu > Lesson log… (`LessonDialog`); dev `window.drawdsLesson`, driver `lesson`.
