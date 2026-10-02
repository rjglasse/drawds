import { fillValues, type FillMode } from '../../data/fill'
import { mulberry32 } from '../../data/random'
import type { TreeNode } from './tree-shape-types'

/** Deepest tree the sketch gesture makes (a perfect tree of this depth has 63 nodes). */
export const MAX_DEPTH = 6

/** Hash a node's path (e.g. "LRL") with the seed to a number in [0, 1). */
function chance(seed: number, path: string): number {
	let h = 0x811c9dc5
	for (let i = 0; i < path.length; i++) h = Math.imul(h ^ path.charCodeAt(i), 0x01000193)
	return mulberry32((seed ^ h ^ (path.length * 0x9e3779b1)) >>> 0)()
}

/** Position of a path in a perfect binary tree, in level order (root 0, its children 1 and 2, ...). */
export function levelIndex(path: string): number {
	let index = 2 ** path.length - 1
	for (let i = 0; i < path.length; i++) if (path[i] === 'R') index += 2 ** (path.length - 1 - i)
	return index
}

/**
 * Paths (from the root: '' is the root, 'L' its left child...) of a random binary tree with exactly
 * `depth` levels, in level order. Every child exists with probability `fullness`, except along a
 * seeded spine that guarantees the depth: fullness 0 is a bare stick, 1 a perfect tree.
 *
 * Whether a path exists depends only on the seed, the path and the fullness, so making the tree
 * deeper only adds the new level, and making it fuller only adds nodes.
 */
export function randomTreePaths(seed: number, depth: number, fullness: number): string[] {
	const spineSide = (level: number) => (chance(seed ^ 0x5bd1e995, String(level)) < 0.5 ? 'L' : 'R')
	let spine = ''
	const onSpine = (path: string) => path === spine.slice(0, path.length)
	for (let level = 0; level < depth - 1; level++) spine += spineSide(level)

	const out: string[] = []
	const queue = depth > 0 ? [''] : []
	while (queue.length) {
		const path = queue.shift()!
		out.push(path)
		if (path.length >= depth - 1) continue
		for (const side of ['L', 'R']) {
			const child = path + side
			if (onSpine(child) || chance(seed, child) < fullness) queue.push(child)
		}
	}
	return out
}

const ROOT = 'n'

/**
 * A random binary tree. Node ids are `n` + path, so they stay put as the sketch grows. Random
 * fills give each node the value for its place in a perfect tree, so values are stable too; sorted
 * fills run in level order.
 */
export function generateTree(seed: number, depth: number, fullness: number, fill: FillMode): TreeNode[] {
	const paths = randomTreePaths(seed, depth, fullness)
	const exists = new Set(paths)
	const stablePerNode = fill === 'random' || fill === 'repeats' || fill === 'letters' || fill === 'empty'
	const values = stablePerNode
		? (() => {
				const all = fillValues(fill, seed, Math.max(...paths.map(levelIndex)) + 1)
				return paths.map((p) => all[levelIndex(p)])
			})()
		: fillValues(fill, seed, paths.length)
	return paths.map((path, i) => ({
		id: ROOT + path,
		value: values[i],
		children: ['L', 'R'].map((side) => (exists.has(path + side) ? ROOT + path + side : null)),
		dx: 0,
		dy: 0,
	}))
}
