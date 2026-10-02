import { describe, expect, it } from 'vitest'
import {
	badgeDirection,
	bendFor,
	boundaryPoint,
	nodeContains,
	pointerAnchor,
	routeEdge,
	routeScene,
	spatialNeighbor,
	valueBox,
} from './geometry'
import type { Scene, SceneEdge, SceneNode } from './scene'

const node = (key: string, x: number, y: number, kind: SceneNode['kind'] = 'box', w = 40, h = 40): SceneNode => ({
	key,
	kind,
	x,
	y,
	w,
	h,
	value: key,
	editable: true,
	draggable: true,
})

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
	expect(a.x).toBeCloseTo(b.x)
	expect(a.y).toBeCloseTo(b.y)
}

describe('boundaryPoint', () => {
	it('clips to a circle', () => {
		close(boundaryPoint(node('a', 0, 0, 'circle'), { x: 100, y: 0 }), { x: 20, y: 0 })
		const diag = boundaryPoint(node('a', 0, 0, 'circle'), { x: 10, y: 10 })
		expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(20)
	})

	it('clips to a box', () => {
		close(boundaryPoint(node('a', 0, 0), { x: 100, y: 0 }), { x: 20, y: 0 })
		close(boundaryPoint(node('a', 0, 0), { x: 100, y: 100 }), { x: 20, y: 20 })
		close(boundaryPoint(node('a', 0, 0, 'box', 80, 20), { x: 0, y: -50 }), { x: 0, y: -10 })
	})
})

describe('routeEdge', () => {
	it('runs a straight edge between the outlines', () => {
		const route = routeEdge(node('a', 0, 0), node('b', 200, 0))
		expect(route.points).toEqual([
			{ x: 20, y: 0 },
			{ x: 180, y: 0 },
		])
		expect(route.angle).toBeCloseTo(0)
		close(route.labelAt, { x: 100, y: 0 })
	})

	it('starts a pointer edge from the pointer compartment', () => {
		const listNode = { ...node('a', 0, 0, 'list-node', 72, 48), pointer: { side: 'right' as const, width: 24 } }
		const route = routeEdge(listNode, node('b', 200, 0), { fromPointer: true })
		close(route.points[0], pointerAnchor(listNode))
		close(route.points[0], { x: 24, y: 0 })
		// The label sits mid-way along the visible part, from the node's edge (36) to b's edge (180).
		close(route.labelAt, { x: 108, y: 0 })
		expect(valueBox(listNode)).toEqual({ x: -36, y: -24, w: 48, h: 48 })
	})

	it('runs a pointer edge straight down to a node below', () => {
		const listNode = { ...node('a', 0, 0, 'list-node', 72, 48), pointer: { side: 'right' as const, width: 24 } }
		const route = routeEdge(listNode, node('b', 0, 150, 'list-node', 72, 48), { fromPointer: true })
		close(route.points[1], { x: 24, y: 126 })
	})

	it('bows a curved edge to the left of its direction', () => {
		const route = routeEdge(node('a', 0, 0), node('b', 200, 0), { bend: 0.2 })
		expect(route.labelAt.y).toBeLessThan(0)
		const back = routeEdge(node('b', 200, 0), node('a', 0, 0), { bend: 0.2 })
		expect(back.labelAt.y).toBeGreaterThan(0)
	})

	it('loops a self edge above the node', () => {
		const route = routeEdge(node('a', 0, 0), node('a', 0, 0))
		expect(route.labelAt.y).toBeLessThan(-20)
		expect(route.d.startsWith('M')).toBe(true)
	})
})

describe('bendFor / routeScene', () => {
	const edges: SceneEdge[] = [
		{ key: 'ab', from: 'a', to: 'b', directed: true },
		{ key: 'ba', from: 'b', to: 'a', directed: true },
		{ key: 'bc', from: 'b', to: 'c', directed: true },
	]

	it('curves only directed edges with a reverse twin', () => {
		expect(bendFor(edges[0], edges)).not.toBe(0)
		expect(bendFor(edges[1], edges)).not.toBe(0)
		expect(bendFor(edges[2], edges)).toBe(0)
	})

	it('routes edges whose nodes exist', () => {
		const scene = { nodes: [node('a', 0, 0), node('b', 100, 0)], edges, metrics: { fontSize: 20, labelFontSize: 14, strokeWidth: 2 } }
		expect([...routeScene(scene).keys()]).toEqual(['ab', 'ba'])
	})
})

describe('nodeContains', () => {
	it('uses the outline shape', () => {
		expect(nodeContains(node('a', 0, 0, 'circle'), { x: 15, y: 15 })).toBe(false)
		expect(nodeContains(node('a', 0, 0), { x: 15, y: 15 })).toBe(true)
	})
})

describe('spatialNeighbor', () => {
	const cells = [
		{ key: 'c', x: 0, y: 0 },
		{ key: 'r', x: 100, y: 10 },
		{ key: 'far-r', x: 300, y: 0 },
		{ key: 'd', x: 0, y: 100 },
		{ key: 'diag', x: 100, y: 120 },
	]

	it('finds the nearest cell in a direction', () => {
		expect(spatialNeighbor(cells[0], cells, 'right')?.key).toBe('r')
		expect(spatialNeighbor(cells[0], cells, 'down')?.key).toBe('d')
		expect(spatialNeighbor(cells[0], cells, 'left')).toBeUndefined()
	})
})

describe('badgeDirection', () => {
	const circle = (key: string, x: number, y: number): SceneNode => ({
		key,
		kind: 'circle',
		x,
		y,
		w: 40,
		h: 40,
		value: key,
		editable: true,
		draggable: true,
	})
	const scene = (edges: [string, string][]): Scene => ({
		nodes: [circle('a', 0, 0), circle('nw', -100, -100), circle('ne', 100, -100)],
		edges: edges.map(([from, to]) => ({ key: from + to, from, to, directed: true })),
		metrics: { fontSize: 20, labelFontSize: 14, strokeWidth: 2 },
	})

	it('prefers the upper left, but moves away from an edge arriving there', () => {
		const a = scene([]).nodes[0]
		const free = badgeDirection(a, scene([]))
		expect([free.x, free.y].map((v) => v.toFixed(3))).toEqual(['-0.707', '-0.707'])
		const away = badgeDirection(a, scene([['nw', 'a']]))
		expect([away.x, away.y].map((v) => v.toFixed(3))).toEqual(['0.707', '-0.707'])
		const both = badgeDirection(a, scene([['nw', 'a'], ['a', 'ne']]))
		expect(both.y).toBeGreaterThanOrEqual(0)
	})
})
