import { mulberry32, randomInt, type Rng } from './random'

/** How a structure's values are populated. */
export const FILL_MODES = [
	'random',
	'repeats',
	'empty',
	'ascending',
	'descending',
	'nearly-sorted',
	'letters',
] as const
export type FillMode = (typeof FILL_MODES)[number]

/**
 * The numbers random fills draw from (letters are always A..Z). `few` is 0-2, values repeating on
 * purpose (lecture 10b's data with max 2: quicksort's hard case of many equal values).
 */
export const FILL_RANGES = ['few', 'small', 'medium', 'large', 'signed'] as const
export type FillRange = (typeof FILL_RANGES)[number]
const RANGE: Record<FillRange, [number, number]> = { few: [0, 2], small: [0, 9], medium: [0, 99], large: [0, 999], signed: [-50, 50] }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

type Kind = 'number' | 'letter'
const lowest = (kind: Kind, range: FillRange) => (kind === 'number' ? RANGE[range][0] : 0)
const poolSize = (kind: Kind, range: FillRange) => (kind === 'number' ? RANGE[range][1] - RANGE[range][0] + 1 : LETTERS.length)
const show = (kind: Kind, k: number, range: FillRange) => (kind === 'number' ? String(lowest(kind, range) + k) : LETTERS[k])

/**
 * `count` draws from the range (0..99 by default) or A..Z. Distinct draws come without replacement
 * until the pool runs out, then repeat; each draw only depends on the ones before it, so a longer
 * list of draws extends a shorter one.
 */
function draws(kind: Kind, seed: number, count: number, distinct: boolean, range: FillRange = 'medium'): string[] {
	const rng = mulberry32(seed)
	const pool = poolSize(kind, range)
	const seen = new Set<number>()
	const out: string[] = []
	for (let i = 0; i < count; i++) {
		let k = randomInt(0, pool - 1, rng)
		if (distinct && seen.size < pool) {
			while (seen.has(k)) k = randomInt(0, pool - 1, rng)
			seen.add(k)
		}
		out.push(show(kind, k, range))
	}
	return out
}

/** The first value of the seed's distinct ordering of the pool that isn't already `present`. */
function firstAbsent(kind: Kind, seed: number, present: ReadonlySet<string>, range: FillRange = 'medium'): string {
	const order = draws(kind, seed, poolSize(kind, range), true, range)
	return order.find((v) => !present.has(v)) ?? order[present.size % order.length]
}

/**
 * The next value of a sorted run past `from` (`up` +1 ascending, -1 descending): a few on; from a
 * few values (0-2), the same one or the next, kept in the range.
 */
function stepFrom(from: number, up: number, range: FillRange, rng: Rng): number {
	if (range !== 'few') return from + up * randomInt(1, 9, rng)
	const [lo, hi] = RANGE[range]
	return Math.min(hi, Math.max(lo, from + up * randomInt(0, 1, rng)))
}

const sortedInts = (seed: number, count: number, range: FillRange) =>
	draws('number', seed, count, true, range)
		.map(Number)
		.sort((a, b) => a - b)

/**
 * `count` values for a structure, deterministic in `seed`.
 *
 * Numbers come from `range` (0..99 by default). `random` and `letters` are distinct (until the
 * range's numbers or the 26 letters run out); `repeats` may
 * repeat. Random modes draw values in the order items were sketched, so growing a sketch keeps
 * the values already shown; `reversed` flips them for structures whose index order runs against
 * the drag (an array drawn leftwards). Sorted modes are sorted in index order, so their values
 * re-sort as the sketch grows.
 */
export function fillValues(
	mode: FillMode,
	seed: number,
	count: number,
	{ reversed = false, range = 'medium' as FillRange } = {}
): string[] {
	const inDrawOrder = (values: string[]) => (reversed ? values.reverse() : values)
	switch (mode) {
		case 'empty':
			return Array.from({ length: count }, () => '')
		case 'random':
			return inDrawOrder(draws('number', seed, count, true, range))
		case 'repeats':
			return inDrawOrder(draws('number', seed, count, false, range))
		case 'letters':
			return inDrawOrder(draws('letter', seed, count, true))
		case 'ascending':
			return sortedInts(seed, count, range).map(String)
		case 'descending':
			return sortedInts(seed, count, range).reverse().map(String)
		case 'nearly-sorted': {
			const values = sortedInts(seed, count, range)
			// A separate stream, so the underlying values match 'ascending' for the same seed.
			nudge(values, mulberry32(seed ^ 0x9e3779b9))
			return values.map(String)
		}
	}
}

