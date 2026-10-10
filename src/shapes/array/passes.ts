import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { Strip } from '../../nodelink/playback'
import { lit, ptr, recorder, type ArrayOperation, type ArrayState } from './operations'
import { swapCells } from './swap'

// Lectures 2 and 3 draw selection and insertion sort a pass at a time: each outer pass a row under
// the last, the array as the pass leaves it, what the pass cost beside it; then the costs summed as
// a series and its closed form. Each pass is one step here, its row added under the array (a strip,
// the sorted part green); the counts are the step-by-step sorts' (insertion sort's while tests too).

const DONE: MarkColor = 'green'
const MOVED: MarkColor = 'orange'

const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`
/** A series written out, "4 + 3 + 2 + 1", and its sum. */
const series = (terms: number[]) => `${terms.length ? terms.join(' + ') : '0'} = ${terms.reduce((a, b) => a + b, 0)}`

/** A pass's row: the array after it, the sorted part green and what moved orange. */
function row(title: string, values: string[], sorted: number, moved: number[]): Strip {
	return { title, items: [...values], marks: { ...Object.fromEntries(Array.from({ length: sorted }, (_, k) => [k, DONE])), ...Object.fromEntries(moved.map((k) => [k, MOVED])) } }
}

/**
 * Selection sort a pass at a time: pass i finds the smallest of a[i..n-1] (n - 1 - i comparisons,
 * whatever the order) and swaps it to a[i] (unless it is there). The comparisons add up to
 * (n - 1) + (n - 2) + ... + 1 = n(n - 1)/2 on any input; at most n - 1 swaps.
 */
export function selectionPasses(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, { comparisons: 0, swaps: 0 })
	const rows: Strip[] = []
	const compared: number[] = []
	for (let i = 0; i < n - 1; i++) {
		let min = i
		for (let j = i + 1; j < n; j++) if (compareKeys(r.state.values[j], r.state.values[min]) < 0) min = j
		const c = n - 1 - i
		const v = r.state.values[min]
		compared.push(c)
		r.counts.comparisons += c
		if (min !== i) {
			r.set({ ...r.state, ...swapCells(r.state.values, r.state.marks, i, min) })
			r.counts.swaps++
		}
		rows.push(row(`pass ${i + 1}: ${plural(c, 'comparison')}, ${min === i ? 'no swap' : '1 swap'}`, r.state.values, i + 1, min === i ? [] : [min]))
		r.step(
			`Pass ${i + 1}: the smallest of a[${i}..${n - 1}] is ${v}, found in ${plural(c, 'comparison')}; ${min === i ? `it is in a[${i}] already` : `swap it with a[${i}]`}`,
			{
				lit: lit(0, i, DONE),
				pointers: [ptr('i', i), ptr('min', i)],
				swaps: min === i ? undefined : [[i, min]],
				strips: [...rows],
				ask: `Pass ${i + 1}: how many comparisons, and which value goes to a[${i}]?`,
			}
		)
	}
	const { swaps } = r.counts
	r.step(
		`Comparisons ${series(compared)} = n(n − 1)/2 for n = ${n}, the same for any input; ${plural(swaps, 'swap')}, at most n − 1 = ${n - 1}`,
		{ lit: lit(0, n - 1, DONE), strips: [...rows], ask: false }
	)
	return { frames: r.frames, result: r.state }
}

/**
 * Insertion sort a pass at a time (the swapping version, as the step-by-step one): pass i moves
 * a[i] left past every larger value. Its while test runs once per comparison, and once more when j
 * reaches 0; at worst (reversed input) pass i compares i times and the tests add up to
 * 2 + 3 + ... + n = n(n + 1)/2 - 1, the swaps to 1 + 2 + ... + (n - 1) = n(n - 1)/2. Sorted input:
 * one comparison a pass, n - 1 in all, no swaps.
 */
export function insertionPasses(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, { comparisons: 0, swaps: 0, 'while tests': 0 })
	const rows: Strip[] = []
	const [tests, compares, swapped]: number[][] = [[], [], []]
	for (let i = 1; i < n; i++) {
		const key = r.state.values[i]
		let [t, c, s] = [0, 0, 0]
		let j = i
		while (j > 0) {
			t++
			c++
			if (compareKeys(r.state.values[j - 1], r.state.values[j]) <= 0) break
			r.set({ ...r.state, ...swapCells(r.state.values, r.state.marks, j - 1, j) })
			s++
			j--
			// j > 0 fails at the front: one more test, comparing nothing.
			if (j === 0) t++
		}
		tests.push(t)
		compares.push(c)
		swapped.push(s)
		r.counts.comparisons += c
		r.counts.swaps += s
		r.counts['while tests'] += t
		rows.push(row(`pass ${i}: ${plural(c, 'comparison')}, ${plural(s, 'swap')} (${plural(t, 'while test')})`, r.state.values, i + 1, s ? [j] : []))
		r.step(
			s
				? `Pass ${i}: ${key} moves left past ${plural(s, 'larger value')} to a[${j}]: ${plural(c, 'comparison')}, ${plural(s, 'swap')}`
				: `Pass ${i}: ${key} is not smaller than a[${i - 1}], so it stays: 1 comparison, no swap`,
			{
				lit: { ...lit(0, i, DONE), ...(s ? { [j]: MOVED } : {}) },
				pointers: [ptr('i', i), ptr('j', j)],
				strips: [...rows],
				ask: `Pass ${i}: where does ${key} end up, and how many swaps does it take?`,
			}
		)
	}
	const worst = n > 1 ? ` At worst (reversed): tests 2 + 3 + … + ${n} = n(n + 1)/2 − 1 = ${(n * (n + 1)) / 2 - 1}, swaps n(n − 1)/2 = ${(n * (n - 1)) / 2}.` : ''
	// Lecture 3 counts the while tests as comparisons: the extra test is j > 0 at the front.
	const extra = r.counts['while tests'] > r.counts.comparisons ? ' A test more than the comparisons is j > 0 failing at the front, comparing no values.' : ''
	r.step(`While tests ${series(tests)}; comparisons ${series(compares)}; swaps ${series(swapped)}.${extra}${worst} Sorted input: n − 1 = ${n - 1} comparisons, no swaps`, {
		lit: lit(0, n - 1, DONE),
		strips: [...rows],
		ask: false,
	})
	return { frames: r.frames, result: r.state }
}
