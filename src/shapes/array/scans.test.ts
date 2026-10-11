import { describe, expect, it } from 'vitest'
import { allUnique, allUniqueBySet, allUniqueBySorting, findMax, sentinelSearch } from './scans'
import { countSort, ranks } from './sort-counts'

const array = (...values: (string | number)[]) => ({ values: values.map(String), marks: {} })
const last = <T,>(xs: T[]) => xs[xs.length - 1]

describe('find the largest (MaxElement)', () => {
	it('compares n - 1 times whatever the order; only the updates vary', () => {
		const op = findMax(array(3, 9, 2, 9, 5))
		expect(last(op.frames).counts).toEqual({ comparisons: 4, updates: 1 })
		expect(op.finalFlash).toEqual({ 1: 'green' })
		expect(last(op.frames).strips).toEqual([{ title: 'maxval', items: ['9'] }])
		expect(last(findMax(array(1, 2, 3, 4)).frames).counts).toEqual({ comparisons: 3, updates: 3 })
		expect(last(findMax(array(4, 3, 2, 1)).frames).counts).toEqual({ comparisons: 3, updates: 0 })
		// One value: nothing to compare.
		expect(last(findMax(array(7)).frames).counts).toEqual({ comparisons: 0, updates: 0 })
	})

	it('asks before each comparison, the same question whichever way it goes', () => {
		const asks = findMax(array(3, 9, 2)).frames.map((f) => f.ask)
		expect(asks.slice(1, 3)).toEqual(['a[1] = 9 vs maxval = 3: a new largest?', 'a[2] = 2 vs maxval = 9: a new largest?'])
		expect(last(asks)).toBe(false)
	})
})

describe('all unique? (UniqueElements)', () => {
	it('all unique is the worst case: every pair, n(n - 1)/2 comparisons', () => {
		const op = allUnique(array(4, 1, 3, 2, 5))
		expect(last(op.frames).counts).toEqual({ comparisons: 10 })
		expect(last(op.frames).caption).toContain('all unique')
		expect(op.finalFlash).toEqual({ 0: 'green', 1: 'green', 2: 'green', 3: 'green', 4: 'green' })
	})

	it('stops at the first equal pair, both lit red', () => {
		const op = allUnique(array(1, 2, 1, 4))
		expect(last(op.frames).counts).toEqual({ comparisons: 2 })
		expect(op.finalFlash).toEqual({ 0: 'red', 2: 'red' })
		expect(last(op.frames).pointers).toEqual([
			{ id: '#i', name: 'i', at: '0' },
			{ id: '#j', name: 'j', at: '2' },
		])
	})
})

describe("all unique? with a set (lecture 3's first faster way)", () => {
	it("adds every value, then compares the set's size with the length once: lecture 3's [1, 2, 2, 4, 5] gives 4", () => {
		const op = allUniqueBySet(array(1, 2, 2, 4, 5))
		expect(op.frames).toHaveLength(7)
		expect(last(op.frames).counts).toEqual({ adds: 5, comparisons: 1 })
		expect(last(op.frames).strips).toEqual([{ title: 'seen', items: ['1', '2', '4', '5'] }])
		expect(last(op.frames).caption).toContain('seen.size() = 4 ≠ a.length = 5: not all unique, return false')
		// The repeat adds nothing: the 2 already in the set lights red, and so does the cell.
		expect(op.frames[3].strips).toEqual([{ title: 'seen', items: ['1', '2'], marks: { 1: 'red' } }])
		expect(op.frames[3].caption).toBe('seen.add(a[2] = 2): 2 is in the set already, so it stays at 2')
		expect(op.finalFlash).toEqual({ 2: 'red' })
		expect(op.code).toBe('all-unique-set')
	})

	it('all different: the set is as big as the array, true', () => {
		const op = allUniqueBySet(array(1, 2, 3, 4, 5))
		expect(last(op.frames).caption).toContain('seen.size() = 5 == a.length = 5: all unique, return true')
		expect(op.finalFlash).toEqual({ 0: 'green', 1: 'green', 2: 'green', 3: 'green', 4: 'green' })
	})

	it('asks the same question whichever way an add goes', () => {
		expect(allUniqueBySet(array(3, 3)).frames.map((f) => f.ask)).toEqual([
			'All unique? Every value goes into a set: what will its size tell us?',
			'seen.add(3): does the set grow?',
			'seen.add(3): does the set grow?',
			false,
		])
	})
})

