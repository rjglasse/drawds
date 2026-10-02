import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import { generateTree } from './generate'
import { traverseTree, type TreeOrder } from './traverse'
import type { TreeNode } from './tree-shape-types'

/** The textbook recursive traversals, as the reference. */
function reference(nodes: readonly TreeNode[], start: string, order: TreeOrder): string[] {
	const byId = new Map(nodes.map((n) => [n.id, n]))
	const out: string[] = []
	if (order === 'level') {
		const queue = [start]
		while (queue.length) {
			const id = queue.shift()!
			out.push(id)
			for (const c of byId.get(id)!.children) if (c && byId.has(c)) queue.push(c)
		}
		return out
	}
	const walk = (id: string | null) => {
		if (!id || !byId.has(id)) return
		const [l, r] = byId.get(id)!.children
		if (order === 'pre') out.push(id)
		walk(l)
		if (order === 'in') out.push(id)
		walk(r)
		if (order === 'post') out.push(id)
	}
	walk(start)
	return out
}

const orders: TreeOrder[] = ['pre', 'in', 'post', 'level']
const trees = [1, 2, 3, 7, 42].map((seed) => generateTree(seed, 4, 0.6, 'random'))

describe('traverseTree', () => {
	it('visits nodes in the textbook order, from the root or any subtree', () => {
		for (const nodes of trees) {
			for (const order of orders) {
				expect(traverseTree(nodes, nodes[0].id, order).visited).toEqual(reference(nodes, nodes[0].id, order))
				const sub = nodes[1]
				if (sub) expect(traverseTree(nodes, sub.id, order).visited).toEqual(reference(nodes, sub.id, order))
			}
		}
	})

	it('ends with every visited node blue and numbered, nothing else lit, the call stack empty', () => {
		for (const nodes of trees) {
			for (const order of orders) {
				const { frames, visited } = traverseTree(nodes, nodes[0].id, order)
				const end = stateAt(frames, frames.length - 1)
				expect(end.flash).toEqual(Object.fromEntries(visited.map((id) => [id, 'blue'])))
				expect(end.badges).toEqual(Object.fromEntries(visited.map((id, i) => [id, String(i + 1)])))
				expect(end.strips?.[0].items).toEqual([])
				expect(end.strips?.[1].items).toEqual(visited.map((id) => nodes.find((n) => n.id === id)!.value))
			}
		}
	})

	// n
	// ├ nL
	// │ └ nLR
	// └ nR
	const small: TreeNode[] = [
		{ id: 'n', value: '5', children: ['nL', 'nR'], dx: 0, dy: 0 },
		{ id: 'nL', value: '2', children: [null, 'nLR'], dx: 0, dy: 0 },
		{ id: 'nLR', value: '3', children: [null, null], dx: 0, dy: 0 },
		{ id: 'nR', value: '8', children: [null, null], dx: 0, dy: 0 },
	]

	it('narrates the walk: go left, back up, visit, go right', () => {
		const captions = traverseTree(small, 'n', 'in').frames.map((f) => f.caption)
		expect(captions).toEqual([
			'Start at 5: its left subtree first',
			'Go left to 2: its left subtree first',
			'Visit 2 (1), then its right subtree',
			'Go right to 3',
			'Visit 3 (2)',
			'Back at 5, visit it (3), then its right subtree',
			'Go right to 8',
			'Visit 8 (4)',
			'Done: in-order visits 2, 3, 5, 8',
		])
		expect(traverseTree(small, 'n', 'pre').frames.map((f) => f.caption)[3]).toBe('Back at 5, go right to 8: visit it (4)')
		expect(traverseTree(small, 'n', 'level').frames.map((f) => f.caption)[1]).toBe('Dequeue 5: visit it (1), queue 2 and 8')
	})

	it('lights the path down from the start while the recursion is there, and shows nulls as base cases', () => {
		const { frames } = traverseTree(small, 'n', 'pre', { nulls: true })
		const at3 = frames.findIndex((f) => f.caption?.includes('to 3'))
		const state = stateAt(frames, at3)
		expect(state.flash['edge:n->nL']).toBe('orange')
		expect(state.flash['edge:nL->nLR']).toBe('orange')
		expect(state.flash.nLR).toBe('red')
		expect(state.strips?.[0].items).toEqual(['5', '2', '3'])
		const nullStep = frames.findIndex((f) => f.caption === "2's left child is null: nothing to do")
		expect(stateAt(frames, nullStep).flash['#null:nL:0']).toBe('orange')
		expect(stateAt(frames, nullStep + 1).flash['#null:nL:0']).toBeUndefined()
	})
})
