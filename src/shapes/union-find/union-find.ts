/**
 * Union-find (disjoint sets) as a forest of parent pointers over elements 0..n-1: `parent[i]` is
 * i's parent, and a root is its own parent. `sizes` and `ranks` are kept the way the code keeps
 * them (meaningful at roots): union by size links the smaller tree under the bigger root, union by
 * rank the lower-ranked root under the higher, naive union always the first root under the second.
 */

export type UnionBy = 'size' | 'rank' | 'naive'

export interface Forest {
	parent: number[]
	sizes: number[]
	ranks: number[]
}

/** n elements, each in a set of its own. */
export function singletons(n: number): Forest {
	return { parent: [...Array(n).keys()], sizes: Array(n).fill(1), ranks: Array(n).fill(0) }
}

/** The way up from i to its root: [i, parent[i], ..., root]. Stops if the pointers loop (never in a valid forest). */
export function findPath(parent: readonly number[], i: number): number[] {
	const path = [i]
	while (parent[path[path.length - 1]] !== path[path.length - 1] && path.length <= parent.length) {
		path.push(parent[path[path.length - 1]])
	}
	return path
}

export const rootOf = (parent: readonly number[], i: number) => findPath(parent, i).at(-1)!

export const isRoot = (parent: readonly number[], i: number) => parent[i] === i

/** Path compression: every node on `path` points straight at its root (the path's last node). */
export function compress(parent: readonly number[], path: readonly number[]): number[] {
	const root = path[path.length - 1]
	return parent.map((p, i) => (path.includes(i) ? root : p))
}

/** Nodes on a find path that compression re-points (those not already at the root). */
export const toCompress = (parent: readonly number[], path: readonly number[]) => path.slice(0, -1).filter((c) => parent[c] !== path[path.length - 1])

export interface Link {
	/** The two roots (of a and of b). */
	ra: number
	rb: number
	/** The root linked under the other, and the root it goes under; undefined when a and b were in one set. */
	child?: number
	root?: number
	/** Union by rank, equal ranks: the new root's rank grows by one. */
	tie?: boolean
	forest: Forest
}

/** Union the sets of a and b (finding their roots without compressing). */
export function union(forest: Forest, a: number, b: number, by: UnionBy): Link {
	const ra = rootOf(forest.parent, a)
	const rb = rootOf(forest.parent, b)
	if (ra === rb) return { ra, rb, forest }
	let [child, root] = [ra, rb]
	let tie = false
	if (by === 'size' && forest.sizes[ra] > forest.sizes[rb]) [child, root] = [rb, ra]
	if (by === 'rank') {
		if (forest.ranks[ra] > forest.ranks[rb]) [child, root] = [rb, ra]
		tie = forest.ranks[ra] === forest.ranks[rb]
	}
	const parent = forest.parent.map((p, i) => (i === child ? root : p))
	const sizes = forest.sizes.map((s, i) => (i === root ? s + forest.sizes[child] : s))
	const ranks = forest.ranks.map((r, i) => (i === root && tie ? r + 1 : r))
	return { ra, rb, child, root, tie, forest: { parent, sizes, ranks } }
}

/** Each element's children, in index order. */
export function childrenOf(parent: readonly number[]): number[][] {
	const children: number[][] = parent.map(() => [])
	parent.forEach((p, i) => {
		if (p !== i && children[p]) children[p].push(i)
	})
	return children
}

/** Whether `parent[i] = p` keeps a forest: p is an element and i isn't on p's way up (no loop). */
export function canSetParent(parent: readonly number[], i: number, p: number): boolean {
	if (!Number.isInteger(p) || p < 0 || p >= parent.length) return false
	if (p === i) return true
	// With parent[i] = p, a way up from p that reaches i would go round for ever.
	const next = parent.map((q, j) => (j === i ? p : q))
	return !findPath(next, p).includes(i)
}

/**
 * Sizes and ranks that fit a forest set by hand: each root's size is its set's, each node's rank its
 * subtree's height (what union by rank would have made without compression).
 */
export function recount(parent: readonly number[]): Pick<Forest, 'sizes' | 'ranks'> {
	const children = childrenOf(parent)
	const height = (i: number): number => Math.max(0, ...children[i].map((c) => height(c) + 1))
	const size = (i: number): number => 1 + children[i].reduce((s, c) => s + size(c), 0)
	return { sizes: parent.map((_, i) => size(i)), ranks: parent.map((_, i) => height(i)) }
}

/** `count` random unions of random pairs (some land in one set already), with path compression off. */
export function randomUnions(forest: Forest, by: UnionBy, count: number, random: () => number): Forest {
	const n = forest.parent.length
	let f = forest
	for (let k = 0; k < count && n > 1; k++) {
		const a = Math.floor(random() * n)
		const b = Math.floor(random() * n)
		f = union(f, a, b, by).forest
	}
	return f
}
