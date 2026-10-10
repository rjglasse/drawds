import { compareKeys } from '../../data/compare'
import { randomInt, type Rng } from '../../data/random'

// The sorts' counts without their steps: what the play bar ends on, for inputs far too long to step
// through (the counts table's n = 1000) and for comparing a run with plain quicksort's on the same
// input. Each counts exactly what its step-by-step version (operations.ts, quicksorts.ts) counts, by
// the same names; the unit test runs both. Values are numbers here: `ranks` turns any array's values
// into numbers in the same order.

export type Counts = Record<string, number>

/** The sorts that can be counted, by their step-by-step operations' code names. */
export const COUNTED_SORTS = [
	'insertion-sort',
	'selection-sort',
	'bubble-sort',
	'merge-sort',
	'quicksort',
	'quicksort-random',
	'quicksort-median',
	'quicksort-3way',
	'quicksort-cutoff',
] as const
export type CountedSort = (typeof COUNTED_SORTS)[number]

/** Each value's place among the distinct values (compared as `compareKeys` does): equal values, equal ranks. */
export function ranks(values: readonly string[]): number[] {
	const distinct = [...new Set(values)].sort(compareKeys)
	const rank = new Map<string, number>()
	distinct.forEach((v, k) => rank.set(v, k > 0 && compareKeys(distinct[k - 1], v) === 0 ? rank.get(distinct[k - 1])! : k))
	return values.map((v) => rank.get(v)!)
}

export interface CountOptions {
	/** A random pivot's picks (quicksort-random), in the order the calls make them. */
	rng?: Rng
	/** quicksort-cutoff's cut-off: sub-arrays this long or shorter are insertion sorted. */
	cutoff?: number
}

/** `sort`'s counts on `input` (left as it is). */
export function countSort(sort: CountedSort, input: readonly number[], options: CountOptions = {}): Counts {
	const a = [...input]
	switch (sort) {
		case 'insertion-sort':
			return insertion(a)
		case 'selection-sort':
			return selection(a)
		case 'bubble-sort':
			return bubble(a)
		case 'merge-sort':
			return merge(a)
		default:
			return quick(a, sort, options)
	}
}

function swap(a: number[], i: number, j: number) {
	const t = a[i]
	a[i] = a[j]
	a[j] = t
}

function insertion(a: number[]): Counts {
	const c = { comparisons: 0, swaps: 0, 'while tests': 0 }
	for (let i = 1; i < a.length; i++) {
		for (let j = i; j > 0; j--) {
			c.comparisons++
			c['while tests']++
			if (a[j - 1] <= a[j]) break
			swap(a, j - 1, j)
			c.swaps++
			// j > 0 stops the loop at the front, comparing nothing.
			if (j === 1) c['while tests']++
		}
	}
	return c
}

function selection(a: number[]): Counts {
	const c = { comparisons: 0, swaps: 0 }
	for (let i = 0; i < a.length - 1; i++) {
		let min = i
		for (let j = i + 1; j < a.length; j++) {
			c.comparisons++
			if (a[j] < a[min]) min = j
		}
		if (min !== i) {
			swap(a, i, min)
			c.swaps++
		}
	}
	return c
}

function bubble(a: number[]): Counts {
	const c = { comparisons: 0, swaps: 0 }
	for (let pass = 1; pass < a.length; pass++) {
		let swapped = false
		for (let j = 0; j < a.length - pass; j++) {
			c.comparisons++
			if (a[j] > a[j + 1]) {
				swap(a, j, j + 1)
				c.swaps++
				swapped = true
			}
		}
		if (!swapped) break
	}
	return c
}

