import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import { canMerge, mergeSortedLists } from './merge'

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
