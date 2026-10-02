import { mulberry32, randomInt, type Rng } from './random'

/** How a structure's values are populated. */
export const FILL_MODES = ['random', 'empty', 'ascending', 'descending', 'nearly-sorted', 'letters'] as const
export type FillMode = (typeof FILL_MODES)[number]

const MAX_VALUE = 99
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * `count` values for a structure, deterministic in `seed`.
 *
 * Random modes draw values in the order items were sketched, so growing a sketch keeps the values
 * already shown; `reversed` flips them for structures whose index order runs against the drag
 * (an array drawn leftwards). Sorted modes are sorted in index order, so their values re-sort as
 * the sketch grows.
 */
export function fillValues(mode: FillMode, seed: number, count: number, { reversed = false } = {}): string[] {
	const rng = mulberry32(seed)
	const inDrawOrder = (values: string[]) => (reversed ? values.reverse() : values)
	switch (mode) {
		case 'empty':
			return Array.from({ length: count }, () => '')
		case 'random':
			return inDrawOrder(Array.from({ length: count }, () => String(randomInt(0, MAX_VALUE, rng))))
		case 'letters':
			return inDrawOrder(Array.from({ length: count }, () => LETTERS[randomInt(0, LETTERS.length - 1, rng)]))
		case 'ascending':
			return sortedInts(count, rng).map(String)
		case 'descending':
			return sortedInts(count, rng).reverse().map(String)
		case 'nearly-sorted': {
			const values = sortedInts(count, rng)
			// A separate stream, so the underlying values match 'ascending' for the same seed.
			nudge(values, mulberry32(seed ^ 0x9e3779b9))
			return values.map(String)
		}
	}
}

/**
 * Resize a sequence to `count` values, keeping existing (generated or typed) values and adding or
 * removing at the end, or at the start with `atStart`. New values follow `mode`: random modes
 * continue a seeded stream (at the end, the same one a longer sketch would use), sorted modes
 * continue the run outwards from the neighbouring value.
 */
export function extendValues(
	values: readonly string[],
	mode: FillMode,
	seed: number,
	count: number,
	{ atStart = false } = {}
): string[] {
	const added = count - values.length
	if (added <= 0) return atStart ? values.slice(values.length - count) : values.slice(0, count)
	if (!atStart) {
		const out = [...values]
		for (let i = values.length; i < count; i++) out.push(nextValue(out[i - 1], mode, seed, i, 1))
		return out
	}
	// Build outwards from the old first value: front[0] is next to it.
	const front: string[] = []
	for (let j = 1; j <= added; j++) front.push(nextValue(front[j - 2] ?? values[0], mode, seed ^ 0x2545f491, j - 1, -1))
	return [...front.reverse(), ...values]
}

/**
 * A value for an element inserted between `before` and `after` (either may be missing at an end).
 * Sorted modes pick a value between the neighbours, so the run stays sorted; random modes draw a
 * fresh value. `salt` (e.g. the new element's id number) makes it deterministic per insertion.
 */
export function insertValue(
	before: string | undefined,
	after: string | undefined,
	mode: FillMode,
	seed: number,
	salt: number
): string {
	const rng = mulberry32((seed ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0)
	const num = (v: string | undefined) => (v !== undefined && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)
	const [a, b] = [num(before), num(after)]
	switch (mode) {
		case 'empty':
			return ''
		case 'letters':
			return LETTERS[randomInt(0, LETTERS.length - 1, rng)]
		case 'random':
			return String(randomInt(0, MAX_VALUE, rng))
		case 'ascending':
		case 'descending':
		case 'nearly-sorted':
			if (a !== undefined && b !== undefined) return String(randomInt(Math.min(a, b), Math.max(a, b), rng))
			if (a !== undefined) return String(a + (mode === 'descending' ? -1 : 1) * randomInt(1, 9, rng))
			if (b !== undefined) return String(b - (mode === 'descending' ? -1 : 1) * randomInt(1, 9, rng))
			return String(randomInt(0, MAX_VALUE, rng))
	}
}

/**
 * The value at `index` of a stream, next to `neighbour`. `dir` is +1 growing away from the start
 * and -1 growing away from the end (so an ascending run keeps ascending in index order).
 */
function nextValue(neighbour: string | undefined, mode: FillMode, seed: number, index: number, dir: 1 | -1): string {
	// One stream per index, so a value doesn't depend on how the shape grew to reach it.
	const rng = mulberry32((seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0)
	const n = Number(neighbour ?? 0)
	const base = Number.isFinite(n) ? n : 0
	switch (mode) {
		case 'empty':
			return ''
		case 'random':
		case 'letters':
			return fillValues(mode, seed, index + 1)[index]
		case 'ascending':
		case 'nearly-sorted':
			return String(base + dir * randomInt(1, 9, rng))
		case 'descending':
			return String(base - dir * randomInt(1, 9, rng))
	}
}

function sortedInts(count: number, rng: Rng) {
	return Array.from({ length: count }, () => randomInt(0, MAX_VALUE, rng)).sort((a, b) => a - b)
}

/** Swap a few adjacent pairs (about one per five values). */
function nudge(values: number[], rng: Rng) {
	if (values.length < 2) return
	const swaps = Math.max(1, Math.round(values.length / 5))
	for (let s = 0; s < swaps; s++) {
		const i = randomInt(0, values.length - 2, rng)
		;[values[i], values[i + 1]] = [values[i + 1], values[i]]
	}
}
