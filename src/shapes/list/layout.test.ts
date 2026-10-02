import { describe, expect, it } from 'vitest'
import type { ListDirection, ListNode } from './list-shape-types'
import { HEAD_KEY, NULL_KEY, getListMetrics, listBasePosition, listHeadCentre, listScene } from './layout'

const M = getListMetrics('m')
const nodes = (n: number): ListNode[] => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, value: String(i), dx: 0, dy: 0 }))
const props = (n: number, direction: ListDirection = 'right') => ({ nodes: nodes(n), direction, size: 'm' as const })
const at = (scene: ReturnType<typeof listScene>, key: string) => scene.nodes.find((n) => n.key === key)!

describe('listScene', () => {
	it('lays nodes out a step apart in list order', () => {
		const scene = listScene(props(3))
		expect(at(scene, 'n1').x - at(scene, 'n0').x).toBeCloseTo(M.step)
		expect(at(scene, 'n2').x - at(scene, 'n1').x).toBeCloseTo(M.step)
		expect(at(scene, 'n0').y).toBe(at(scene, 'n2').y)
	})

	it('chains next pointers to a null terminator and labels the head', () => {
		const { edges } = listScene(props(3))
		expect(edges.map((e) => [e.from, e.to])).toEqual([
			['n0', 'n1'],
			['n1', 'n2'],
			['n2', NULL_KEY],
			[HEAD_KEY, 'n0'],
		])
		expect(edges.filter((e) => e.fromPointer).length).toBe(3)
	})

	it('runs leftwards with mirrored nodes', () => {
		const scene = listScene(props(2, 'left'))
		expect(at(scene, 'n1').x).toBeLessThan(at(scene, 'n0').x)
		expect(at(scene, 'n0').pointer?.side).toBe('left')
		expect(at(scene, NULL_KEY).x).toBeLessThan(at(scene, 'n1').x)
	})

	it('runs downwards with the head label to the left', () => {
		const scene = listScene(props(2, 'down'))
		expect(at(scene, 'n1').y).toBeGreaterThan(at(scene, 'n0').y)
		expect(at(scene, HEAD_KEY).x).toBeLessThan(at(scene, 'n0').x)
		expect(at(scene, NULL_KEY).y).toBeGreaterThan(at(scene, 'n1').y)
	})

	it('normalises the layout to start at (0, 0)', () => {
		for (const direction of ['right', 'left', 'down', 'up'] as const) {
			const scene = listScene(props(4, direction))
			expect(Math.min(...scene.nodes.map((n) => n.x - n.w / 2))).toBeCloseTo(0)
			expect(Math.min(...scene.nodes.map((n) => n.y - n.h / 2))).toBeCloseTo(0)
		}
	})

	it('applies drag offsets; annotations follow the head and tail', () => {
		const moved = props(3)
		moved.nodes[0] = { ...moved.nodes[0], dx: 10, dy: 20 }
		moved.nodes[2] = { ...moved.nodes[2], dx: 0, dy: -30 }
		const base = listScene(props(3))
		const scene = listScene(moved)
		expect(at(scene, 'n0').x - at(base, 'n0').x).toBe(10)
		expect(at(scene, HEAD_KEY).y - at(base, HEAD_KEY).y).toBe(20)
		expect(at(scene, 'n1')).toEqual(at(base, 'n1'))
		expect(at(scene, NULL_KEY).y - at(base, NULL_KEY).y).toBe(-30)
	})
})

describe('listBasePosition / listHeadCentre', () => {
	it('ignores offsets', () => {
		const moved = props(2)
		moved.nodes[1] = { ...moved.nodes[1], dx: 50, dy: 50 }
		expect(listBasePosition(moved, 'n1')).toEqual(listBasePosition(props(2), 'n1'))
	})

	it('finds the head node centre', () => {
		const scene = listScene(props(3, 'left'))
		expect(listHeadCentre(props(3, 'left'))).toEqual({ x: at(scene, 'n0').x, y: at(scene, 'n0').y })
	})
})
