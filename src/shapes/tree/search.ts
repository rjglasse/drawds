import { compareKeys } from '../../data/compare'
import type { Frame } from '../../nodelink/playback'
import type { Pointer } from '../../pointers/pointers'
import { nullKey } from './layout'
import type { TreeNode } from './tree-shape-types'

/** Ids of the subtree under `id` (itself included), with the null markers of its empty slots. */
function subtree(index: ReadonlyMap<string, TreeNode>, id: string): string[] {
	const node = index.get(id)
	if (!node) return []
	return [
		id,
		...node.children.flatMap((child, slot) => (child && index.has(child) ? subtree(index, child) : [nullKey(id, slot)])),
	]
}

/**
 * Search a BST for `key`: curr walks down from the root comparing, and each comparison rules out
 * one subtree (faded), as binary search rules out half an array, until curr finds the key or
 * falls off at an empty slot (its null marker, when nulls are shown).
 */
export function bstSearch(nodes: readonly TreeNode[], key: string, { nulls = false } = {}): { frames: Frame[]; found?: string } {
	const index = new Map(nodes.map((n) => [n.id, n]))
	const frames: Frame[] = []
	const curr = (at: string): Pointer[] => [{ id: '#curr', name: 'curr', at }]
	const dim: string[] = []
	let node = nodes[0]
	let comparisons = 1
	let how = `curr = root (${node.value})`
	let prev: string | undefined
	// Predict mode: after the start, every step answers the same question about the node curr is on.
	let ask: Pick<Frame, 'ask' | 'askFocus'> = { ask: `Search for ${key}: where does curr start?` }
	for (;;) {
		frames.push({
			pointers: curr(node.id),
			flash: { [node.id]: 'orange', ...(prev ? { [prev]: null } : {}) },
			dim: [...dim],
			counts: { comparisons },
			caption: `${how}. Is it ${key}?`,
			...ask,
		})
		ask = { ask: `${key} vs ${node.value}: what next?`, askFocus: [node.id] }
		const cmp = compareKeys(key, node.value)
		if (cmp === 0) {
			frames.push({
				pointers: curr(node.id),
				flash: { [node.id]: 'green' },
				caption: `Yes: found ${key}, after ${comparisons} comparison${comparisons === 1 ? '' : 's'}`,
				...ask,
			})
			return { frames, found: node.id }
		}
		const slot = cmp < 0 ? 0 : 1
		const [sign, side, otherSide] = slot === 0 ? ['<', 'left', 'right'] : ['>', 'right', 'left']
		const other = node.children[1 - slot]
		dim.push(...(other && index.has(other) ? subtree(index, other) : [nullKey(node.id, 1 - slot)]))
		const next = node.children[slot]
		if (!next || !index.has(next)) {
			frames.push({
				pointers: nulls ? curr(nullKey(node.id, slot)) : [],
				flash: { [node.id]: null },
				dim: [...subtree(index, nodes[0].id)],
				caption: `${key} ${sign} ${node.value}, but ${node.value} has no ${side} child: curr = null, so ${key} is not in the tree`,
				...ask,
			})
			return { frames }
		}
		how = `${key} ${sign} ${node.value}, so it can't be on the ${otherSide}: curr = curr.${side} (${index.get(next)!.value})`
		prev = node.id
		node = index.get(next)!
		comparisons++
	}
}
