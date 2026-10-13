# Recursion trees and the recursion tracer

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/recursion/` - recursion trees (dds-szw.13): a recursive operation's frames carry `calls` (`{ call:
  'sum(0, 3)' }` made by the call running, `{ returns: '9' }` by it), `calls.ts` (pure) replays them into a `CallRun`
  (each call's caller, result, the steps it opened and returned at), `callStates` per step (running red: the call
  returning now, else the newest open; waiting orange, with the edge up to its caller: the stack; returned blue) and a
  tidy layout of the whole run (`callTreeLayout`, text widths per font), so the tree holds still while it grows. The
  `recursion-tree` shape stores the run's calls and follows the playing operation whose calls match its own
  (`callsSignature`); else it shows the whole run, every result, and its heading counts calls and depth (held back
  while playing, so the class can guess). `openRecursionTree` (before `playOperation`, its take-back as `onCancel`)
  puts one to the structure's right unless one there already shows the same calls (if that runs off the screen, the
  camera pans just enough, or zooms out to fit, clear of the style panel: `keepOnScreen`, `cameraToShow` pure, in
  `src/controls/onscreen.ts`), so two runs can be compared side
  by side. Arrays: Sum: last value + sum of the rest (a stick n deep) and Sum by halves (`sumByRest` / `sumByHalves`,
  shown when every value is a number), counts calls, max depth and additions. Lecture 4: merge sort and quicksort feed
  it too (`callEvents` in operations.ts: each call shows the values it is handed and returns them sorted, `id` its
  range so equal values aren't repeats, `size` how many values it works on; quicksort's returns ride on the next step);
  calls with sizes get a "values" column right of the tree, each level's sizes added up and totalled (`levelSizes`:
  merge sort n per level, quicksort on sorted input n, n - 1, ...), and the last step sums up the levels. Binary
  search, recursive (`recursiveBinarySearch`, low / mid / high as lecture 4 names them) makes a chain, returning up it. Repeated calls (`repeatedCalls`: the
  same call already finished elsewhere, not an ancestor) are green and counted in the heading (fib's overlap).
- Recursion tracer (dds-szw.13.4, `recursion-tracer`, Shift+R, a click places it, moved down or up so it is wholly on
  screen: the drag tools' `settle` hook, same undo step): a function traced on the call
  stack. Props `fn` (style `drawds:recursion-fn`: gcd, gcd-loop = Euclid as a while loop, one frame, its rounds
  counted against the recursive gcd's calls, fact, fib, sum, hello = sayHello with no base case, hello-count =
  sayHello(i) passing i + 1 on, overflowing at i = 9, stuck = a sum whose n never shrinks) and `call`, main's one
  editable cell (typing another function's call picks it, by its name and number of arguments; the picker types its
  example call; `onBeforeCreate` / `onBeforeUpdate` keep the two in step). `tracer.ts` is pure:
  `parseCall` (or why it can't be traced), `traceCall` frames whose props carry `trace` (the stack from main up, the
  code line, overflow, done) plus `calls` for the tree and `moves` `slot:<i>` with `flowing` values (a returned value
  drops into the frame below: `drawds-drop` keyframes). A frame that returns stays for its step and goes at the next.
  The never-ending ones overflow at `STACK_ROOM` frames (output strip for sayHello). `tracer-layout.ts`: sized for the
  whole run (a spare slot unless it overflows), main's slot kept still via `layoutOffset`; Java code under the stack,
  the step's line lit (base green, recursive orange, print blue). Its recursion tree opens only when calls branch
  (`branches`: fib); a chain is what the stack shows.