function merge(a: number[]): Counts {
	const c = { comparisons: 0, copies: 0 }
	const sort = (lo: number, hi: number) => {
		if (lo >= hi) return
		const mid = Math.floor((lo + hi) / 2)
		sort(lo, mid)
		sort(mid + 1, hi)
		const merged: number[] = []
		let i = lo
		let j = mid + 1
		while (i <= mid || j <= hi) {
			if (i > mid) merged.push(a[j++])
			else if (j > hi) merged.push(a[i++])
			else {
				c.comparisons++
				merged.push(a[i] <= a[j] ? a[i++] : a[j++])
			}
		}
		// Into the merged run, then back.
		c.copies += 2 * merged.length
		for (let k = 0; k < merged.length; k++) a[lo + k] = merged[k]
	}
	sort(0, a.length - 1)
	return c
}

/** Lomuto's partition of a[lo..hi] around a[hi]: the pivot's final index. */
function lomuto(a: number[], lo: number, hi: number, c: Counts): number {
	const p = a[hi]
	let i = lo - 1
	for (let j = lo; j < hi; j++) {
		c.comparisons++
		if (a[j] < p) {
			i++
			if (i !== j) {
				swap(a, i, j)
				c.swaps++
			}
		}
	}
	if (i + 1 !== hi) {
		swap(a, i + 1, hi)
		c.swaps++
	}
	return i + 1
}

/**
 * The index of the middle value of three (indices i, j, k; `less` compares the values at two), as the
 * code's `medianOf3` finds it, with 2 or 3 comparisons.
 */
export function medianOf3(less: (x: number, y: number) => boolean, i: number, j: number, k: number): { at: number; comparisons: number } {
	if (less(i, j)) {
		if (less(j, k)) return { at: j, comparisons: 2 }
		return { at: less(i, k) ? k : i, comparisons: 3 }
	}
	if (less(i, k)) return { at: i, comparisons: 2 }
	return { at: less(j, k) ? k : j, comparisons: 3 }
}

/**
 * Quicksort and its variants. The calls go on a stack of our own, in the order the recursion makes
 * them (left side first), so sorted input 10,000 long doesn't overflow JavaScript's.
 */
function quick(a: number[], sort: CountedSort, { rng, cutoff = 3 }: CountOptions): Counts {
	const c = { comparisons: 0, swaps: 0, calls: 0, 'max depth': 0 }
	const todo: [lo: number, hi: number, depth: number][] = [[0, a.length - 1, 1]]
	while (todo.length) {
		const [lo, hi, depth] = todo.pop()!
		c.calls++
		c['max depth'] = Math.max(c['max depth'], depth)
		const call = (l: number, h: number) => [l, h, depth + 1] as [number, number, number]
		if (sort === 'quicksort-cutoff' && hi - lo + 1 <= cutoff) {
			// Insertion sort of a[lo..hi], j stopping at lo.
			for (let i = lo + 1; i <= hi; i++) {
				for (let j = i; j > lo; j--) {
					c.comparisons++
					if (a[j - 1] <= a[j]) break
					swap(a, j - 1, j)
					c.swaps++
				}
			}
			continue
		}
		if (lo >= hi) continue
		if (sort === 'quicksort-3way') {
			const v = a[hi]
			let [lt, i, gt] = [lo, lo, hi]
			while (i <= gt) {
				c.comparisons++
				if (a[i] < v) {
					if (lt !== i) {
						swap(a, lt, i)
						c.swaps++
					}
					lt++
					i++
					continue
				}
				c.comparisons++
				if (a[i] > v) {
					if (i !== gt) {
						swap(a, i, gt)
						c.swaps++
					}
					gt--
				} else i++
			}
			todo.push(call(gt + 1, hi), call(lo, lt - 1))
			continue
		}
		if (sort === 'quicksort-random') {
			const k = randomInt(lo, hi, rng!)
			if (k !== hi) {
				swap(a, k, hi)
				c.swaps++
			}
		} else if (sort === 'quicksort-median' && hi - lo >= 2) {
			const { at, comparisons } = medianOf3((x, y) => a[x] < a[y], lo, Math.floor((lo + hi) / 2), hi)
			c.comparisons += comparisons
			if (at !== hi) {
				swap(a, at, hi)
				c.swaps++
			}
		}
		const p = lomuto(a, lo, hi, c)
		todo.push(call(p + 1, hi), call(lo, p - 1))
	}
	return c
}
