import { describe, expect, it } from 'vitest'
import { arrayShapeMigrations } from '../shapes/array/array-shape-types'
import { graphShapeMigrations } from '../shapes/graph/graph-shape-types'
import { heapShapeMigrations } from '../shapes/heap/heap-shape-types'
import { listShapeMigrations } from '../shapes/list/list-shape-types'
import { treeShapeMigrations } from '../shapes/tree/tree-shape-types'
import { placePointers, pointerAt, type PointerAnchor } from './layout'
import { movePointer, placePointer, prunePointers, removePointer, renamePointer, type Pointer } from './pointers'

describe('pointer model', () => {
	it('places a pointer by name: adds it, or moves the one already called that', () => {
		let ps = placePointer([], 'i', '0')
		ps = placePointer(ps, 'j', '3')
		expect(ps).toEqual([
			{ id: 'p0', name: 'i', at: '0' },
			{ id: 'p1', name: 'j', at: '3' },
		])
		expect(placePointer(ps, 'i', '5')).toEqual([
			{ id: 'p0', name: 'i', at: '5' },
			{ id: 'p1', name: 'j', at: '3' },
		])
		expect(placePointer(removePointer(ps, 'p0'), 'k', '1').map((p) => p.id)).toEqual(['p1', 'p2'])
	})

	it('moves, renames (a pointer with the new name goes), removes and prunes', () => {
		const ps: Pointer[] = [
			{ id: 'p0', name: 'lo', at: '0' },
			{ id: 'p1', name: 'hi', at: '7' },
		]
		expect(movePointer(ps, 'p1', '6')[1].at).toBe('6')
		expect(renamePointer(ps, 'p0', 'hi')).toEqual([{ id: 'p0', name: 'hi', at: '0' }])
		expect(prunePointers(ps, ['0', '1'])).toEqual([ps[0]])
	})
})

describe('placePointers', () => {
	const box = { x: 0, y: 100, w: 40, h: 40 }
	const anchors: Record<string, PointerAnchor> = {
		a: { box, side: 'above' },
		b: { box: { ...box, x: 100 }, side: 'below' },
		c: { box: { ...box, x: 200 }, side: 'right' },
	}
	const at = (key: string) => anchors[key]

	it('puts pointers on one element side by side above it, each arrow ending on its top edge', () => {
		const placed = placePointers(
			[
				{ id: 'p0', name: 'lo', at: 'a' },
				{ id: 'p1', name: 'mid', at: 'a' },
			],
			at,
			14
		)
		const [lo, mid] = placed
		expect(lo.label.x + lo.label.w).toBeLessThan(mid.label.x)
		expect(lo.label.y + lo.label.h).toBeLessThan(box.y)
		for (const p of placed) {
			expect(p.tip.y).toBe(box.y)
			expect(p.tip.x).toBeGreaterThan(box.x)
			expect(p.tip.x).toBeLessThan(box.x + box.w)
		}
	})

	it('puts them below or beside when the element says so, and skips pointers with no anchor', () => {
		const placed = placePointers(
			[
				{ id: 'p0', name: 'curr', at: 'b' },
				{ id: 'p1', name: 'x', at: 'c' },
				{ id: 'p2', name: 'gone', at: 'z' },
			],
			at,
			14
		)
		expect(placed.map((p) => p.pointer.name)).toEqual(['curr', 'x'])
		expect(placed[0].label.y).toBeGreaterThan(box.y + box.h)
		expect(placed[1].label.x).toBeGreaterThan(200 + box.w)
		expect(pointerAt(placed, { x: placed[1].label.x + 2, y: placed[1].label.y + 2 })?.pointer.name).toBe('x')
	})
})

describe('pointer migrations', () => {
	const sequences = { arrayShapeMigrations, listShapeMigrations, treeShapeMigrations, heapShapeMigrations, graphShapeMigrations }
	for (const [name, sequence] of Object.entries(sequences)) {
		it(`${name}: shapes saved before pointers get none`, () => {
			// The step that adds pointers (later steps may follow it).
			const step = sequence.sequence.find((s) => {
				if (!('up' in s)) return false
				const props: Record<string, unknown> = { marks: {}, values: [] }
				s.up(props)
				return 'pointers' in props
			})
			if (!step || !('up' in step) || typeof step.down !== 'function') throw new Error('expected a props migration')
			const props: Record<string, unknown> = { marks: {} }
			step.up(props)
			expect(props.pointers).toEqual([])
			step.down(props)
			expect(props).not.toHaveProperty('pointers')
		})
	}
})
