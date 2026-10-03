import type { Marks } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { Rng } from '../../data/random'

// Instant rearrangements (sort, shuffle, reverse) as an order: `order[i]` is the old index of the
// value that ends up at i. Values and marks follow the order; the shape animates each value from
// its old cell (see `orderSlides`).

/** Ascending (or descending) by `compareKeys`; equal values keep their order. */
export function sortedOrder(values: readonly string[], descending = false): number[] {
	const sign = descending ? -1 : 1
	return values.map((_, i) => i).sort((a, b) => sign * compareKeys(values[a], values[b]) || a - b)
}

export function reversedOrder(n: number): number[] {
	return Array.from({ length: n }, (_, i) => n - 1 - i)
}

/** A random order (Fisher-Yates) that moves something whenever there are two values or more. */
export function shuffledOrder(n: number, rng: Rng): number[] {
	const order = Array.from({ length: n }, (_, i) => i)
	for (let attempt = 0; attempt < 10; attempt++) {
		for (let i = n - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1))
			;[order[i], order[j]] = [order[j], order[i]]
		}
		if (n < 2 || order.some((j, i) => j !== i)) return order
	}
	return reversedOrder(n)
}

/** Values and marks rearranged by `order` (marks travel with their values). */
export function rearrange(values: readonly string[], marks: Marks, order: readonly number[]) {
	const moved: Marks = {}
	order.forEach((j, i) => {
		const mark = marks[String(j)]
		if (mark) moved[String(i)] = mark
	})
	return { values: order.map((j) => values[j]), marks: moved }
}

/** Whether the order changes anything. */
export const movesAnything = (order: readonly number[]) => order.some((j, i) => j !== i)
