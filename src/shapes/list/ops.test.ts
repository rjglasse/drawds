import { describe, expect, it } from 'vitest'
import { listBasePosition } from './layout'
import type { ListDirection, ListNode } from './list-shape-types'
import { anchorShift, insertListNode, removeListNode, resizeList } from './ops'

const node = (id: string, value = id): ListNode => ({ id, value, dx: 0, dy: 0 })
const props = (nodes: ListNode[], direction: ListDirection = 'right') => ({
	nodes,
	direction,
	size: 'm' as const,
	fill: 'random' as const,
	seed: 42,
})
const ids = (nodes: ListNode[]) => nodes.map((n) => n.id)

describe('resizeList', () => {
	const three = [node('n0', 'a'), node('n1', 'b'), node('n2', 'c')]

	it('appends and trims at the tail', () => {
		expect(ids(resizeList(props(three), 5, false))).toEqual(['n0', 'n1', 'n2', 'n3', 'n4'])
		expect(ids(resizeList(props(three), 1, false))).toEqual(['n0'])
	})

	it('prepends and trims at the head, keeping existing nodes intact', () => {
		const grown = resizeList(props(three), 5, true)
		expect(grown.slice(2)).toEqual(three)
		expect(ids(resizeList(props(three), 1, true))).toEqual(['n2'])
	})

	it('numbers new head nodes from the old head outwards, so ids are stable while dragging', () => {
		const one = resizeList(props(three), 4, true)
		const two = resizeList(props(three), 5, true)
		expect(one[0]).toEqual(two[1])
	})

	it('never reuses an id', () => {
		const gappy = [node('n0'), node('n7')]
		expect(ids(resizeList(props(gappy), 3, false))).toEqual(['n0', 'n7', 'n8'])
	})
})

describe('insertListNode', () => {
	it('inserts after a node with a fresh id', () => {
		const { nodes, id } = insertListNode(props([node('n0'), node('n1'), node('n2')]), 'n0')
		expect(id).toBe('n3')
		expect(ids(nodes)).toEqual(['n0', 'n3', 'n1', 'n2'])
	})

	it('inserts after the tail', () => {
		expect(ids(insertListNode(props([node('n0'), node('n1')]), 'n1').nodes)).toEqual(['n0', 'n1', 'n2'])
	})

	it('keeps an ascending list ascending', () => {
		const sorted = { ...props([node('n0', '10'), node('n1', '20')]), fill: 'ascending' as const }
		const value = Number(insertListNode(sorted, 'n0').nodes[1].value)
		expect(value).toBeGreaterThanOrEqual(10)
		expect(value).toBeLessThanOrEqual(20)
	})

	it('keeps the head still', () => {
		const before = props([node('n0'), node('n1')])
		expect(anchorShift(before, props(insertListNode(before, 'n0').nodes))).toEqual({ x: 0, y: 0 })
	})
})

describe('removeListNode', () => {
	it('removes one node by id', () => {
		expect(ids(removeListNode([node('n0'), node('n1'), node('n2')], 'n1'))).toEqual(['n0', 'n2'])
	})
})

describe('anchorShift', () => {
	const pos = (p: ReturnType<typeof props>, id: string) => listBasePosition(p, id)!
	const keepsStill = (before: ReturnType<typeof props>, after: ReturnType<typeof props>, id: string) => {
		const shift = anchorShift(before, after)
		expect(pos(after, id).x + shift.x).toBeCloseTo(pos(before, id).x)
		expect(pos(after, id).y + shift.y).toBeCloseTo(pos(before, id).y)
	}

	it('keeps the old head still when nodes are prepended', () => {
		const before = props([node('n0'), node('n1')])
		keepsStill(before, props(resizeList(before, 4, true)), 'n0')
	})

	it('keeps the next node still when the head is removed', () => {
		const before = props([node('n0'), node('n1'), node('n2')], 'up')
		keepsStill(before, props(removeListNode(before.nodes, 'n0'), 'up'), 'n1')
	})

	it('keeps the head still for left-running lists growing at the tail', () => {
		const before = props([node('n0'), node('n1')], 'left')
		keepsStill(before, props(resizeList(before, 5, false), 'left'), 'n0')
	})
})
