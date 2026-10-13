import { fillValues, insertValue, type FillMode, type FillRange } from '../../data/fill'
import { mulberry32 } from '../../data/random'
import type { TreeNode } from '../tree/tree-shape-types'

/**
 * Most levels the sketch gesture makes for `arity` children a node: a perfect tree keeps to 64
 * leaves (six levels at most, as binary trees), so it fits on a board: 4 levels up to 4 children, 3
 * with 5 or 6.
 */
export function maxDepth(arity: number): number {
	let levels = 1
	while (levels < 6 && arity ** levels <= 64) levels++
	return levels
}

/** Hash a node's path (its child slots from the root, e.g. "021") with the seed to a number in [0, 1). */
function chance(seed: number, path: string): number {
	let h = 0x811c9dc5
	for (let i = 0; i < path.length; i++) h = Math.imul(h ^ path.charCodeAt(i), 0x01000193)
	return mulberry32((seed ^ h ^ (path.length * 0x9e3779b1)) >>> 0)()
}

/** Position of a path in a perfect tree of `arity` children a node, in level order (the root 0). */
export function levelIndex(path: string, arity: number): number {
	let index = (arity ** path.length - 1) / (arity - 1)
	for (let i = 0; i < path.length; i++) index += Number(path[i]) * arity ** (path.length - 1 - i)
	return index
}

/**
 * Paths of a random tree with exactly `depth` levels and up to `arity` children a node, in level
 * order: a path is the child slots taken from the root ('' the root, '2' its slot-2 child). Each slot
 * has a child with probability `fullness`, except along a seeded spine that guarantees the depth:
 * fullness 0 is a bare stick, 1 a perfect tree.
 *
 * Whether a path exists depends only on the seed, the path and the fullness, so making the tree
 * deeper only adds the new level, making it fuller only adds nodes, and a higher arity only adds
 * children in the higher slots.
 */
export function randomGeneralTreePaths(seed: number, depth: number, fullness: number, arity: number): string[] {
	// In the first three slots, which every arity has, so another arity keeps the same spine.
	let spine = ''
	for (let level = 0; level < depth - 1; level++) spine += Math.floor(chance(seed ^ 0x5bd1e995, String(level)) * Math.min(3, arity))
	const onSpine = (path: string) => path === spine.slice(0, path.length)

	const out: string[] = []
	const queue = depth > 0 ? [''] : []
	while (queue.length) {
		const path = queue.shift()!
		out.push(path)
		if (path.length >= depth - 1) continue
		for (let slot = 0; slot < arity; slot++) {
			const child = path + slot
			if (onSpine(child) || chance(seed, child) < fullness) queue.push(child)
		}
	}
	return out
}

const ROOT = 'n'

/**
 * A random general tree. Node ids are `n` + path, so they stay put as the sketch grows; children
 * are in slot order, with no gaps (a general tree has no left and right). Random fills give each node
 * the value for its place in a perfect tree, so values are stable too; sorted fills run in level order.
 */
export function generateGeneralTree(
	seed: number,
	depth: number,
	fullness: number,
	arity: number,
	fill: FillMode,
	range: FillRange = 'medium'
): TreeNode[] {
	const paths = randomGeneralTreePaths(seed, depth, fullness, arity)
	const exists = new Set(paths)
	const stablePerNode = fill === 'random' || fill === 'repeats' || fill === 'letters' || fill === 'empty'
	const values = stablePerNode
		? (() => {
				const all = fillValues(fill, seed, Math.max(...paths.map((p) => levelIndex(p, arity))) + 1, { range })
				return paths.map((p) => all[levelIndex(p, arity)])
			})()
		: fillValues(fill, seed, paths.length, { range })
	return paths.map((path, i) => ({
		id: ROOT + path,
		value: values[i],
		children: Array.from({ length: arity }, (_, slot) => path + slot)
			.filter((child) => exists.has(child))
			.map((child) => ROOT + child),
		dx: 0,
		dy: 0,
	}))
}

/**
 * The tree sketched again with another arity, from its seed and the drag that made it (the style
 * panel's Children per node, with it selected): raising the arity only adds children, lowering it
 * takes away those in the higher slots. Nodes the sketch made that are still there keep their values,
 * typed in or not (sorted fills keep only those typed in: the rest are sorted afresh); a new node whose
 * value is taken gets another. Nodes added by hand and drag offsets go: it is a new sketch.
 */
export function withArity(
	nodes: readonly TreeNode[],
	sketch: { seed: number; depth: number; fullness: number; fill: FillMode; range: FillRange },
	from: number,
	to: number
): TreeNode[] {
	const { seed, depth, fullness, fill, range } = sketch
	// The drag's depth, as deep as each arity allows (so going back gives back the levels).
	const levels = (arity: number) => Math.min(depth, maxDepth(arity))
	const sketched = new Map(generateGeneralTree(seed, levels(from), fullness, from, fill, range).map((n) => [n.id, n.value]))
	const current = new Map(nodes.map((n) => [n.id, n.value]))
	const perNode = fill === 'random' || fill === 'letters'
	const kept = (id: string) => {
		const value = current.get(id)
		return value !== undefined && sketched.has(id) && (perNode || fill === 'repeats' || value !== sketched.get(id)) ? value : undefined
	}
	const fresh = generateGeneralTree(seed, levels(to), fullness, to, fill, range)
	const used = new Set(fresh.flatMap((n) => kept(n.id) ?? []))
	return fresh.map((n, i) => {
		const value = kept(n.id) ?? (perNode && used.has(n.value) ? insertValue(undefined, undefined, fill, seed, i, [...used], range) : n.value)
		used.add(value)
		return { ...n, value }
	})
}
