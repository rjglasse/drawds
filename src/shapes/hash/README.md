# Hash tables

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/hash/` - hash tables (node-link): `buckets: string[][]` (a chain per bucket, or one entry per slot with
  `TOMBSTONE` for deleted), strategy style `drawds:hash-strategy` chaining / probing (switching re-inserts the
  keys). Lecture 7: a hash code (`drawds:hash-code`: character codes added; the first three letters, A = 1, added, the
  class exercise KIM = 33; Java's String.hashCode, `javaHashCode`, 32-bit, misused / horsemints collide; direct
  addressing, the key is the index, the Bus Map) and a compression (`drawds:hash-compress`: mod m, floorMod for negative
  codes, or MAD `((a·h + b) mod p) mod m`, constants in `MAD`), props `code` / `compress`; the pure functions take a
  `HashScheme` (or just a strategy: sum, mod), `hashOf` says how each step was worked out. Direct addressing refuses
  what it can't place and says why (256 in a small table: the slots it would waste; X70: no index); switching to it
  sizes the table for the largest key (`withScheme`), and it has no compression to pick and nothing to rehash. `hash.ts` is pure: `hashOf` (k mod m, or character codes added; with how, for captions), `buildTable`,
  `misplaced` (keys a find wouldn't reach: the red ring), insert / find / delete / rehash as frames (rehash puts the
  keys in one by one, in order, as its code does: with probing, the order decides the slots). Entries are
  keys or `key:value`; scene keys `b<i>` buckets, `k:<entry>` chained entries, `s<i>` slots, `#load`. Shift+B. Code
  (`code.ts`, `hashCodeId`): insert / find (contains) / delete (remove) for chaining (a chain of nodes, a new key on the
  end) and probing (at most m slots tried, a DELETED marker), and rehash, each over index(key) as the scheme says; an
  integer key is its own hash code, so the key worked on picks int or text code. MAD runs in a long (a hashCode near 2^31
  would overflow 7·h); C has its own floorMod. The index functions were checked against `hashOf` by running them in real
  Python, Java and C (keys including misused / horsemints and negatives).
