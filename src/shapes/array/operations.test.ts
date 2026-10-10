import { describe, expect, it } from 'vitest'
import type { Frame } from '../../nodelink/playback'
import { stateAt } from '../../nodelink/playback'
import {
	appendFixed,
	appendMany,
	binarySearch,
	bubbleSort,
	deleteAt,
	deleteFixed,
	growFixed,
	hoarePartition,
	insertAt,
	insertFixed,
	insertionSort,
	isSorted,
	linearSearch,
	mergeSort,
	partitionArray,
	selectionSort,
	sumByHalves,
	sumByRest,
	type ArrayOperation,
} from './operations'
import { quicksort } from './quicksorts'
import { callRun } from '../recursion/calls'
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
		// Insertion sort's while test also runs when j > 0 stops it: twice here (2 and 1 reach the front).
		['insertion', insertionSort, { comparisons: 12, swaps: 9, 'while tests': 14 }],
		['selection', selectionSort, { comparisons: 15, swaps: 3 }],
		['bubble', bubbleSort, { comparisons: 15, swaps: 9 }],
	] as const)('%s sort sorts, with the textbook counts', (_, sort, expected) => {
		const op = sort(start)
		expect(op.result?.values).toEqual(sortedValues)
		expect(counts(op)).toEqual(expected)
		expect(last(op).caption).toMatch(new RegExp(`^Sorted: ${expected.comparisons} comparisons, ${expected.swaps} swaps`))
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

describe('quicksort', () => {
	it('partition puts the pivot in its final place, smaller values left of it', () => {
		const op = partitionArray(arr(7, 2, 9, 1, 5))
		expect(op.result?.values).toEqual(['2', '1', '5', '7', '9'])
		expect(op.finalFlash).toEqual({ 2: 'green' })
		expect(counts(op)).toEqual({ comparisons: 4, swaps: 3 })
		expect(last(op).caption).toMatch(/^swap\(a\[2\], a\[4\]\): the pivot 5 lands at index 2/)
		expectConsistent(op, ['7', '2', '9', '1', '5'])
	})

	it('a pivot larger than everything stays put', () => {
		expect(last(partitionArray(arr(3, 1, 9))).caption).toBe('No value is larger than the pivot: 9 stays at index 2, its final place')
	})

	it('quicksort sorts, the call stack shown and emptied at the end', () => {
		const start = arr(5, 2, 4, 6, 1, 3, 8, 7)
		const op = quicksort(start)
		expect(op.result?.values).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
		expectConsistent(op, start.values)
		expect(op.frames[0].strips).toEqual([{ title: 'call stack', items: ['0..7'] }])
		expect(op.frames.some((f) => (f.strips?.[0].items.length ?? 0) >= 3)).toBe(true)
		expect(last(op).strips).toEqual([{ title: 'call stack', items: [] }])
		// While sorting the left part, the right part is out of play.
		const left = op.frames.find((f) => f.caption?.startsWith('quicksort(0, 1)'))
		expect(left?.dim).toEqual(['2', '3', '4', '5', '6', '7'])
		expect(op.result).toEqual({ values: op.result?.values, marks: {} })
	})

	it('marks travel', () => {
		expect(quicksort({ values: ['3', '1', '2'], marks: { 1: 'red' } }).result).toEqual({ values: ['1', '2', '3'], marks: { 0: 'red' } })
	})
})

describe('hoare partition and merge sort', () => {
	it('hoare: i and j walk in, swap out-of-place pairs, and stop once they cross', () => {
		const op = hoarePartition(arr(5, 8, 1, 9, 3, 7))
		// Pivot 5: i stops on 5, j on 3: swap; i stops on 8, j on 1: swap; i on 8 (now at 2)... crossed.
		const values = op.result!.values.map(Number)
		const j = Number(last(op).pointers?.find((p) => p.name === 'j')?.at)
		expect(values.slice(0, j + 1).every((v) => v <= 5)).toBe(true)
		expect(values.slice(j + 1).every((v) => v >= 5)).toBe(true)
		expect(last(op).caption).toMatch(/the pointers have crossed\..*isn't necessarily in its final place$/)
		expect(op.frames[0].pointers?.map((p) => p.at)).toEqual(['-1', '6'])
		expectConsistent(op, ['5', '8', '1', '9', '3', '7'])
	})

	it('merge sort sorts; the merged run fills a strip and copies back', () => {
		const start = arr(5, 2, 4, 6, 1, 3)
		const op = mergeSort(start)
		expect(op.result?.values).toEqual(['1', '2', '3', '4', '5', '6'])
		const merging = op.frames.filter((f) => (f.strips?.[1].items.length ?? 0) > 0)
		expect(merging.length).toBeGreaterThan(0)
		expect(last(op).strips).toEqual([
			{ title: 'call stack', items: [] },
			{ title: 'merged', items: [] },
		])
		expect(op.frames.some((f) => f.caption === 'Copy the merged run back into a[0..5]: it is sorted')).toBe(true)
		// Every merge copies its values into the run and back: merges of 2, 3, 2, 3 and 6 values.
		expect(counts(op)).toMatchObject({ comparisons: expect.any(Number), copies: 32 })
	})

	it('merge sort on sorted input: each left half runs out first (i meets j), nothing lost', () => {
		const op = mergeSort(arr(1, 2, 3, 4, 5))
		expect(op.result?.values).toEqual(['1', '2', '3', '4', '5'])
		expect(op.frames.every((f) => (f.props as { values: string[] }).values.length === 5)).toBe(true)
	})

	it('merge sort keeps equal values in order and marks travel', () => {
		const op = mergeSort({ values: ['2', '1', '2'], marks: { 0: 'red', 2: 'blue' } })
		expect(op.result).toEqual({ values: ['1', '2', '2'], marks: { 1: 'red', 2: 'blue' } })
	})
})

describe('fixed capacity', () => {
	const fixed = (values: string[], used: number) => ({ values, marks: {}, used })
	const usedOf = (f: Frame) => (f.props as { used?: number }).used

	it('insert shifts the used values right into the spare slot; size goes up', () => {
		const op = insertFixed(fixed(['a', 'b', 'c', ''], 3), 3, 1, 'x')
		expect(op.result).toMatchObject({ values: ['a', 'x', 'b', 'c'], used: 4 })
		expect(op.frames.flatMap((f) => f.moves ?? [])).toEqual([
			['2', '3'],
			['1', '2'],
		])
		expect(op.frames[0].caption).toBe('Insert x at index 1: size 3 < capacity 4, so a[3] is free')
		expect(last(op).caption).toBe('a[1] = x; size = 4. 2 values moved')
		expect(usedOf(last(op))).toBe(4)
	})

	it('insert into a full array stops: nothing changes', () => {
		const op = insertFixed(fixed(['a', 'b'], 2), 2, 0, 'x')
		expect(op.result).toBeUndefined()
		expect(op.frames).toHaveLength(1)
		expect(op.frames[0].caption).toMatch(/^size = capacity = 2: the array is full/)
	})

	it('delete shifts left and leaves a blank spare slot; the capacity stays', () => {
		const op = deleteFixed({ values: ['a', 'b', 'c', ''], marks: { 2: 'red' }, used: 3 }, 3, 0)
		expect(op.result).toMatchObject({ values: ['b', 'c', '', ''], marks: { 1: 'red' }, used: 2 })
		expect(last(op).caption).toBe('size = 2: a[2] is a spare slot again. 2 values moved')
	})

	it('grow makes newArr twice the size, copies each value down, then takes its place', () => {
		const op = growFixed(fixed(['a', 'b', 'c'], 3), 3)
		expect(op.result).toEqual({ values: ['a', 'b', 'c', '', '', ''], marks: {}, used: 3 })
		const aux = (f: Frame) => (f.props as { aux?: { title: string; values: string[] } }).aux
		expect(aux(op.frames[0])).toEqual({ title: 'newArr = new int[6]', values: ['', '', '', '', '', ''] })
		expect(aux(op.frames[2])?.values).toEqual(['a', 'b', '', '', '', ''])
		expect(op.frames[2].moves).toEqual([['1', 'aux:1']])
		const replace = op.frames.find((f) => f.caption?.startsWith('a = newArr'))!
		expect(aux(replace)).toBeUndefined()
		expect(replace.caption).toBe('a = newArr: capacity 3 → 6. The old array is garbage now')
		expect(replace.moves).toEqual([
			['aux:0', '0'],
			['aux:1', '1'],
			['aux:2', '2'],
		])
		expect(counts(op)).toEqual({ copies: 3 })
		expect(last(op).caption).toBe('Growing cost 3 copies, one per value: doubling makes it rare')
	})

	it('append writes into a[size] when there is room, and grows first when full', () => {
		const room = appendFixed(fixed(['a', ''], 1), 1, 'b')
		expect(room.result).toMatchObject({ values: ['a', 'b'], used: 2 })
		expect(counts(room)).toEqual({ copies: 0 })
		const full = appendFixed(fixed(['a', 'b'], 2), 2, 'c')
		expect(full.result).toMatchObject({ values: ['a', 'b', 'c', ''], used: 3 })
		expect(counts(full)).toEqual({ copies: 2 })
		expect(full.frames.map((f) => f.caption)).toContain('Copy all 2 values into newArr')
	})
})

describe('appending many values', () => {
	const full = { values: ['1', '2', '3', '4'], marks: {}, used: 4 }
	const more = ['5', '6', '7', '8', '9', '10', '11', '12']

	it('doubling: two grows (4 -> 8 -> 16), 12 copies for 8 appends', () => {
		const op = appendMany(full, 4, more, 'double')
		expect(op.result).toMatchObject({ used: 12 })
		expect(op.result?.values).toHaveLength(16)
		expect(counts(op)).toEqual({ appends: 8, copies: 12 })
		expect(last(op).caption).toBe(
			'8 appends cost 8 writes + 12 copies = 20, 2.5 each: the copies (1 + 2 + 4 + …) add up to less than 2n, so n appends cost under 3n: amortised O(1)'
		)
	})

	it('growing by one: a grow on every append, 4 + 5 + ... + 11 = 60 copies', () => {
		const op = appendMany(full, 4, more, 'plus-one')
		expect(op.result?.values).toHaveLength(12)
		expect(counts(op)).toEqual({ appends: 8, copies: 60 })
		expect(last(op).caption).toMatch(/^8 appends cost 8 writes \+ 60 copies = 68, 8\.5 each/)
	})
})

describe("predict mode's questions", () => {
	// A question must not give the answer away: the step after a comparison asks the same whichever way it goes.
	const asksOf = (op: ArrayOperation, caption: RegExp) => op.frames.filter((f) => caption.test(f.caption ?? '')).map((f) => f.ask)

	it('binary search asks for mid, then "found it, or which half?" whatever the outcome, the mid cell in focus', () => {
		const found = binarySearch(arr(1, 3, 5, 7, 9), '7')
		const missed = binarySearch(arr(1, 3, 5, 7, 9), '4')
		expect(asksOf(found, /^mid = /)).toEqual(['lo = 0, hi = 4: which index is mid?', 'lo = 3, hi = 4: which index is mid?'])
		const decisions = [...found.frames, ...missed.frames].filter((f) => /^(Yes|\d+ [<>] )/.test(f.caption ?? ''))
		expect(decisions.length).toBeGreaterThan(2)
		for (const f of decisions) expect(f.ask).toMatch(/^a\[\d\] = \d vs \d: found it, or which half is left\?$/)
		expect(found.frames.find((f) => f.caption?.startsWith('Yes'))?.askFocus).toEqual(['3'])
	})

	it('sorts ask "swap or not?" before each comparison; the swap that follows has nothing to guess', () => {
		for (const op of [bubbleSort(arr(3, 1, 2)), insertionSort(arr(3, 1, 2))]) {
			const comparisons = op.frames.filter((f) => /: (swap them|leave them|.* is in place)$/.test(f.caption ?? ''))
			expect(comparisons.length).toBeGreaterThan(1)
			for (const f of comparisons) expect(f.ask).toMatch(/swap them or (not|leave them)\?$/)
			for (const f of op.frames.filter((f) => f.caption?.startsWith('swap('))) expect(f.ask).toBe(false)
			expect(last(op).ask).toBe(false)
		}
	})

	it('quicksort and merge sort ask which call comes next', () => {
		expect(asksOf(quicksort(arr(3, 1, 2)), /^quicksort\(/).every((ask) => ask === 'Which call comes next?')).toBe(true)
		expect(asksOf(mergeSort(arr(3, 1, 2)), /^mergeSort\(/).every((ask) => ask === 'Which call comes next?')).toBe(true)
	})

	it('inserting asks first which value moves (from the end, so nothing is overwritten)', () => {
		const op = insertAt(arr(1, 2, 3), 0, '9')
		expect(op.frames.map((f) => f.ask)).toEqual([
			'Insert 9 at index 0: where does the room come from?',
			'There is room at the end: which value moves first?',
			'Which value moves next, and where to?',
			'Which value moves next, and where to?',
			'Every value from index 0 on has moved: what now?',
		])
	})
})

describe('recursive sums', () => {
	const values = arr(3, 1, 4, 1, 5, 9, 2, 6)

	it('last + rest: one call per value, all on the stack at once', () => {
		const op = sumByRest(values)
		expect(counts(op)).toEqual({ calls: 8, 'max depth': 8, additions: 7 })
		expect(last(op).caption).toBe('sum(0, 7) = 31: 8 calls, all on the stack at once (one per value), and 7 additions')
		const { calls, returned } = callRun(op.frames)
		expect(calls.map((c) => c.label)).toEqual(['sum(0, 7)', 'sum(0, 6)', 'sum(0, 5)', 'sum(0, 4)', 'sum(0, 3)', 'sum(0, 2)', 'sum(0, 1)', 'sum(0, 0)'])
		// A stick: each call made by the one before.
		expect(calls.map((c) => c.parent)).toEqual([-1, 0, 1, 2, 3, 4, 5, 6])
		expect(calls.map((c) => c.result)).toEqual(['31', '25', '23', '14', '9', '8', '4', '3'])
		expect(returned.every((r) => r !== undefined)).toBe(true)
		// The array doesn't change.
		expect(op.result).toBeUndefined()
	})

	it('by halves: 2n - 1 calls, never more than log n + 1 deep, the same additions', () => {
		const op = sumByHalves(values)
		expect(counts(op)).toEqual({ calls: 15, 'max depth': 4, additions: 7 })
		const { calls } = callRun(op.frames)
		expect(calls[0]).toEqual({ label: 'sum(0, 7)', parent: -1, result: '31' })
		expect(calls.filter((c) => c.parent === 0).map((c) => [c.label, c.result])).toEqual([
			['sum(0, 3)', '9'],
			['sum(4, 7)', '22'],
		])
		expect(op.frames[0].caption).toBe('sum(0, 7): mid = (0 + 7) / 2 = 3, so sum(0, 3) + sum(4, 7)')
		expect(op.frames[0].pointers?.map((p) => `${p.name}=${p.at}`)).toEqual(['lo=0', 'mid=3', 'hi=7'])
	})

	it('a base case is made and returns in one step; a return step asks what it returns', () => {
		const op = sumByHalves(arr(2, 5))
		expect(op.frames.map((f) => f.calls)).toEqual([
			[{ call: 'sum(0, 1)' }],
			[{ call: 'sum(0, 0)' }, { returns: '2' }],
			[{ call: 'sum(1, 1)' }, { returns: '5' }],
			[{ returns: '7' }],
			undefined,
		])
		expect(op.frames[3].ask).toBe('What does sum(0, 1) return?')
		expect(last(op).ask).toBe(false)
	})

	it('one value is a single base case; decimals add without float noise', () => {
		expect(callRun(sumByRest(arr(4)).frames).calls).toEqual([{ label: 'sum(0, 0)', parent: -1, result: '4' }])
		expect(callRun(sumByHalves(arr(0.1, 0.2)).frames).calls[0].result).toBe('0.3')
	})
})
