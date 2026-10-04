import { describe, expect, it } from 'vitest'
import { getArrayGrowPoint, getArrayLayout, getArrayMetrics, getSketchPosition, hoveredCell, indexAlong } from './layout'

describe('getSketchPosition', () => {
	const metrics = getArrayMetrics({ size: 'm', showIndices: true })
	const origin = { x: 200, y: 100 }

	it('keeps the first cell centred on the origin when growing right', () => {
		expect(getSketchPosition(origin, { direction: 'horizontal', sign: 1, count: 4 }, metrics)).toEqual({
			x: 176,
			y: 76,
		})
	})

	it('shifts left as a leftward sketch grows, so the first cell stays put', () => {
		const pos = getSketchPosition(origin, { direction: 'horizontal', sign: -1, count: 4 }, metrics)
		const lastCell = getArrayLayout(4, metrics).cellAt(3)
		expect(pos.x + lastCell.x + metrics.cell / 2).toBe(origin.x)
	})

	it('leaves room for the index gutter on vertical arrays', () => {
		const vertical = getArrayMetrics({ size: 'm', showIndices: true, direction: 'vertical' })
		const pos = getSketchPosition(origin, { direction: 'vertical', sign: 1, count: 2 }, vertical)
		const first = getArrayLayout(2, vertical).cellAt(0)
		expect(pos.x + first.x + metrics.cell / 2).toBe(origin.x)
		expect(pos.y + first.y + metrics.cell / 2).toBe(origin.y)
	})
})

describe('getArrayLayout', () => {
	const metrics = getArrayMetrics({ size: 'm', showIndices: true })

	it('puts indices under a horizontal array', () => {
		const layout = getArrayLayout(5, metrics)
		expect(layout).toMatchObject({ width: 5 * 48, height: 48 + metrics.gutter })
		expect(layout.indexAt(0).y).toBeGreaterThan(48)
	})

	it('drops the gutter when indices are hidden', () => {
		const layout = getArrayLayout(5, getArrayMetrics({ size: 'm', showIndices: false, direction: 'vertical' }))
		expect(layout).toMatchObject({ width: 48, height: 5 * 48 })
	})
})

describe('hoveredCell', () => {
	const metrics = getArrayMetrics({ size: 'm', showIndices: true })
	it('finds the cell and the nearest boundary, with some reach around the cells', () => {
		expect(hoveredCell({ x: 60, y: 24 }, 4, metrics, 16)).toEqual({ index: 1, boundary: 1 })
		expect(hoveredCell({ x: 90, y: 24 }, 4, metrics, 16)).toEqual({ index: 1, boundary: 2 })
		expect(hoveredCell({ x: 200, y: -10 }, 4, metrics, 16)).toEqual({ index: 3, boundary: 4 })
		expect(hoveredCell({ x: 60, y: -30 }, 4, metrics, 16)).toBeUndefined()
		// Above the cells, the corner nearest the pointer: cell 0's x sits on boundary 1.
		expect(hoveredCell({ x: 50, y: -8 }, 4, metrics, 16)).toEqual({ index: 0, boundary: 1 })
	})
	it('runs down a vertical array', () => {
		const vertical = getArrayMetrics({ size: 'm', showIndices: true, direction: 'vertical' })
		const gutter = vertical.gutter
		expect(hoveredCell({ x: gutter + 24, y: 100 }, 3, vertical, 16)).toEqual({ index: 2, boundary: 2 })
		// Right of the cells, the corner nearest: cell 1's x sits at the top of cell 1.
		expect(hoveredCell({ x: gutter + 52, y: 45 }, 3, vertical, 16)).toEqual({ index: 1, boundary: 1 })
	})
})

describe('upright arrays (stacks)', () => {
	const stack = (n: number, extra: object = {}) => getArrayMetrics({ size: 'm', showIndices: true, kind: 'stack', values: Array(n).fill('1'), ...extra })

	it('stack index 0 at the bottom, at the origin, which rises as cells are added', () => {
		const three = stack(3)
		expect(three.axis).toBe('up')
		const layout = getArrayLayout(3, three)
		expect(layout.cellAt(0).y).toBe(2 * 48)
		expect(layout.cellAt(2).y).toBe(0)
		expect(layout.box).toMatchObject({ y: 0, h: 3 * 48 })
		expect(stack(4).origin.y - three.origin.y).toBe(48)
		// The line between cells 0 and 1 is the bottom of cell 1.
		expect(layout.boundaryAt(1)).toBe(2 * 48)
	})

	it('finds indices counting up, and grows its grip above the top', () => {
		const m = stack(3)
		const gutter = m.gutter
		expect(indexAlong({ x: gutter + 10, y: 130 }, 3, m)).toBe(0)
		expect(indexAlong({ x: gutter + 10, y: 10 }, 3, m)).toBe(2)
		expect(getArrayGrowPoint(3, m).y).toBe(-24)
	})

	it('sketches up from the press point whichever way the drag goes', () => {
		const m = stack(3)
		const pos = getSketchPosition({ x: 200, y: 300 }, { direction: 'vertical', sign: 1, count: 3 }, m)
		// The tool then moves the shape back by the metrics' origin.
		const first = getArrayLayout(3, m).cellAt(0)
		expect(pos.y - m.origin.y + first.y + 24).toBe(300)
		expect(pos.x - m.origin.x + first.x + 24).toBe(200)
	})

	it('a queue lies in a row, with room above for its front and rear markers', () => {
		const q = getArrayMetrics({ size: 'm', showIndices: true, kind: 'queue', direction: 'vertical', values: ['1', '2'] })
		expect(q.axis).toBe('horizontal')
		expect(q.origin.y).toBeGreaterThan(0)
	})
})