/**
 * Resize a sequence to `count` values, keeping existing (generated or typed) values and adding or
 * removing at the end, or at the start with `atStart`. New values follow `mode`: distinct modes
 * take the next value of the seed's ordering that isn't already present (at the end of an
 * untouched sequence, exactly what a longer sketch would have), sorted modes continue the run
 * outwards from the neighbouring value.
 */
export function extendValues(
	values: readonly string[],
	mode: FillMode,
	seed: number,
	count: number,
	{ atStart = false, range = 'medium' as FillRange } = {}
): string[] {
	const added = count - values.length
	if (added <= 0) return atStart ? values.slice(values.length - count) : values.slice(0, count)
	if (!atStart) {
		const out = [...values]
		for (let i = values.length; i < count; i++) out.push(nextValue(out, out[i - 1], mode, seed, i, 1, range))
		return out
	}
	// Build outwards from the old first value: front[0] is next to it.
	const front: string[] = []
	for (let j = 1; j <= added; j++) {
		const present = [...front, ...values]
		front.push(nextValue(present, front[j - 2] ?? values[0], mode, seed ^ 0x2545f491, j - 1, -1, range))
	}
	return [...front.reverse(), ...values]
}

/**
 * A value for an element inserted between `before` and `after` (either may be missing at an end).
 * Sorted modes pick a value strictly between the neighbours where there's room, so the run stays
 * sorted; distinct modes avoid the `existing` values. `salt` (e.g. the new element's id number)
 * makes it deterministic per insertion.
 */
export function insertValue(
	before: string | undefined,
	after: string | undefined,
	mode: FillMode,
	seed: number,
	salt: number,
	existing: readonly string[] = [],
	range: FillRange = 'medium'
): string {
	const saltedSeed = (seed ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0
	const rng = mulberry32(saltedSeed)
	const num = (v: string | undefined) =>
		v !== undefined && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined
	const [a, b] = [num(before), num(after)]
	switch (mode) {
		case 'empty':
			return ''
		case 'letters':
			return firstAbsent('letter', saltedSeed, new Set(existing))
		case 'random':
			return firstAbsent('number', saltedSeed, new Set(existing), range)
		case 'repeats':
			return String(randomInt(RANGE[range][0], RANGE[range][1], rng))
		case 'ascending':
		case 'descending':
		case 'nearly-sorted': {
			const up = mode === 'descending' ? -1 : 1
			if (a !== undefined && b !== undefined) {
				const [lo, hi] = [Math.min(a, b), Math.max(a, b)]
				return String(hi - lo >= 2 ? randomInt(lo + 1, hi - 1, rng) : randomInt(lo, hi, rng))
			}
			if (a !== undefined) return String(stepFrom(a, up, range, rng))
			if (b !== undefined) return String(stepFrom(b, -up, range, rng))
			return firstAbsent('number', saltedSeed, new Set(existing), range)
		}
	}
}

/**
 * The value at `index` of a stream, next to `neighbour`, given the values already `present`. `dir`
 * is +1 growing away from the start and -1 growing away from the end (so an ascending run keeps
 * ascending in index order).
 */
function nextValue(
	present: readonly string[],
	neighbour: string | undefined,
	mode: FillMode,
	seed: number,
	index: number,
	dir: 1 | -1,
	range: FillRange
): string {
	// One stream per index, so a value doesn't depend on how the shape grew to reach it.
	const rng = mulberry32((seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0)
	const n = Number(neighbour ?? 0)
	const base = Number.isFinite(n) ? n : 0
	switch (mode) {
		case 'empty':
			return ''
		case 'random':
			return firstAbsent('number', seed, new Set(present), range)
		case 'letters':
			return firstAbsent('letter', seed, new Set(present))
		case 'repeats':
			return draws('number', seed, index + 1, false, range)[index]
		case 'ascending':
		case 'nearly-sorted':
			return String(stepFrom(base, dir, range, rng))
		case 'descending':
			return String(stepFrom(base, -dir, range, rng))
	}
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
