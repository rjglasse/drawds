import { describe, expect, it } from 'vitest'
import { pruneMarks, swapMarks, toggleMark } from './marks'

describe('marks', () => {
	it('toggles: the same colour again, or null, clears', () => {
		const red = toggleMark({}, '1', 'red')
		expect(red).toEqual({ '1': 'red' })
		expect(toggleMark(red, '1', 'red')).toEqual({})
		expect(toggleMark(red, '1', 'blue')).toEqual({ '1': 'blue' })
		expect(toggleMark(red, '1', null)).toEqual({})
	})

	it('prunes marks on elements that are gone', () => {
		expect(pruneMarks({ a: 'red', b: 'green' }, ['b', 'c'])).toEqual({ b: 'green' })
	})

	it('swaps marks with their elements', () => {
		expect(swapMarks({ '0': 'red', '2': 'green' }, '0', '1')).toEqual({ '1': 'red', '2': 'green' })
		expect(swapMarks({ '0': 'red', '1': 'blue' }, '0', '1')).toEqual({ '1': 'red', '0': 'blue' })
	})
})