describe("all unique? by sorting first (lecture 3's second faster way)", () => {
	const aux = (op: ReturnType<typeof allUniqueBySorting>, k: number) => (op.frames[k].props as { aux?: unknown }).aux

	it('copies a into b, sorts b (values sliding into place), then compares neighbours; a repeat stops it', () => {
		const op = allUniqueBySorting(array(4, 2, 5, 2, 1))
		// The copy: each value straight down.
		expect(aux(op, 0)).toEqual({ title: 'b', values: ['4', '2', '5', '2', '1'] })
		expect(op.frames[0].moves).toEqual([0, 1, 2, 3, 4].map((k) => [String(k), `aux:${k}`]))
		// Sorted, equal values side by side; each slides from where it was in b.
		expect(aux(op, 1)).toEqual({ title: 'b', values: ['1', '2', '2', '4', '5'] })
		expect(op.frames[1].moves).toEqual([
			['aux:4', 'aux:0'],
			['aux:1', 'aux:1'],
			['aux:3', 'aux:2'],
			['aux:0', 'aux:3'],
			['aux:2', 'aux:4'],
		])
		const sorting = countSort('merge-sort', ranks(['4', '2', '5', '2', '1'])).comparisons
		expect(last(op.frames).counts).toEqual({ 'sorting comparisons': sorting, 'neighbour comparisons': 2 })
		expect(aux(op, op.frames.length - 1)).toEqual({ title: 'b', values: ['1', '2', '2', '4', '5'], marks: { 1: 'red', 2: 'red' } })
		expect(last(op.frames).caption).toBe(`b[1] = b[2] = 2: neighbours, so not all unique, return false after ${sorting} comparisons sorting + 2 after`)
		// a is left as it was: the repeats lit where they are in it.
		expect((last(op.frames).props as { values: string[] }).values).toEqual(['4', '2', '5', '2', '1'])
		expect(op.finalFlash).toEqual({ 1: 'red', 3: 'red' })
		expect(op.result).toBeUndefined()
	})

	it('all unique: n - 1 neighbour comparisons after the sort, set against every pair', () => {
		const op = allUniqueBySorting(array(1, 2, 3, 4, 5))
		expect(last(op.frames).counts).toEqual({ 'sorting comparisons': 7, 'neighbour comparisons': 4 })
		expect(last(op.frames).caption).toBe(
			"No two neighbours are equal: all unique, return true after 7 comparisons sorting + 4 after = 11, against every pair's n(n - 1)/2 = 10. For 5 values every pair is cheaper, but n log n + n grows far slower: at n = 1000 about 11 000 against 499 500"
		)
		expect(op.finalFlash).toEqual({ 0: 'green', 1: 'green', 2: 'green', 3: 'green', 4: 'green' })
	})
})

describe('sentinel search (SequentialSearch2)', () => {
	it('puts the key past the end, stops on it, and takes it out again', () => {
		const op = sentinelSearch(array(5, 7, 9, 1), '9')
		const values = op.frames.map((f) => (f.props as { values: string[] }).values)
		expect(values[0]).toEqual(['5', '7', '9', '1', '9'])
		expect(last(values)).toEqual(['5', '7', '9', '1'])
		expect(last(op.frames).counts).toEqual({ comparisons: 3, 'i < n checks saved': 2 })
		expect(op.finalFlash).toEqual({ 2: 'green' })
	})

	it('not found: it stops at the sentinel, i = n, every i < n check saved', () => {
		const op = sentinelSearch(array(5, 7, 1), '9')
		expect(last(op.frames).counts).toEqual({ comparisons: 4, 'i < n checks saved': 3 })
		expect(last(op.frames).pointers).toEqual([{ id: '#i', name: 'i', at: '3' }])
		expect(last(op.frames).caption).toContain('not in the array')
		expect(op.finalFlash).toBeUndefined()
	})
})
