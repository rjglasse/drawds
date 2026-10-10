import { describe, expect, it } from 'vitest'
import { bubbleSort, insertionSort, linearSearch, selectionSort, type ArrayOperation } from './operations'
import { allUnique, findMax } from './scans'

// Lecture 3's times column: how many times each line runs, loop headers once per test (one more
// than their body when the loop runs out).

const array = (...values: number[]) => ({ values: values.map(String), marks: {} })
const totals = (op: ArrayOperation) => op.frames[op.frames.length - 1].runs

describe('times each line runs', () => {
	it('insertion sort, best case (sorted): the while test n - 1 times, no swaps', () => {
		const n = 5
		expect(totals(insertionSort(array(1, 2, 3, 4, 5)))).toEqual({ outer: n, key: n - 1, start: n - 1, compare: n - 1, swap: 0, back: 0 })
	})

	it('insertion sort, worst case (reversed): the while test n(n + 1)/2 - 1 times, n(n - 1)/2 swaps', () => {
		const n = 5
		const op = insertionSort(array(5, 4, 3, 2, 1))
		expect(totals(op)).toEqual({
			outer: n,
			key: n - 1,
			start: n - 1,
			compare: (n * (n + 1)) / 2 - 1,
			swap: (n * (n - 1)) / 2,
			back: (n * (n - 1)) / 2,
		})
	})

	it('counts tick up step by step: a step shows what ran up to it', () => {
		const op = insertionSort(array(2, 1))
		expect(op.frames.map((f) => f.runs?.compare)).toEqual([0, 0, 1, 1, 2, 2])
		expect(op.frames.map((f) => f.runs?.outer)).toEqual([0, 1, 1, 1, 1, 2])
	})

	it('search: not there, the loop header n + 1 times and the comparison n; found, both stop there', () => {
		expect(totals(linearSearch(array(5, 7, 1, 3), '9'))).toEqual({ loop: 5, compare: 4, found: 0, missing: 1 })
		expect(totals(linearSearch(array(5, 7, 1, 3), '1'))).toEqual({ loop: 3, compare: 3, found: 1, missing: 0 })
	})

	it("max: n - 1 comparisons whatever the order (lecture 3's [2, 5, 1, 3, 4])", () => {
		expect(totals(findMax(array(2, 5, 1, 3, 4)))).toEqual({ init: 1, loop: 5, compare: 4, update: 1, done: 1 })
	})

	it('unique: every pair when all differ, n(n - 1)/2 comparisons; a repeat stops it', () => {
		expect(totals(allUnique(array(1, 2, 3, 4, 5)))).toEqual({ n: 1, outer: 5, inner: 14, compare: 10, repeat: 0, unique: 1 })
		expect(totals(allUnique(array(1, 2, 2, 4, 5)))).toEqual({ n: 1, outer: 2, inner: 6, compare: 5, repeat: 1, unique: 0 })
	})

	it('selection sort: n(n - 1)/2 comparisons for any order; bubble sort stops after a pass with no swaps', () => {
		expect(totals(selectionSort(array(4, 3, 2, 1)))).toEqual({ n: 1, outer: 4, init: 3, inner: 9, compare: 6, update: 4, noswap: 3, swap: 2 })
		expect(totals(bubbleSort(array(1, 2, 3)))).toEqual({ n: 1, outer: 1, reset: 1, inner: 3, compare: 2, swap: 0, flag: 0, pass: 1, sorted: 1 })
		expect(totals(bubbleSort(array(3, 2, 1)))).toEqual({ n: 1, outer: 3, reset: 2, inner: 5, compare: 3, swap: 3, flag: 3, pass: 2, sorted: 0 })
	})

	it("the comparison line's count is the play bar's comparisons, but for insertion sort's while test", () => {
		for (const op of [selectionSort(array(3, 5, 1, 4, 2)), bubbleSort(array(3, 5, 1, 4, 2)), allUnique(array(3, 5, 1, 4, 2))]) {
			const last = op.frames[op.frames.length - 1]
			expect(last.runs?.compare).toBe(last.counts?.comparisons)
		}
		// The while test also runs when j > 0 fails, comparing no values: once per value that reaches the
		// front. The play bar counts both: lecture 3's 14 is the tests.
		const op = insertionSort(array(5, 4, 3, 2, 1))
		const last = op.frames.at(-1)!
		expect([last.runs?.compare, last.counts]).toEqual([14, { comparisons: 10, swaps: 10, 'while tests': 14 }])
		expect(last.caption).toBe(
			'Sorted: 10 comparisons, 10 swaps. The while test ran 14 times, 4 more: once for each value that reached the front, where j > 0 stops it before it compares anything'
		)
		// Sorted already: no value reaches the front, the tests are the comparisons.
		expect(insertionSort(array(1, 2, 3)).frames.at(-1)?.caption).toBe('Sorted: 2 comparisons, 0 swaps')
		// Ten reversed values: lecture 2's 54 is the tests; 45 comparisons.
		expect(insertionSort(array(10, 9, 8, 7, 6, 5, 4, 3, 2, 1)).frames.at(-1)?.counts).toEqual({ comparisons: 45, swaps: 45, 'while tests': 54 })
	})
})
