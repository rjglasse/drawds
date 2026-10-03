import { describe, expect, it } from 'vitest'
import { cellHandleId, cellOfHandle, frameSlides, orderSlides, swapCells } from './swap'

describe('swapCells', () => {
	it('exchanges two values and their marks', () => {
		expect(swapCells(['a', 'b', 'c'], { '0': 'red' }, 0, 2)).toEqual({ values: ['c', 'b', 'a'], marks: { '2': 'red' } })
	})
})

describe('cell handle ids', () => {
	it('round-trip', () => {
		expect(cellOfHandle(cellHandleId(7))).toBe(7)
		expect(cellOfHandle('grow')).toBeUndefined()
	})
})

describe('slides', () => {
	it('a swap slides both values; a copy slides only the copy', () => {
		expect(frameSlides([['1', '4']])).toEqual({ 1: 4, 4: 1 })
		expect(frameSlides([], [['3', '2']])).toEqual({ 2: 3 })
	})

	it('a rearrangement slides each value that moved from its old index', () => {
		expect(orderSlides([2, 1, 0])).toEqual({ 0: 2, 2: 0 })
	})
})
