import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import { canMerge, canMergeSort, mergeSortList, mergeSortedLists } from './merge'
import { listScene } from './layout'

const list = (values: string[], from = 0) => ({
	nodes: values.map((value, i) => ({ id: `n${from + i}`, value, dx: 0, dy: 0 })),
	direction: 'right' as const,
	size: 'm' as const,
})

describe('merging two sorted lists', () => {
	it('every node of both, in order; a keeps its ids, b takes the ones given; none copied', () => {
		const op = mergeSortedLists(list(['1', '4', '7']), list(['2', '3', '9']), { x: 0, y: 200 }, ['n3', 'n4', 'n5'])
		expect(op.nodes.map((n) => [n.id, n.value])).toEqual([
			['n0', '1'],
			['n3', '2'],
			['n4', '3'],
			['n1', '4'],
			['n2', '7'],
			['n5', '9'],
		])
		// As merge(a, b) runs: compare, take, move on, tail moves on; then the rest, then return.
		expect(op.frames.map((f) => f.line)).toEqual([
			'start',
			...['a', 'b', 'b', 'a', 'a'].flatMap((x) => ['compare', `take-${x}`, `next-${x}`, 'advance']),
			'rest',
			'done',
		])
		expect(op.code).toBe('list-merge')
		// Each take re-points tail's next: the scene's arrows end as the merged order.
		const last = op.frames.at(-1)!.scene!
		const to = (from: string) => last.edges.find((e) => e.key === `${from}->`)!.to
		expect(['#dummy', 'n0', 'n3', 'n4', 'n1', 'n2'].map(to)).toEqual(['n0', 'n3', 'n4', 'n1', 'n2', 'n5'])
		// b is drawn where it was: a row below.
		expect(last.nodes.find((n) => n.key === 'n3')!.y - last.nodes.find((n) => n.key === 'n0')!.y).toBeCloseTo(200)
	})

	it('equal values: a’s first (≤), so equal values keep their order; b smaller first: head changes', () => {
		const tie = mergeSortedLists(list(['2', '5']), list(['2', '5']), { x: 0, y: 200 }, ['n2', 'n3'])
		expect(tie.nodes.map((n) => n.id)).toEqual(['n0', 'n2', 'n1', 'n3'])
		const op = mergeSortedLists(list(['4']), list(['1', '2']), { x: 0, y: 200 }, ['n1', 'n2'])
		expect(op.nodes.map((n) => n.value)).toEqual(['1', '2', '4'])
		expect(stateAt(op.frames, op.frames.length - 1).flash['edge:#head->']).toBe('orange')
		expect(op.frames.at(-1)!.scene!.edges.find((e) => e.key === '#head->')!.to).toBe('n1')
	})

	it('only plain singly linked lists, sorted, not empty', () => {
		expect(canMerge(list(['1', '4', '7']))).toBe(true)
		expect(canMerge(list(['1', '7', '4']))).toBe(false)
		expect(canMerge(list([]))).toBe(false)
		expect(canMerge({ ...list(['1']), links: 'doubly' })).toBe(false)
		expect(canMerge({ ...list(['1']), tail: 'tail' })).toBe(false)
		expect(canMerge({ ...list(['1']), ends: 'circular' })).toBe(false)
		expect(canMerge({ ...list(['1']), kind: 'stack' })).toBe(false)
	})
})

describe('merge sort on a linked list', () => {
	it('sorts by cutting at the middle and merging, every node kept, equal values in their order', () => {
		const op = mergeSortList(list(['7', '3', '9', '1', '6', '4']))
		expect(op.nodes.map((n) => n.value)).toEqual(['1', '3', '4', '6', '7', '9'])
		expect(op.code).toBe('list-merge-sort')
		const stable = mergeSortList(list(['2', '1', '2', '1']))
		expect(stable.nodes.map((n) => n.id)).toEqual(['n1', 'n3', 'n0', 'n2'])
	})

	it('steps as merge_sort runs: the middle, the cut, each half, then merge; five cuts and merges for six nodes', () => {
		const lines = mergeSortList(list(['7', '3', '9', '1', '6', '4'])).frames.map((f) => f.line)
		expect(lines.slice(0, 2)).toEqual(['middle', 'split'])
		expect(lines.filter((l) => l === 'split')).toHaveLength(5)
		expect(lines.filter((l) => l === 'merge')).toHaveLength(5)
		expect(lines.filter((l) => l === 'base')).toHaveLength(6)
		expect(lines.at(-1)).toBe('merge')
	})

	it('ends on the sorted list drawn where the list was, head on its first node', () => {
		const props = list(['7', '3', '9', '1'])
		const op = mergeSortList(props)
		const last = op.frames.at(-1)!.scene!
		const drawn = listScene({ ...props, nodes: op.nodes })
		for (const n of op.nodes) {
			const [a, b] = [last.nodes.find((x) => x.key === n.id)!, drawn.nodes.find((x) => x.key === n.id)!]
			expect([a.x, a.y]).toEqual([b.x, b.y])
		}
		expect(last.edges.find((e) => e.key === '#head->')!.to).toBe(op.nodes[0].id)
	})

	it('offered for plain singly linked lists of two nodes or more', () => {
		expect(canMergeSort(list(['3', '1']))).toBe(true)
		expect(canMergeSort(list(['3']))).toBe(false)
		expect(canMergeSort({ ...list(['3', '1']), links: 'doubly' })).toBe(false)
	})
})
