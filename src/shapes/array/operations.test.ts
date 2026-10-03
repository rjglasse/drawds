import { describe, expect, it } from 'vitest'
import type { Frame } from '../../nodelink/playback'
import { stateAt } from '../../nodelink/playback'
import {
	binarySearch,
	bubbleSort,
	deleteAt,
	insertAt,
	insertionSort,
	isSorted,
	linearSearch,
	selectionSort,
	type ArrayOperation,
} from './operations'
import { rearrange, reversedOrder, shuffledOrder, sortedOrder } from './rearrange'
import { mulberry32 } from '../../data/random'

const arr = (...values: (string | number)[]) => ({ values: values.map(String), marks: {} })
const valuesOf = (f: Frame) => (f.props as { values: string[] }).values
const last = (op: ArrayOperation) => op.frames[op.frames.length - 1]
const counts = (op: ArrayOperation) => last(op).counts

/** Every swap and copy a frame shows matches the values of the frame before it. */
function expectConsistent(op: ArrayOperation, start: string[]) {
	let before = start
	for (const frame of op.frames) {
		const now = valuesOf(frame)
		for (const [a, b] of frame.swaps ?? []) {
			expect(now[Number(a)]).toBe(before[Number(b)])
			expect(now[Number(b)]).toBe(before[Number(a)])
		}
		for (const [from, to] of frame.moves ?? []) expect(now[Number(to)]).toBe(now[Number(from)])
		before = now
	}
}

describe('binary search', () => {
	const sorted = arr(1, 3, 5, 7, 9, 11, 13)

	it('finds a value, halving the range each comparison', () => {
		const op = binarySearch(sorted, '11')
		expect(counts(op)).toEqual({ comparisons: 2 })
		expect(last(op).caption).toBe('Yes: found 11 at index 5, after 2 comparisons')
		expect(op.finalFlash).toEqual({ 5: 'green' })
		expect(op.result).toBeUndefined()
		// lo moved past mid 3, so a[0..3] are out of play.
		expect(stateAt(op.frames, op.frames.length - 1).dim).toEqual(['0', '1', '2', '3'])
	})

	it('reports a missing value once lo passes hi, everything faded', () => {
		const op = binarySearch(sorted, '4')
		expect(counts(op)).toEqual({ comparisons: 3 })
		expect(last(op).caption).toBe('lo = 2 > hi = 1: the pointers have crossed, so 4 is not in the array')
		expect(last(op).pointers?.map((p) => [p.name, p.at])).toEqual([
			['lo', '2'],
			['hi', '1'],
		])
		expect(last(op).dim).toHaveLength(7)
	})

	it('walks off either end: hi = -1 or lo = n', () => {
		expect(last(binarySearch(sorted, '0')).pointers?.find((p) => p.name === 'hi')?.at).toBe('-1')
		expect(last(binarySearch(sorted, '99')).pointers?.find((p) => p.name === 'lo')?.at).toBe('7')
	})

	it('warns on an unsorted array, and runs anyway', () => {
		const op = binarySearch(arr(9, 1, 5), '1')
		expect(op.frames[0].caption).toBe("Careful: a[0] = 9 > a[1] = 1, so the array isn't sorted and binary search can miss 1")
		expect(op.frames[0].flash).toEqual({ 0: 'red', 1: 'red' })
		expect(binarySearch(sorted, '1').frames[0].caption).toBe('lo = 0, hi = 6: 1 could be anywhere in a[0..6]')
	})

	it('compares numbers as numbers', () => {
		expect(last(binarySearch(arr(2, 10, 30), '10')).caption).toMatch(/found 10 at index 1/)
	})
})

describe('linear search', () => {
	it('compares each value in turn', () => {
		const op = linearSearch(arr(4, 8, 15, 16), '15')
		expect(counts(op)).toEqual({ comparisons: 3 })
		expect(op.finalFlash).toEqual({ 2: 'green' })
	})

	it('walks past the end when the value is missing', () => {
		const op = linearSearch(arr(4, 8), '5')
		expect(counts(op)).toEqual({ comparisons: 2 })
		expect(last(op).pointers?.[0].at).toBe('2')
	})
})

