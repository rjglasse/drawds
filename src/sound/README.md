# Sound (an easter egg)

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/sound/` - an easter egg (dds-egh.1), for a student to find: Sorts > Bogosort (`src/shapes/array/bogo.ts`: shuffle
  until sorted; or Bozosort, two values swapped at random, maybe the same one; pairs checked left to right, giving up
  after `LUCK_TRIES`, saying n!) turns sounds on for the tab
  (`startSound` on the menu click, the gesture browsers need; a reload turns them off). While on, a speaker at the top
  (`SoundButton` in tldraw's TopPanel, labelled with the key and scale) opens a menu: the scale (`SCALES` in `notes.ts`:
  major and minor pentatonic, blues, Dorian, hirajoshi, whole tone, each with its intervals and a line on what it is,
  and the final boss, Schoenberg's Op. 25 twelve-tone row: `steps` in the row's order, so values climbing it leap about,
  its bass a tritone, `Scale.bass`), the key (all 12), and off; picked quietly (changing them while a sort plays is the
  fun), tab only too. Web Audio, no files (`player.ts`: a
  triangle blip with quiet sines an octave up and down, 6 ms attack, 180 ms fade; under each group of notes a bass, the
  key's root and fifth by turns, two octaves down (`bassNotes`; the whole tone scale's ♯5); a limiter; notes 35 ms apart
  at least, at most 14 sounding, none queued past 0.35 s but runs). `notes.ts` (pure): each value a note by its rank among
  the structure's values over two and a half octaves of the scale, the root near middle C (letters alphabetically, a new
  value between its neighbours). `listen.ts`: each step shown going forward (not back, not
  while predict mode asks) plays what it lights, swaps and moves to (`touchedKeys`), a sort's last step a run up its
  values (bogosort only if lucky, else three notes down); moves by hand play too (values changed or added, by element
  key: drawing out, typing, swapping, sorting), a removal a low note, a mark a tick; nothing while an operation is open
  on the shape (its steps sound). Arrays and matrices by index, node-link structures by their scene's nodes.
