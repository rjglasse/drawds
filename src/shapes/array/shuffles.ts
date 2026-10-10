import type { MarkColor } from '../../cells/marks'
import { randomInt, type Rng } from '../../data/random'
import { lit, ptr, recorder, span, type ArrayOperation, type ArrayState } from './operations'
import { swapCells } from './swap'

// Lecture 2's two shuffles, step by step, named as its slides name them (the random index is n,
// rand.nextInt's bound left out): the unfair one swaps each a[i] with any value (n from the whole
// array every time), Fisher-Yates swaps a[i] only with a value not yet placed (n from 0..i, a range
// that shrinks; the placed values green, as a sort's). On screen they look alike ("almost impossible to tell at
// first glance what has changed"): the last step says why only Fisher-Yates makes every order
// equally likely (len^len runs against len! orders).

const PICK: MarkColor = 'orange'
const PLACED: MarkColor = 'green'

/** n! (exactly as far as a double goes). */
const factorial = (n: number) => Array.from({ length: n }, (_, k) => k + 1).reduce((p, k) => p * k, 1)

/** A count as a sum would show it: whole up to a few million, else a power or factorial left as is. */
const big = (value: number, symbol: string) => (value <= 10_000_000 ? `${symbol} = ${value.toLocaleString('en')}` : symbol)

/**
 * The unfair shuffle: for each i, n is any index (0..len - 1) and a[i] swaps with a[n]. len picks
 * of len choices each make len^len equally likely runs, but there are len! orders, and from three
 * values on len^len isn't a multiple of len!: some orders come up more often than others.
 */
export function unfairShuffle(start: ArrayState, rng: Rng): ArrayOperation {
	const len = start.values.length
	const r = recorder(start, { 'random picks': 0, swaps: 0 })
	for (let i = 0; i < len; i++) {
		const k = randomInt(0, len - 1, rng)
		r.counts['random picks']++
		r.step(`i = ${i}: n = a random index from 0 to ${len - 1}: ${k}`, {
			pointers: [ptr('i', i), ptr('n', k)],
			lit: { [i]: PICK, [k]: PICK },
			ask: `i = ${i}: which indices can n be?`,
			askFocus: span(0, len - 1),
			line: 'pick',
		})
		swapStep(r, i, k)
	}
	const runs = len ** len
	const orders = factorial(len)
	r.step(
		runs % orders === 0
			? `Shuffled. ${big(runs, `${len}^${len}`)} runs of picks for ${big(orders, `${len}!`)} orders: fair for ${len} values, but not from 3 on`
			: `Shuffled. But ${big(runs, `${len}^${len}`)} equally likely runs of picks make only ${big(orders, `${len}!`)} orders, and ${len}^${len} isn't a multiple of ${len}!: some orders come up more often than others`,
		{ ask: false }
	)
	return { frames: r.frames, result: r.state, code: 'unfair-shuffle' }
}

/**
 * Fisher-Yates: i walks down from len - 1 to 1; n is an index not placed yet (0..i), and a[n] swaps
 * into a[i], its place for good (green). len · (len - 1) · ... · 2 = len! runs, one
 * per order: every order equally likely.
 */
export function fisherYates(start: ArrayState, rng: Rng): ArrayOperation {
	const len = start.values.length
	const r = recorder(start, { 'random picks': 0, swaps: 0 })
	for (let i = len - 1; i > 0; i--) {
		const k = randomInt(0, i, rng)
		r.counts['random picks']++
		r.step(`i = ${i}: n = a random index from 0 to ${i}, a value not placed yet: ${k}`, {
			pointers: [ptr('i', i), ptr('n', k)],
			lit: { ...lit(i + 1, len - 1, PLACED), [i]: PICK, [k]: PICK },
			ask: `i = ${i}: which indices can n be?`,
			askFocus: span(0, i),
			line: 'pick',
		})
		swapStep(r, i, k, lit(i, len - 1, PLACED))
	}
	const orders = factorial(len)
	r.step(
		len < 2
			? 'One value: nothing to shuffle'
			: `Shuffled: a[0] is what is left. ${len > 2 ? `${len} · ${len - 1} · … · 2` : '2'} = ${big(orders, `${len}!`)} runs of picks, one for each order: every order equally likely`,
		{ lit: lit(0, len - 1, PLACED), ask: false }
	)
	return { frames: r.frames, result: r.state, code: 'fisher-yates' }
}

/**
 * a[i] and a[k] swap (or, k = i, stay): the second half of each shuffle step (k is the code's n).
 * `placed`: the values in their place for good, a[i] now among them (Fisher-Yates).
 */
function swapStep(r: ReturnType<typeof recorder>, i: number, k: number, placed?: Record<string, MarkColor>) {
	if (k === i) {
		r.step(`n = i = ${i}: a[${i}] swaps with itself, so nothing moves${placed ? `; it is placed for good` : ''}`, {
			pointers: [ptr('i', i), ptr('n', k)],
			lit: placed,
			ask: false,
			line: 'swap',
		})
		return
	}
	r.set({ ...r.state, ...swapCells(r.state.values, r.state.marks, i, k) })
	r.counts.swaps++
	r.step(`swap(a[${i}], a[${k}])${placed ? `: a[${i}] = ${r.state.values[i]} is placed for good` : ''}`, {
		pointers: [ptr('i', i), ptr('n', k)],
		lit: { ...placed, [k]: PICK },
		swaps: [[i, k]],
		ask: false,
		line: 'swap',
	})
}

export type ShuffleKind = 'unfair' | 'fisher-yates'

/** The ranges a shuffle of `len` values picks from, in order: [0, top] for each pick. */
export const pickTops = (kind: ShuffleKind, len: number) =>
	kind === 'unfair' ? Array.from({ length: len }, () => len - 1) : Array.from({ length: Math.max(0, len - 1) }, (_, k) => len - 1 - k)

/**
 * Every run of a shuffle (each sequence of picks it could make, all equally likely) and the order it
 * leaves: len^len runs for the unfair one, len! for Fisher-Yates. For the outcome tree and the tally.
 */
export function everyRun(values: readonly string[], kind: ShuffleKind): { picks: number[]; result: string[] }[] {
	const tops = pickTops(kind, values.length)
	const runs: { picks: number[]; result: string[] }[] = []
	const go = (picks: number[]) => {
		if (picks.length === tops.length) {
			// A generator that gives exactly these picks.
			let at = 0
			const rng = () => (picks[at] + 0.5) / (tops[at++] + 1)
			const op = (kind === 'unfair' ? unfairShuffle : fisherYates)({ values: [...values], marks: {} }, rng)
			runs.push({ picks, result: op.result!.values })
			return
		}
		for (let k = 0; k <= tops[picks.length]; k++) go([...picks, k])
	}
	go([])
	return runs
}
