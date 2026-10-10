import { describe, expect, it } from 'vitest'
import { callDepth, callRun, levelSizes, repeatedCalls } from '../recursion/calls'
import { mergeSort, recursiveBinarySearch, sumWithInvariant } from './operations'
import { quicksort } from './quicksorts'

// Lecture 4's recursion: merge sort and quicksort feed the recursion tree (each call the values it
// gets, returning them sorted, the values each level works on added up), and binary search
// written recursively makes a chain.

const array = (...values: number[]) => ({ values: values.map(String), marks: {} })

describe('the sorts feed the recursion tree', () => {
	it("merge sort on lecture 4's 7, 4, 1, 5, 3: each call the values it gets and returns sorted; every full level works on all 5", () => {
		const { calls } = callRun(mergeSort(array(7, 4, 1, 5, 3)).frames)
		expect(calls.map((c) => [c.label, c.result])).toEqual([
			['7 4 1 5 3', '1 3 4 5 7'],
			['7 4 1', '1 4 7'],
			['7 4', '4 7'],
			['7', '7'],
			['4', '4'],
			['1', '1'],
			['5 3', '3 5'],
			['5', '5'],
			['3', '3'],
		])
		expect(levelSizes(calls)).toEqual([5, 5, 5, 2])
		// Equal values in two calls aren't the same call done twice.
		expect(repeatedCalls(callRun(mergeSort(array(4, 4)).frames).calls).size).toBe(0)
	})

	it('quicksort on sorted input is a stick: n levels working on n, n - 1, ... 1 values, n(n + 1)/2 in all', () => {
		const op = quicksort(array(1, 2, 3, 4, 5))
		const { calls } = callRun(op.frames)
		expect(callDepth(calls)).toBe(5)
		expect(levelSizes(calls)).toEqual([5, 4, 3, 2, 1])
		expect(calls.every((c) => c.result !== undefined)).toBe(true)
		expect(op.frames.at(-1)?.caption).toContain('5 levels: each call leaves one side empty, so 5 + 4 + … + 1 = 15 values worked on, about n²/2')
	})

	it("quicksort on lecture 10's 2 8 7 1 3 5 6 4: partition, then [2 1 3] and [7 5 6 8]", () => {
		const { calls } = callRun(quicksort(array(2, 8, 7, 1, 3, 5, 6, 4)).frames)
		expect(calls.slice(0, 2).map((c) => c.label)).toEqual(['2 8 7 1 3 5 6 4', '2 1 3'])
		expect(calls.find((c) => c.parent === 0 && c.label !== '2 1 3')?.label).toBe('7 5 6 8')
		expect(calls[0].result).toBe('1 2 3 4 5 6 7 8')
	})
})

describe('binary search, recursive (lecture 4)', () => {
	it('one call per halving, a chain, each returning what the call it made returned', () => {
		const op = recursiveBinarySearch(array(2, 5, 8, 12, 16, 23, 38, 56), '38')
		const { calls } = callRun(op.frames)
		expect(calls.map((c) => [c.label, c.parent, c.result])).toEqual([
			['binarySearch(0, 7)', -1, '6'],
			['binarySearch(4, 7)', 0, '6'],
			['binarySearch(6, 7)', 1, '6'],
		])
		expect(op.finalFlash).toEqual({ 6: 'green' })
		expect(op.frames.at(-1)?.caption).toBe('Found 38 at index 6: 3 calls, one per halving, so about log₂ 8 deep: T(n) = T(n/2) + 1. The loop version needs no stack')
	})

	it('not there: the last call finds low > high and returns -1 up the chain', () => {
		const op = recursiveBinarySearch(array(2, 5, 8, 12), '3')
		const { calls } = callRun(op.frames)
		expect(calls.at(-1)).toMatchObject({ label: 'binarySearch(1, 0)', result: '-1' })
		expect(calls.every((c) => c.result === '-1')).toBe(true)
		expect(op.finalFlash).toBeUndefined()
	})
})

describe('the loop invariant of a sum (lecture 4)', () => {
	it("on lecture 4's 4, 6, 5, 8: a band over the part summed, true at the beginning, the middle and the end", () => {
		const op = sumWithInvariant({ values: ['4', '6', '5', '8'], marks: {} })
		expect(op.frames.map((f) => f.band)).toEqual([
			{ from: 0, to: 0, label: 'total = 4' },
			{ from: 0, to: 1, label: 'total = 4 + 6 = 10' },
			{ from: 0, to: 2, label: 'total = 4 + 6 + 5 = 15' },
			{ from: 0, to: 3, label: 'total = 4 + 6 + 5 + 8 = 23' },
			{ from: 0, to: 3, label: 'total = 4 + 6 + 5 + 8 = 23' },
		])
		expect(op.frames.map((f) => f.caption?.split(':')[0])).toEqual(['Beginning', 'Middle', 'Middle', 'Middle', 'End'])
		expect(op.frames.map((f) => f.vars?.total)).toEqual(['4', '10', '15', '23', '23'])
		expect(op.frames.at(-1)?.pointers).toEqual([{ id: '#i', name: 'i', at: '4' }])
		expect(op.result).toBeUndefined()
	})
})
