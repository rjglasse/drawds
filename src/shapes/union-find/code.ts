import type { CodeSource } from '../code/algorithms'
import type { UnionBy } from './union-find'

// Union-find's code, as a code box beside the forest shows it while one plays: the parent array (a
// root is its own parent), find walking up it (with path compression, a second loop pointing every
// node on the way straight at the root, in the order the steps show), and union linking one root
// under the other: naively, by size (the smaller tree under the bigger root, its size added) or by
// rank (the lower root under the higher, the rank growing on a tie), with find under it. Tags as in
// `src/shapes/code/algorithms.ts`; curr, ra and rb are the steps' pointers.

/** The code id for a find, or a union of this kind, with path compression or not. */
export const unionFindCode = (op: 'find' | 'union', by: UnionBy, compress: boolean) =>
	`uf-${op}${op === 'union' ? `-${by}` : ''}${compress ? '-compress' : ''}`

function find(compress: boolean): CodeSource {
	if (!compress)
		return {
			c: String.raw`
				int find(UF *u, int i) {                  @call
				    int curr = i;
				    while (u->parent[curr] != curr)       @up $curr
				        curr = u->parent[curr];
				    return curr;                          @root
				}`,
			java: String.raw`
				int find(int i) {                         @call
				    int curr = i;
				    while (parent[curr] != curr)          @up $curr
				        curr = parent[curr];
				    return curr;                          @root
				}`,
			python: String.raw`
				def find(self, i):                        @call
				    curr = i
				    while self.parent[curr] != curr:      @up $curr
				        curr = self.parent[curr]
				    return curr                           @root`,
		}
	return {
		c: String.raw`
			int find(UF *u, int i) {                  @call
			    int curr = i;
			    while (u->parent[curr] != curr)       @up $curr
			        curr = u->parent[curr];
			    int root = curr;                      @found
			    while (u->parent[i] != root) {        @compress
			        int next = u->parent[i];
			        u->parent[i] = root;              @point
			        i = next;
			    }
			    return root;                          @root
			}`,
		java: String.raw`
			int find(int i) {                         @call
			    int curr = i;
			    while (parent[curr] != curr)          @up $curr
			        curr = parent[curr];
			    int root = curr;                      @found
			    while (parent[i] != root) {           @compress
			        int next = parent[i];
			        parent[i] = root;                 @point
			        i = next;
			    }
			    return root;                          @root
			}`,
		python: String.raw`
			def find(self, i):                        @call
			    curr = i
			    while self.parent[curr] != curr:      @up $curr
			        curr = self.parent[curr]
			    root = curr                           @found
			    while self.parent[i] != root:         @compress
			        nxt = self.parent[i]
			        self.parent[i] = root             @point
			        i = nxt
			    return root                           @root`,
	}
}

function union(by: UnionBy, compress: boolean): CodeSource {
	const f = find(compress)
	// The lines that decide which root goes under which, and what the new root keeps count of.
	const weigh = {
		size: {
			c: ['    if (u->size[ra] > u->size[rb]) { int t = ra; ra = rb; rb = t; }', '    u->parent[ra] = rb;                     @link', '    u->size[rb] += u->size[ra];'],
			java: ['    if (size[ra] > size[rb]) { int t = ra; ra = rb; rb = t; }', '    parent[ra] = rb;                        @link', '    size[rb] += size[ra];'],
			python: ['    if self.size[ra] > self.size[rb]:', '        ra, rb = rb, ra', '    self.parent[ra] = rb                    @link', '    self.size[rb] += self.size[ra]'],
		},
		rank: {
			c: ['    if (u->rank[ra] > u->rank[rb]) { int t = ra; ra = rb; rb = t; }', '    u->parent[ra] = rb;                     @link', '    if (u->rank[ra] == u->rank[rb]) u->rank[rb]++;'],
			java: ['    if (rank[ra] > rank[rb]) { int t = ra; ra = rb; rb = t; }', '    parent[ra] = rb;                        @link', '    if (rank[ra] == rank[rb]) rank[rb]++;'],
			python: [
				'    if self.rank[ra] > self.rank[rb]:',
				'        ra, rb = rb, ra',
				'    self.parent[ra] = rb                    @link',
				'    if self.rank[ra] == self.rank[rb]:',
				'        self.rank[rb] += 1',
			],
		},
		naive: {
			c: ['    u->parent[ra] = rb;                     @link'],
			java: ['    parent[ra] = rb;                        @link'],
			python: ['    self.parent[ra] = rb                    @link'],
		},
	}[by]
	// find's lines, without the indentation they were written with, to go under union's.
	const indent = (code: string) => {
		const lines = code.replace(/^\n+/, '').split('\n')
		const n = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length))
		return lines.map((l) => l.slice(n)).join('\n')
	}
	return {
		c: [
			'',
			'void unite(UF *u, int a, int b) {          @union $a $b',
			'    int ra = find(u, a);                    $ra',
			'    int rb = find(u, b);                    $rb',
			'    if (ra == rb) return;                   @same',
			...weigh.c,
			'}',
			'',
			indent(f.c!),
		].join('\n'),
		java: [
			'',
			'void union(int a, int b) {                 @union $a $b',
			'    int ra = find(a);                       $ra',
			'    int rb = find(b);                       $rb',
			'    if (ra == rb) return;                   @same',
			...weigh.java,
			'}',
			'',
			indent(f.java),
		].join('\n'),
		python: [
			'',
			'def union(self, a, b):                     @union $a $b',
			'    ra = self.find(a)                       $ra',
			'    rb = self.find(b)                       $rb',
			'    if ra == rb:                            @same',
			'        return',
			...weigh.python,
			'',
			indent(f.python!),
		].join('\n'),
	}
}

export const UNION_FIND_CODE: Record<string, CodeSource> = Object.fromEntries(
	[false, true].flatMap((compress) => [
		[unionFindCode('find', 'size', compress), find(compress)],
		...(['size', 'rank', 'naive'] as const).map((by) => [unionFindCode('union', by, compress), union(by, compress)]),
	])
)
