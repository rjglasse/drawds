import { describe, expect, it } from 'vitest'
import { allUnique, findMax, sentinelSearch } from './scans'

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
