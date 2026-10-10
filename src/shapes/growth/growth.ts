import { mulberry32, randomInt } from '../../data/random'
import { recorder, type ArrayOperation, type ArrayState } from '../array/operations'
import { countSort, type CountedSort } from '../array/sort-counts'

// Lecture 10b's empirical analysis, counted rather than timed: one sort's comparisons (its basic
// operation) at n = 10, 100 and 1000, on sorted, reversed and random input and on values 0-2 only
// (the lecture's data with max 2: many equal values). Each row has ten times the values of the row
// above, so the factor a count grows by says how it grows: about ×10 linear, ×15 n log n, ×100
// quadratic. Unlike the lecture's milliseconds, counts are the same on any computer, warmed up or
// not, run once or averaged. Pure.

export const GROWTH_SIZES = [10, 100, 1000] as const
export const GROWTH_ORDERS = ['sorted', 'reversed', 'random', 'few'] as const
export type GrowthOrder = (typeof GROWTH_ORDERS)[number]

export const ORDER_TITLES: Record<GrowthOrder, string> = { sorted: 'sorted', reversed: 'reversed', random: 'random', few: '0-2 only' }

export const SORT_NAMES: Record<CountedSort, string> = {
	'insertion-sort': 'Insertion sort',
	'selection-sort': 'Selection sort',
	'bubble-sort': 'Bubble sort',
	'merge-sort': 'Merge sort',
	quicksort: 'Quicksort',
	'quicksort-random': 'Quicksort, random pivot',
	'quicksort-median': 'Quicksort, median of three',
	'quicksort-3way': 'Quicksort, three-way',
	'quicksort-cutoff': 'Quicksort with a cut-off',
}

/** A sort's name as a table's title gives it (a cut-off says which). */
export const sortTitle = (sort: CountedSort, cutoff: number) => (sort === 'quicksort-cutoff' ? `${SORT_NAMES[sort]} of ${cutoff}` : SORT_NAMES[sort])

/** A different stream for each column and size, so no cell's input depends on another's. */
const streamSeed = (seed: number, order: GrowthOrder, n: number) => (seed ^ Math.imul(GROWTH_ORDERS.indexOf(order) + 1, 0x9e3779b1) ^ Math.imul(n, 0x85ebca6b)) >>> 0

/** `n` values in `order`: 0..n-1 sorted, reversed or shuffled (Fisher-Yates), or each 0, 1 or 2. */
export function growthInput(order: GrowthOrder, n: number, seed: number): number[] {
	const rng = mulberry32(streamSeed(seed, order, n))
	const upTo = Array.from({ length: n }, (_, i) => i)
	switch (order) {
		case 'sorted':
			return upTo
		case 'reversed':
			return upTo.reverse()
		case 'random':
			for (let i = n - 1; i > 0; i--) {
				const k = randomInt(0, i, rng)
				;[upTo[i], upTo[k]] = [upTo[k], upTo[i]]
			}
			return upTo
		case 'few':
			return upTo.map(() => randomInt(0, 2, rng))
	}
}

export type Growth = 'n' | 'n log n' | 'n²'

/**
 * How each sort's comparisons grow on each kind of input, as the analysis has it: the table's factors
 * are the evidence (×10 linear, ×15 n log n, ×100 quadratic), but a single run's factor can't tell n
 * from n log n (three-way quicksort on 0-2 values is linear, its constant up to the pivots it happens
 * to get: ×7 to ×14 from 100 to 1000).
 */
