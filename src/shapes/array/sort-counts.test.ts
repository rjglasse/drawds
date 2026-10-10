import { describe, expect, it } from 'vitest'
import { fillValues, type FillMode, type FillRange } from '../../data/fill'
import { mulberry32 } from '../../data/random'
import { bubbleSort, insertionSort, mergeSort, selectionSort, type ArrayOperation, type ArrayState } from './operations'
import { quicksort, QUICKSORT_VARIANTS } from './quicksorts'
import { COUNTED_SORTS, countSort, medianOf3, ranks, type CountedSort } from './sort-counts'

const array = (values: string[]): ArrayState => ({ values, marks: {} })
const endCounts = (op: ArrayOperation) => op.frames.at(-1)?.counts

/** The step-by-step version of `sort`, with the same picks for a random pivot. */
function stepped(sort: CountedSort, values: string[], seed: number, cutoff: number): ArrayOperation {
	const start = array(values)
	switch (sort) {
		case 'insertion-sort':
			return insertionSort(start)
		case 'selection-sort':
			return selectionSort(start)
		case 'bubble-sort':
			return bubbleSort(start)
		case 'merge-sort':
			return mergeSort(start)
		default:
			return quicksort(start, sort, { rng: mulberry32(seed), cutoff })
	}
}

describe('sort counts without the steps', () => {
	const inputs: [FillMode, FillRange, number][] = [
		['random', 'medium', 9],
		['repeats', 'small', 12],
		['random', 'few', 10],
		['ascending', 'medium', 8],
		['descending', 'medium', 8],
		['nearly-sorted', 'medium', 11],
		['repeats', 'few', 2],
		['random', 'medium', 1],
	]

	it('every sort counts what its steps count, on every kind of input', () => {
		expect(QUICKSORT_VARIANTS.every((v) => (COUNTED_SORTS as readonly string[]).includes(v))).toBe(true)
		for (const sort of COUNTED_SORTS) {
			for (const [k, [fill, range, n]] of inputs.entries()) {
				const values = fillValues(fill, 40 + k, n, { range })
				for (const cutoff of sort === 'quicksort-cutoff' ? [1, 3, 5] : [3]) {
					const counted = countSort(sort, ranks(values), { rng: mulberry32(7 + k), cutoff })
					expect(counted, `${sort} on ${values.join(' ')} (cut-off ${cutoff})`).toEqual(endCounts(stepped(sort, values, 7 + k, cutoff)))
				}
			}
		}
	})

	it('ranks keep the order and the ties, numbers as numbers', () => {
		expect(ranks(['10', '9', '10', '2'])).toEqual([2, 1, 2, 0])
		expect(ranks(['B', 'A', 'C', 'A'])).toEqual([1, 0, 2, 0])
	})

	it('counts n = 1000 at once, and sorted input 10,000 long without overflowing the stack', () => {
		const sorted = Array.from({ length: 1000 }, (_, i) => i)
		expect(countSort('insertion-sort', [...sorted].reverse()).comparisons).toBe((1000 * 999) / 2)
		expect(countSort('selection-sort', sorted).comparisons).toBe((1000 * 999) / 2)
		expect(countSort('quicksort', sorted)).toMatchObject({ comparisons: (1000 * 999) / 2, 'max depth': 1000 })
		expect(countSort('quicksort-median', sorted)['max depth']).toBeLessThanOrEqual(11)
		const long = countSort('quicksort', Array.from({ length: 10_000 }, (_, i) => i))
		expect(long['max depth']).toBe(10_000)
		// All equal: one three-way partition does it.
		expect(countSort('quicksort-3way', Array(1000).fill(1))).toEqual({ comparisons: 2000, swaps: 0, calls: 3, 'max depth': 2 })
	})

	it('the median of three, with two or three comparisons, ties too', () => {
		const median = (...v: number[]) => medianOf3((x, y) => v[x] < v[y], 0, 1, 2)
		for (const [values, at] of [
			[[1, 2, 3], 1],
			[[1, 3, 2], 2],
			[[2, 1, 3], 0],
			[[2, 3, 1], 0],
			[[3, 1, 2], 2],
			[[3, 2, 1], 1],
		] as [number[], number][])
			expect(values[median(...values).at], values.join(' ')).toBe(values[at])
		expect(median(5, 5, 5).comparisons).toBe(3)
		expect([5, 5, 1][median(5, 5, 1).at]).toBe(5)
		expect([1, 2, 3].map((_, k) => median(...[[1, 2, 3], [2, 1, 3], [3, 2, 1]][k]).comparisons)).toEqual([2, 2, 3])
	})
})