describe('sorts', () => {
	// 9 inversions, 6 values.
	const start = arr(5, 2, 4, 6, 1, 3)
	const sortedValues = ['1', '2', '3', '4', '5', '6']

	it.each([
		['insertion', insertionSort, { comparisons: 12, swaps: 9 }],
		['selection', selectionSort, { comparisons: 15, swaps: 3 }],
		['bubble', bubbleSort, { comparisons: 15, swaps: 9 }],
	] as const)('%s sort sorts, with the textbook counts', (_, sort, expected) => {
		const op = sort(start)
		expect(op.result?.values).toEqual(sortedValues)
		expect(counts(op)).toEqual(expected)
		expect(last(op).caption).toBe(`Sorted: ${expected.comparisons} comparisons, ${expected.swaps} swaps`)
		expectConsistent(op, start.values)
	})

	it.each([insertionSort, selectionSort, bubbleSort])('marks travel with their values (%o)', (sort) => {
		const op = sort({ values: ['3', '1', '2'], marks: { 0: 'red' } })
		expect(op.result).toEqual({ values: ['1', '2', '3'], marks: { 2: 'red' } })
	})

	it('bubble sort stops after a pass without swaps', () => {
		const op = bubbleSort(arr(1, 2, 3, 4))
		expect(counts(op)).toEqual({ comparisons: 3, swaps: 0 })
		expect(op.frames.some((f) => f.caption?.startsWith('No swaps in pass 1'))).toBe(true)
	})

	it('sorts letters, and single values', () => {
		expect(insertionSort(arr('C', 'A', 'B')).result?.values).toEqual(['A', 'B', 'C'])
		expect(selectionSort(arr(7)).result?.values).toEqual(['7'])
	})

	it('ends with every cell green', () => {
		const end = stateAt(insertionSort(start).frames, insertionSort(start).frames.length - 1)
		expect(Object.values(end.flash)).toEqual(Array(6).fill('green'))
	})
})

describe('insert and delete by shifting', () => {
	it('delete copies each later value left, then drops the last cell', () => {
		const op = deleteAt({ values: ['a', 'b', 'c', 'd'], marks: { 3: 'blue', 0: 'red', 1: 'green' } }, 1)
		expect(op.result).toEqual({ values: ['a', 'c', 'd'], marks: { 0: 'red', 2: 'blue' } })
		expect(counts(op)).toEqual({ moves: 2 })
		expect(op.frames.flatMap((f) => f.moves ?? [])).toEqual([
			['2', '1'],
			['3', '2'],
		])
		expect(valuesOf(last(op))).toEqual(['a', 'c', 'd'])
		expectConsistent(op, ['a', 'b', 'c', 'd'])
	})

	it('deleting the last value moves nothing', () => {
		expect(counts(deleteAt(arr(1, 2, 3), 2))).toEqual({ moves: 0 })
	})

	it('insert makes room from the end, then writes the value', () => {
		const op = insertAt({ values: ['a', 'b', 'c'], marks: { 1: 'red' } }, 1, 'x')
		expect(op.result).toEqual({ values: ['a', 'x', 'b', 'c'], marks: { 2: 'red' } })
		expect(counts(op)).toEqual({ moves: 2 })
		expect(op.frames.flatMap((f) => f.moves ?? [])).toEqual([
			['2', '3'],
			['1', '2'],
		])
		expect(valuesOf(op.frames[0])).toEqual(['a', 'b', 'c', ''])
		expect(op.finalFlash).toEqual({ 1: 'green' })
		expectConsistent(op, ['a', 'b', 'c', ''])
	})
})

describe('rearrangements', () => {
	it('sorts stably, ascending or descending', () => {
		expect(sortedOrder(['3', '1', '3', '2'])).toEqual([1, 3, 0, 2])
		expect(sortedOrder(['3', '1', '10'], true)).toEqual([2, 0, 1])
	})

	it('moves marks with values', () => {
		expect(rearrange(['a', 'b', 'c'], { 0: 'red' }, reversedOrder(3))).toEqual({ values: ['c', 'b', 'a'], marks: { 2: 'red' } })
	})

	it('a shuffle always moves something', () => {
		for (let seed = 0; seed < 50; seed++) {
			const order = shuffledOrder(2, mulberry32(seed))
			expect(order).toEqual([1, 0])
		}
		expect([...shuffledOrder(8, mulberry32(1))].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
	})

	it('isSorted', () => {
		expect(isSorted(['1', '2', '2', '10'])).toBe(true)
		expect(isSorted(['2', '10', '1'])).toBe(false)
	})
})
