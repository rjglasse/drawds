import { recount, type UnionBy } from '../shapes/union-find/union-find'
import type { Compression } from '../shapes/union-find/union-find-shape-types'

// Union-find's moves, as its transcript keeps them (as `array-moves.ts` for arrays): its parent,
// size and rank arrays, as its code keeps them, and how union and find work (the style panel's
// union by and path compression). Element names are how it is drawn: the code works by index.

/** What union-find's transcript follows. */
export interface UnionFindState {
	parent: number[]
	sizes: number[]
	ranks: number[]
	by: UnionBy
	compress: boolean
}

export type UnionFindMove =
	| { op: 'new'; name: string; state: UnionFindState }
	/**
	 * Union by size, rank or naively from now on; path compression on or off. To size: the sizes drawds
	 * kept, as the code of a union by rank or naively doesn't keep them (drawds counts them all the same).
	 */
	| { op: 'by'; by: UnionBy; sizes?: number[] }
	| { op: 'compress'; on: boolean }
	/** A new element, in a set of its own. */
	| { op: 'makeSet' }
	/** parent[i] typed; `size` and `rank` the roots' counts that changed with it. */
	| { op: 'parent'; i: number; p: number; size: [number, number][]; rank: [number, number][] }
	/** New arrays all at once (random unions; every element on its own again). */
	| { op: 'assign'; state: UnionFindState }
	/** An operation played step by step and put in: union(a, b) or find(i), as the operation says. */
	| { op: 'call'; algorithm: string; label: string; effect: UnionFindMove[]; args?: Record<string, string> }

export const unionFindState = (p: { parent: number[]; sizes: number[]; ranks: number[]; unionBy: UnionBy; compression: Compression }): UnionFindState => ({
	parent: p.parent,
	sizes: p.sizes,
	ranks: p.ranks,
	by: p.unionBy,
	compress: p.compression === 'on',
})

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i])

export const sameUnionFind = (a: UnionFindState, b: UnionFindState) =>
	a.by === b.by && a.compress === b.compress && same(a.parent, b.parent) && same(a.sizes, b.sizes) && same(a.ranks, b.ranks)

/** Every element in a set of its own, as a new union-find starts. */
export const isSingletons = (s: UnionFindState) => s.parent.every((p, i) => p === i) && s.sizes.every((n) => n === 1) && s.ranks.every((r) => r === 0)

/**
 * The moves that take union-find from `prev` to `next`: how union and find work, an element added,
 * a parent typed (with the roots' size and rank it recounts: the code only reads those at roots);
 * else the new arrays.
 */
export function diffUnionFind(prev: UnionFindState, next: UnionFindState): UnionFindMove[] {
	if (sameUnionFind(prev, next)) return []
	const moves: UnionFindMove[] = [
		...(prev.by !== next.by ? [{ op: 'by' as const, by: next.by, ...(next.by === 'size' ? { sizes: [...next.sizes] } : {}) }] : []),
		...(prev.compress !== next.compress ? [{ op: 'compress' as const, on: next.compress }] : []),
	]
	const [a, b] = [prev, next]
	const n = a.parent.length
	if (same(a.parent, b.parent) && same(a.sizes, b.sizes) && same(a.ranks, b.ranks)) return moves
	const kept = (s: UnionFindState, k: number) => same(s.parent.slice(0, k), a.parent) && same(s.sizes.slice(0, k), a.sizes) && same(s.ranks.slice(0, k), a.ranks)
	if (b.parent.length === n + 1 && kept(b, n) && b.parent[n] === n && b.sizes[n] === 1 && b.ranks[n] === 0) return [...moves, { op: 'makeSet' }]
	const changed = a.parent.flatMap((p, i) => (p === b.parent[i] ? [] : [i]))
	if (b.parent.length === n && changed.length === 1) {
		const [i] = changed
		const counted = recount(b.parent)
		// Typed by hand: sizes and ranks recounted. Only the roots' counts matter to the code.
		if (same(counted.sizes, b.sizes) && same(counted.ranks, b.ranks)) {
			// A root that was one before has the count the code has; a new root's count was nobody's to keep.
			const roots = b.parent.flatMap((p, k) => (p === k ? [k] : []))
			const counts = (was: number[], now: number[]) => roots.flatMap((k): [number, number][] => (a.parent[k] === k && was[k] === now[k] ? [] : [[k, now[k]]]))
			return [...moves, { op: 'parent', i, p: b.parent[i], size: counts(a.sizes, b.sizes), rank: counts(a.ranks, b.ranks) }]
		}
	}
	return [...moves, { op: 'assign', state: { ...next } }]
}
