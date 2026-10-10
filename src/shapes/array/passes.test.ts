import { describe, expect, it } from 'vitest'
import { fillValues } from '../../data/fill'
import { insertionSort, selectionSort, type ArrayOperation, type ArrayState } from './operations'
import { insertionPasses, selectionPasses } from './passes'

// Lectures 2 and 3: selection and insertion sort a pass at a time, a row per pass.

const array = (...values: (string | number)[]): ArrayState => ({ values: values.map(String), marks: {} })
const last = (op: ArrayOperation) => op.frames[op.frames.length - 1]

describe('a row per pass', () => {
	it("selection sort on lecture 2's [2, 5, 3, 1, 4]: n - 1 - i comparisons a pass, 4 + 3 + 2 + 1 = 10", () => {
		const op = selectionPasses(array(2, 5, 3, 1, 4))
		expect(op.result?.values).toEqual(['1', '2', '3', '4', '5'])
		const rows = last(op).strips!
		expect(rows.map((r) => r.items.join(' '))).toEqual(['1 5 3 2 4', '1 2 3 5 4', '1 2 3 5 4', '1 2 3 4 5'])
		expect(rows.map((r) => r.title)).toEqual(['pass 1: 4 comparisons, 1 swap', 'pass 2: 3 comparisons, 1 swap', 'pass 3: 2 comparisons, no swap', 'pass 4: 1 comparison, 1 swap'])
		// The sorted part green, what the swap moved orange.
		expect(rows[0].marks).toEqual({ 0: 'green', 3: 'orange' })
		expect(last(op).caption).toBe('Comparisons 4 + 3 + 2 + 1 = 10 = n(n − 1)/2 for n = 5, the same for any input; 3 swaps, at most n − 1 = 4')
	})

	it("insertion sort on reversed input, lecture 3's worst case: tests 2 + 3 + 4 + 5 = 14, swaps 10", () => {
		const op = insertionPasses(array(5, 4, 3, 2, 1))
		expect(last(op).counts).toEqual({ comparisons: 10, swaps: 10, 'while tests': 14 })
		expect(last(op).caption).toMatch(/^While tests 2 \+ 3 \+ 4 \+ 5 = 14; comparisons 1 \+ 2 \+ 3 \+ 4 = 10; swaps 1 \+ 2 \+ 3 \+ 4 = 10\./)
		expect(last(op).caption).toContain('A test more than the comparisons is j > 0 failing at the front, comparing no values.')
		// Lecture 2's [2, 5, 3, 1, 4]: 1 + 2 + 4 + 2 = 9 tests, 8 comparisons, 5 swaps (its inversions).
		expect(last(insertionPasses(array(2, 5, 3, 1, 4))).counts).toEqual({ comparisons: 8, swaps: 5, 'while tests': 9 })
		expect(insertionPasses(array(1, 2, 3)).frames[0].caption).toBe('Pass 1: 2 is not smaller than a[0], so it stays: 1 comparison, no swap')
	})

	it('the passes count what the step-by-step sorts count, on any input', () => {
		for (let seed = 1; seed <= 20; seed++) {
			const values = fillValues(seed % 3 ? 'random' : 'repeats', seed, 3 + (seed % 7), { range: 'small' })
			expect(last(selectionPasses(array(...values))).counts).toEqual(last(selectionSort(array(...values))).counts)
			expect(last(insertionPasses(array(...values))).counts).toEqual(last(insertionSort(array(...values))).counts)
			expect(selectionPasses(array(...values)).result?.values).toEqual(selectionSort(array(...values)).result?.values)
		}
	})
})
