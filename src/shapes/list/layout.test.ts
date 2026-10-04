import { describe, expect, it } from 'vitest'
import { listShapeMigrations, type ListDirection, type ListNode } from './list-shape-types'
import { HEAD_KEY, NULL_KEY, NULL_PREV_KEY, SENTINEL_KEY, TAIL_KEY, getListMetrics, listBasePosition, listHeadCentre, listScene } from './layout'

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

describe('list variants', () => {
	const edge = (scene: ReturnType<typeof listScene>, key: string) => scene.edges.find((e) => e.key === key)
	const ends = (scene: ReturnType<typeof listScene>) => Object.fromEntries(scene.edges.map((e) => [e.key, e.to]))

	it('doubly linked: wider nodes with a prev compartment; prev arrows back, in their own lane', () => {
		const scene = listScene({ ...props(3), links: 'doubly' })
		expect(at(scene, 'n0').w).toBeCloseTo(getListMetrics('m', true).nodeW)
		expect(at(scene, 'n0').pointer?.back).toBe(true)
		expect(ends(scene)).toMatchObject({ 'n1<-': 'n0', 'n2<-': 'n1', 'n0<-': NULL_PREV_KEY, 'n2->': NULL_KEY })
		expect(edge(scene, 'n1<-')).toMatchObject({ fromPointer: 'prev', bend: 0 })
		expect(edge(scene, 'n0->')?.lane).toBeGreaterThan(0)
	})

	it('tail pointer: a tail label pointing at the last node', () => {
		const scene = listScene({ ...props(3), tail: 'tail' })
		expect(ends(scene)[`${TAIL_KEY}->`]).toBe('n2')
		expect(at(scene, TAIL_KEY).y).toBeLessThan(at(scene, 'n2').y)
	})

	it('circular: no null; the last node loops back round to the first', () => {
		const scene = listScene({ ...props(3), ends: 'circular' })
		expect(scene.nodes.some((n) => n.key === NULL_KEY)).toBe(false)
		const back = edge(scene, 'n2->')!
		expect(back.to).toBe('n0')
		// Round under the list: out past n2, down, back along, in before n0.
		expect(back.via).toHaveLength(4)
		expect(back.via![1].y).toBeGreaterThan(at(scene, 'n0').y + M.nodeH / 2)
		expect(back.via![3].x).toBeLessThan(at(scene, 'n0').x - M.nodeW / 2)
	})

	it('sentinel: a dashed dummy node in front, which head points at', () => {
		const scene = listScene({ ...props(2), sentinel: 'sentinel' })
		expect(at(scene, SENTINEL_KEY)).toMatchObject({ ghost: true, editable: false, draggable: false })
		expect(ends(scene)).toMatchObject({ [`${HEAD_KEY}->`]: SENTINEL_KEY, [`${SENTINEL_KEY}->`]: 'n0' })
		expect(at(scene, 'n0').x - at(scene, SENTINEL_KEY).x).toBeCloseTo(M.step)
	})

	it('a cycle into the middle: the last node points back at that node', () => {
		const scene = listScene({ ...props(4), cycleTo: 'n1' })
		expect(edge(scene, 'n3->')?.to).toBe('n1')
		expect(scene.nodes.some((n) => n.key === NULL_KEY)).toBe(false)
		// A cycle into a node that isn't there is ignored.
		expect(edge(listScene({ ...props(2), cycleTo: 'n9' }), 'n1->')?.to).toBe(NULL_KEY)
	})

	it('a doubly linked circular list loops its first prev arrow round the top, to the last node', () => {
		const scene = listScene({ ...props(3), links: 'doubly', ends: 'circular' })
		const prev = edge(scene, 'n0<-')!
		expect(prev.to).toBe('n2')
		expect(prev.via![1].y).toBeLessThan(at(scene, HEAD_KEY).y)
	})
})

describe('linked stacks and queues', () => {
	const ends = (scene: ReturnType<typeof listScene>) => Object.fromEntries(scene.edges.map((e) => [e.key, e.to]))
	const label = (scene: ReturnType<typeof listScene>, key: string) => at(scene, key).value

	it("a stack's head is its top; empty, the top points at null where the first node goes", () => {
		expect(label(listScene({ ...props(2), kind: 'stack' }), HEAD_KEY)).toBe('top')
		const empty = listScene({ ...props(0), kind: 'stack' })
		expect(empty.nodes.map((n) => n.key).sort()).toEqual([HEAD_KEY, NULL_KEY])
		expect(ends(empty)).toEqual({ [`${HEAD_KEY}->`]: NULL_KEY })
		// The label above the null, as it would be above a first node.
		expect(at(empty, HEAD_KEY).y).toBeLessThan(at(empty, NULL_KEY).y)
	})

	it('a queue always has a rear; front and rear share a lone node, or point at null when empty', () => {
		const one = listScene({ ...props(1), kind: 'queue' })
		expect([label(one, HEAD_KEY), label(one, TAIL_KEY)]).toEqual(['front', 'rear'])
		expect(ends(one)).toMatchObject({ [`${HEAD_KEY}->`]: 'n0', [`${TAIL_KEY}->`]: 'n0' })
		expect(at(one, HEAD_KEY).x).toBeLessThan(at(one, TAIL_KEY).x)
		expect(ends(listScene({ ...props(0), kind: 'queue' }))).toEqual({ [`${HEAD_KEY}->`]: NULL_KEY, [`${TAIL_KEY}->`]: NULL_KEY })
	})

	it('circular, sentinel and cycles are for plain lists', () => {
		const scene = listScene({ ...props(3), kind: 'stack', ends: 'circular', sentinel: 'sentinel', cycleTo: 'n1' })
		expect(scene.nodes.some((n) => n.key === SENTINEL_KEY)).toBe(false)
		expect(ends(scene)['n2->']).toBe(NULL_KEY)
	})

	it('lists saved before kinds existed load as plain lists', () => {
		const step = listShapeMigrations.sequence.find((s) => {
			if (!('up' in s)) return false
			const props: Record<string, unknown> = {}
			s.up(props)
			return 'kind' in props
		})
		if (!step || !('up' in step) || typeof step.down !== 'function') throw new Error('expected a props migration')
		const old: Record<string, unknown> = {}
		step.up(old)
		expect(old.kind).toBe('list')
		step.down(old)
		expect(old).not.toHaveProperty('kind')
	})
})
