import { describe, expect, it } from 'vitest'
import { COUNTED_SORTS } from '../array/sort-counts'
import { GROWTH, GROWTH_ORDERS, GROWTH_SIZES, growthInput, growthOperation, growthTable, showFactor, type Growth } from './growth'
import { growthLayout, growthTitle } from './layout'

// Lecture 10b's experiment, counted: a sort's comparisons at n = 10, 100, 1000 on four kinds of input.

describe('counts as n grows', () => {
	it('inputs: sorted, reversed, a shuffle of 0..n-1, or 0-2 only; the same for the same seed', () => {
		expect(growthInput('sorted', 5, 1)).toEqual([0, 1, 2, 3, 4])
		expect(growthInput('reversed', 5, 1)).toEqual([4, 3, 2, 1, 0])
		const random = growthInput('random', 100, 7)
		expect([...random].sort((a, b) => a - b)).toEqual(growthInput('sorted', 100, 7))
		expect(random).toEqual(growthInput('random', 100, 7))
		expect(random).not.toEqual(growthInput('random', 100, 8))
		const few = growthInput('few', 300, 7)
		expect(new Set(few)).toEqual(new Set([0, 1, 2]))
	})

	it("insertion sort's comparisons: n - 1 on sorted input, n(n - 1)/2 reversed, each with its factor", () => {
		const table = growthTable('insertion-sort', 3)
		expect(table.counts.map((row) => row[0])).toEqual([9, 99, 999])
		expect(table.counts.map((row) => row[1])).toEqual([45, 4950, 499500])
		expect(table.factors[0]).toEqual([undefined, undefined, undefined, undefined])
		expect(showFactor(table.factors[2][1]!)).toBe('×101')
		expect(showFactor(table.factors[2][0]!)).toBe('×10')
		expect(table.growth).toEqual(['n', 'n²', 'n²', 'n²'])
		expect(growthTable('insertion-sort', 3)).toBe(table)
	})

	it("every column's factor from 100 to 1000 agrees with how the analysis says it grows, whatever the seed", () => {
		const band: Record<Growth, [number, number]> = { n: [7, 14.5], 'n log n': [11, 25], 'n²': [60, 130] }
		for (const sort of COUNTED_SORTS)
			for (let seed = 1; seed <= 25; seed++) {
				const { factors } = growthTable(sort, seed)
				GROWTH_ORDERS.forEach((order, col) => {
					const f = factors[GROWTH_SIZES.length - 1][col]!
					const [lo, hi] = band[GROWTH[sort][order]]
					expect(f, `${sort} ${order} seed ${seed}`).toBeGreaterThanOrEqual(lo)
					expect(f, `${sort} ${order} seed ${seed}`).toBeLessThanOrEqual(hi)
				})
			}
	})

	it('the lesson of lecture 10a in one row each: only a three-way partition copes with 0-2 values', () => {
		expect(GROWTH_ORDERS.map((o) => GROWTH.quicksort[o])).toEqual(['n²', 'n²', 'n log n', 'n²'])
		expect(GROWTH_ORDERS.map((o) => GROWTH['quicksort-median'][o])).toEqual(['n log n', 'n log n', 'n log n', 'n²'])
		expect(GROWTH_ORDERS.map((o) => GROWTH['quicksort-3way'][o])).toEqual(['n²', 'n²', 'n log n', 'n'])
	})

	it('filled in a row at a time, predict mode asking before each, then how each column grows', () => {
		const op = growthOperation({ values: ['3', '1', '2'], marks: {} }, 'quicksort', 5)
		expect(op.frames.map((f) => f.growth)).toEqual([1, 2, 3, 4].map((rows) => ({ sort: 'quicksort', rows })))
		expect(op.frames.map((f) => f.ask)).toEqual([
			false,
			'n = 100, ten times the values: how many comparisons now?',
			'n = 1,000, ten times the values: how many comparisons now?',
			'How does each column grow?',
		])
		expect(op.frames[2].caption).toMatch(/^n = 1,000, ten times the values: sorted ×101, reversed ×101, random ×\d+, 0-2 only ×\d+$/)
		expect(op.frames[3].caption).toContain('Quicksort: sorted n², reversed n², random n log n, 0-2 only n²')
		expect(op.result).toBeUndefined()
		expect(growthOperation({ values: ['1'], marks: {} }, 'quicksort-cutoff', 5, 4).frames[0].caption).toMatch(/^Quicksort with a cut-off of 4's comparisons at n = 10/)
	})

	it('laid out with every row, so it holds still; wide enough for its title and its largest count', () => {
		const layout = growthLayout('selection-sort', 1, 3, 'm')
		expect(layout.rows).toHaveLength(GROWTH_SIZES.length + 2)
		expect(layout.cols).toHaveLength(GROWTH_ORDERS.length + 1)
		const right = layout.cols[layout.cols.length - 1]
		expect(layout.box.w).toBeGreaterThanOrEqual(right.x + right.w)
		expect(layout.box.w).toBeGreaterThanOrEqual(growthTitle('selection-sort', 3).length * layout.fontSize * 0.6)
		// '499,500' fits in a column.
		expect(right.w).toBeGreaterThan(7 * layout.fontSize * 0.6)
		expect(growthLayout('selection-sort', 1, 3, 'xl').box.w).toBeGreaterThan(layout.box.w)
	})
})