export const GROWTH: Record<CountedSort, Record<GrowthOrder, Growth>> = {
	'insertion-sort': { sorted: 'n', reversed: 'n²', random: 'n²', few: 'n²' },
	'selection-sort': { sorted: 'n²', reversed: 'n²', random: 'n²', few: 'n²' },
	'bubble-sort': { sorted: 'n', reversed: 'n²', random: 'n²', few: 'n²' },
	'merge-sort': { sorted: 'n log n', reversed: 'n log n', random: 'n log n', few: 'n log n' },
	// The last value as pivot: sorted or reversed, each partition peels off one value; equal values all
	// go right of the pivot (a[j] < pivot), so a run of them is peeled one at a time too.
	quicksort: { sorted: 'n²', reversed: 'n²', random: 'n log n', few: 'n²' },
	'quicksort-random': { sorted: 'n log n', reversed: 'n log n', random: 'n log n', few: 'n²' },
	'quicksort-median': { sorted: 'n log n', reversed: 'n log n', random: 'n log n', few: 'n²' },
	// Equal values placed at once: three values take a few passes. Sorted input still peels one off.
	'quicksort-3way': { sorted: 'n²', reversed: 'n²', random: 'n log n', few: 'n' },
	'quicksort-cutoff': { sorted: 'n²', reversed: 'n²', random: 'n log n', few: 'n²' },
}

export interface GrowthTable {
	/** Comparisons by row (n, as GROWTH_SIZES) and column (order, as GROWTH_ORDERS). */
	counts: number[][]
	/** Each count over the one above it (the first row has none). */
	factors: (number | undefined)[][]
	/** How each column grows (GROWTH). */
	growth: Growth[]
}

const tables = new Map<string, GrowthTable>()

/** `sort`'s comparisons at each size on each kind of input (a random pivot's picks from `seed` too). */
export function growthTable(sort: CountedSort, seed: number, cutoff = 3): GrowthTable {
	const key = `${sort}:${seed}:${cutoff}`
	const known = tables.get(key)
	if (known) return known
	const counts = GROWTH_SIZES.map((n) =>
		GROWTH_ORDERS.map((order) => countSort(sort, growthInput(order, n, seed), { rng: mulberry32(streamSeed(seed + 1, order, n)), cutoff }).comparisons)
	)
	const factors = counts.map((row, k) => row.map((c, col) => (k === 0 ? undefined : c / Math.max(1, counts[k - 1][col]))))
	const growth = GROWTH_ORDERS.map((order) => GROWTH[sort][order])
	const table = { counts, factors, growth }
	tables.set(key, table)
	return table
}

/** A count as the table shows it, and a factor (×101, ×9.9). */
export const showCount = (c: number) => c.toLocaleString('en')
export const showFactor = (f: number) => `×${f >= 9.95 ? Math.round(f) : f.toFixed(1)}`

/**
 * The table filled in a row at a time, in a view beside the array (`Frame.growth`: how many rows
 * show; one more for how each column grows): predict mode asks how many comparisons ten times the
 * values take before each row shows.
 */
export function growthOperation(start: ArrayState, sort: CountedSort, seed: number, cutoff = 3): ArrayOperation {
	const r = recorder(start, {})
	const table = growthTable(sort, seed, cutoff)
	const name = sortTitle(sort, cutoff)
	const step = (rows: number, caption: string, ask: string | false) => {
		r.step(caption, { ask })
		r.frames[r.frames.length - 1].growth = { sort, rows }
	}
	step(1, `${name}'s comparisons at n = 10: on sorted, reversed and random input, and on values 0-2 only (many equal values)`, false)
	GROWTH_SIZES.forEach((n, k) => {
		if (k === 0) return
		const factors = GROWTH_ORDERS.map((order, col) => `${ORDER_TITLES[order]} ${showFactor(table.factors[k][col]!)}`).join(', ')
		step(k + 1, `n = ${showCount(n)}, ten times the values: ${factors}`, `n = ${showCount(n)}, ten times the values: how many comparisons now?`)
	})
	const growth = GROWTH_ORDERS.map((order, col) => `${ORDER_TITLES[order]} ${table.growth[col]}`).join(', ')
	step(
		GROWTH_SIZES.length + 1,
		`Ten times the values: about ×10 is linear (n), ×15 n log n, ×100 quadratic (n²). ${name}: ${growth}. Random input wobbles from run to run, but counts, unlike times, are the same on any computer`,
		'How does each column grow?'
	)
	return { frames: r.frames }
}
