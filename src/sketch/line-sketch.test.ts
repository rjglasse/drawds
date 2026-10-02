import { describe, expect, it } from 'vitest'
import { INITIAL_SKETCH, nextSketchState, type SketchState } from './line-sketch'

const STEP = 48

/** Feed a sequence of pointer offsets through the sketch, as pointer-move events would. */
function drag(...points: [number, number][]): SketchState {
	return points.reduce((s, [dx, dy]) => nextSketchState(s, dx, dy, STEP), INITIAL_SKETCH)
}

describe('nextSketchState', () => {
	it('starts as one item', () => {
		expect(drag([0, 0])).toEqual({ direction: 'horizontal', sign: 1, count: 1 })
	})

	it('adds an item as soon as the pointer leaves the current one', () => {
		expect(drag([STEP / 2 - 1, 0]).count).toBe(1)
		expect(drag([STEP / 2, 0]).count).toBe(2)
		expect(drag([STEP * 1.5, 0]).count).toBe(3)
		expect(drag([STEP * 9.6, 0]).count).toBe(11)
	})

	it('grows in the dominant drag direction', () => {
		expect(drag([-100, 10])).toMatchObject({ direction: 'horizontal', sign: -1, count: 3 })
		expect(drag([5, 100])).toMatchObject({ direction: 'vertical', sign: 1, count: 3 })
		expect(drag([5, -100])).toMatchObject({ direction: 'vertical', sign: -1, count: 3 })
	})

	it('locks the axis once grown, and shrinks when dragged back', () => {
		expect(drag([100, 0], [100, 300])).toMatchObject({ direction: 'horizontal', count: 3 })
		expect(drag([100, 0], [30, 0]).count).toBe(2)
	})

	it('can change direction after returning to the first item', () => {
		expect(drag([100, 0], [0, 0], [0, 100])).toMatchObject({ direction: 'vertical', count: 3 })
	})
})
