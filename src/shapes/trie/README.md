# Tries

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/trie/` - tries (dds-55z.17.10, Shift+W): a general tree of letters, drawn by the general tree's layout
  (`trieScene`: each edge labelled with its letter, nodes not typed into; `markKeyAt` finds any node for marks and
  menus). Nodes are `TreeNode`s, id `^` + the prefix they stand for (root `^`), value the word ending there ('' if
  none: a word node shows its word, a stadium when long), children in letter order. `trie.ts` pure: insertWord /
  deleteWord (prunes back up), wordsOf (pre-order: alphabetical), `sketchWords` (a seeded start in a list of words
  sharing beginnings; the tool adds one per cell dragged right), and the steps with code (`code.ts`, C / Java an array
  of 26, Python a dict): insert (down, nodes added, end marked; the + above the root), contains (found, only a prefix,
  a letter missing), startsWith (down, then collect: a pre-order walk, the open path lit, words green, a `words`
  strip; from a node's menu, or all words), delete (recursive: down, unmark, prune on the way back while a node is no
  word's end and childless; x on a word's node). Code beside it (`src/transcript/trie-moves.ts`): the log follows its
  words, `t = Trie(["tea", "ten"])` (Java varargs, C `trieOf(n, ...)`), each insert / delete a call with its word
  (`playOperation`'s `args`), words otherwise put in or taken out as insert / delete; in the board script a `Trie` of
  drawds' own code (methods in the class, `collect` / `delete_from` after it, nodes `TrieNode`), checked in python3.
