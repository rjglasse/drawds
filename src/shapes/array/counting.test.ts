import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import { COUNT_MAX, countingSort } from './counting'

const array = (...values: (string | number)[]) => ({ values: values.map(String), marks: {} })

describe('counting sort', () => {
	it('counts, sums, places from the right, copies back: sorted, no comparisons', () => {
		const op = countingSort(array(3, 0, 2, 3, 1, 0))
		expect(op.code).toBe('counting-sort')
		expect(op.result?.values).toEqual(['0', '0', '1', '2', '3', '3'])
		expect(op.frames.map((f) => f.line)).toEqual([
			'alloc',
			...Array(6).fill('count'),
			...Array(3).fill('prefix'),
			'out',
			...Array(6).fill('place'),
			'copy',
		])
		expect(op.frames.at(-1)?.counts).toEqual({ comparisons: 0 })
		// count[] after the pass, then as prefix sums.
		const counts = (line: string) => op.frames.filter((f) => f.line === line).at(-1)?.strips?.[0].items
		expect(counts('count')).toEqual(['2', '1', '1', '2'])
		expect(counts('prefix')).toEqual(['2', '3', '4', '6'])
		expect(op.frames[0].strips?.[0]).toMatchObject({ title: 'count[]', labels: ['0', '1', '2', '3'] })
		expect(op.frames[1].caption).toBe('a[0] = 3: count[3]++ → 1')
		expect(op.frames[7].caption).toBe('count[1] += count[0]: 1 + 2 = 3 values are ≤ 1')
	})

	it('places from the right into out, a second row: the last 0 at out[1], the first at out[0] (stable)', () => {
		const op = countingSort(array(3, 0, 2, 3, 1, 0))
		const places = op.frames.filter((f) => f.line === 'place')
		expect(places[0]).toMatchObject({ caption: 'a[5] = 0: count[0]-- → 1; out[1] = 0', moves: [['5', 'aux:1']] })
		expect(places.at(-1)?.caption).toBe('a[0] = 3: count[3]-- → 4; out[4] = 3')
		expect((places.at(-1)?.props as { aux?: { values: string[] } }).aux?.values).toEqual(['0', '0', '1', '2', '3', '3'])
		// The copy back: every value slides up from out.
		expect(op.frames.at(-1)?.moves).toEqual(['0', '1', '2', '3', '4', '5'].map((j) => [`aux:${j}`, j]))
		expect(stateAt(op.frames, op.frames.length - 1).strips?.[0].title).toBe('count[]')
	})

	it('equal values keep their order: marks travel with them', () => {
		const op = countingSort({ values: ['1', '1', '0'], marks: { 0: 'red', 1: 'blue' } })
		expect(op.result).toMatchObject({ values: ['0', '1', '1'], marks: { 1: 'red', 2: 'blue' } })
	})

	it('only small whole numbers: anything else says why, and changes nothing', () => {
		const big = countingSort(array(3, 40, 2))
		expect(big.result).toBeUndefined()
		expect(big.frames).toHaveLength(1)
		expect(big.frames[0].caption).toContain(`these go up to 40, 41 counts, more than drawds draws (${COUNT_MAX + 1})`)
		expect(countingSort(array(3, -1, 2)).frames[0].caption).toContain("-1 isn't one")
		expect(countingSort(array('B', 'A')).frames[0].caption).toContain("B isn't one")
		expect(countingSort(array(COUNT_MAX, 0)).result?.values).toEqual(['0', String(COUNT_MAX)])
	})
})
