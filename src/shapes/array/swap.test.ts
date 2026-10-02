import { describe, expect, it } from 'vitest'
import { cellHandleId, cellOfHandle, swapCells } from './swap'

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
