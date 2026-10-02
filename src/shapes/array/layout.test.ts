import { describe, expect, it } from 'vitest'
import { getArrayLayout, getArrayMetrics, getSketchPosition } from './layout'

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
		const lastCell = getArrayLayout(4, 'horizontal', metrics).cellAt(3)
		expect(pos.x + lastCell.x + metrics.cell / 2).toBe(origin.x)
	})

	it('leaves room for the index gutter on vertical arrays', () => {
		const pos = getSketchPosition(origin, { direction: 'vertical', sign: 1, count: 2 }, metrics)
		const first = getArrayLayout(2, 'vertical', metrics).cellAt(0)
		expect(pos.x + first.x + metrics.cell / 2).toBe(origin.x)
		expect(pos.y + first.y + metrics.cell / 2).toBe(origin.y)
	})
})

describe('getArrayLayout', () => {
	const metrics = getArrayMetrics({ size: 'm', showIndices: true })

	it('puts indices under a horizontal array', () => {
		const layout = getArrayLayout(5, 'horizontal', metrics)
		expect(layout).toMatchObject({ width: 5 * 48, height: 48 + metrics.gutter })
		expect(layout.indexAt(0).y).toBeGreaterThan(48)
	})

	it('drops the gutter when indices are hidden', () => {
		const layout = getArrayLayout(5, 'vertical', getArrayMetrics({ size: 'm', showIndices: false }))
		expect(layout).toMatchObject({ width: 48, height: 5 * 48 })
	})
})
