import { describe, expect, it } from 'vitest'
import { routeEdge } from './geometry'
import { hoveredEdge, hoveredNode } from './hover'
import type { SceneNode } from './scene'

const node = (key: string, x: number, y: number): SceneNode => ({
	key,
	kind: 'box',
	x,
	y,
	w: 40,
	h: 40,
	value: key,
	editable: true,
	draggable: true,
})
const a = node('a', 0, 0)
const b = node('b', 200, 0)

describe('hoveredNode', () => {
	it('finds the node under the pointer, or just outside it within reach', () => {
		expect(hoveredNode([a, b], { x: 5, y: 5 }, 16)).toBe('a')
		expect(hoveredNode([a, b], { x: 30, y: -30 }, 16)).toBe('a')
		expect(hoveredNode([a, b], { x: 100, y: 0 }, 16)).toBeUndefined()
	})
})

describe('hoveredEdge', () => {
	const routes = new Map([['ab', routeEdge(a, b)]])
	it('finds an edge near its path', () => {
		expect(hoveredEdge(routes, ['ab'], { x: 60, y: 10 }, 16)).toBe('ab')
		expect(hoveredEdge(routes, ['ab'], { x: 60, y: 40 }, 16)).toBeUndefined()
	})
	it('only considers the given edges', () => {
		expect(hoveredEdge(routes, [], { x: 60, y: 0 }, 16)).toBeUndefined()
	})
})
