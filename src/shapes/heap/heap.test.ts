import { describe, expect, it } from 'vitest'
import { fillValues } from '../../data/fill'
import { buildByInsertion, heapInsert, heapRemoveAt, heapViolations, heapify, siftDown } from './heap'

const valid = (values: string[], type: 'min' | 'max' = 'min') => heapViolations(values, type).size === 0

describe('heap', () => {
	it('builds valid min and max heaps by insertion and by heapify', () => {
		for (let seed = 0; seed < 20; seed++) {
			const stream = fillValues('random', seed, 15)
			expect(valid(buildByInsertion(stream, 'min'))).toBe(true)
			expect(valid(buildByInsertion(stream, 'max'), 'max')).toBe(true)
			expect(valid(heapify(stream, 'min').values)).toBe(true)
		}
	})

	it('inserts with sift-up, reporting each swap and the final position', () => {
		const s = heapInsert(['1', '5', '3', '7', '9'], '2', 'min')
		expect(s.values).toEqual(['1', '5', '2', '7', '9', '3'])
		expect(s.swaps).toEqual([[5, 2]])
		expect(s.path).toEqual([5, 2])
		expect(s.at).toBe(2)
	})

	it('extracts the root: last takes its place and sifts down', () => {
		const s = heapRemoveAt(['1', '5', '3', '7', '9', '4'], 0, 'min')
		expect(s.removed).toBe('1')
		expect(s.values).toEqual(['3', '5', '4', '7', '9'])
		// The last value (4) moves to the root and swaps once with its smaller child (3, at index 2).
		expect(s.swaps).toEqual([[0, 2]])
		expect(s.path).toEqual([0, 2])
		expect(valid(s.values)).toBe(true)
	})

	it('removes the last value without any swaps', () => {
		expect(heapRemoveAt(['1', '5', '3'], 2, 'min')).toMatchObject({ values: ['1', '5'], swaps: [], removed: '3' })
	})

	it('removing from the middle may sift up instead of down', () => {
		const s = heapRemoveAt(['1', '10', '2', '11', '12', '3', '4'], 4, 'min')
		expect(valid(s.values)).toBe(true)
		expect(s.removed).toBe('12')
	})

	it('flags children that break the heap property', () => {
		expect([...heapViolations(['5', '3', '8'], 'min')]).toEqual([1])
		expect(siftDown(['9', '1', '2'], 0, 'min').values).toEqual(['1', '9', '2'])
	})
})
