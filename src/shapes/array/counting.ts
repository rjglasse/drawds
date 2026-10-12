import type { MarkColor, Marks } from '../../cells/marks'
import type { Strip } from '../../nodelink/playback'
import { ptr, recorder, type ArrayOperation, type ArrayState } from './operations'

// Counting sort, step by step (CLRS's, stable): count each value 0..k in count[], a strip under the
// array; prefix sums make count[v] the number of values ≤ v; then, from the right, each value goes
// to out[--count[v]], a second row, so equal values keep their order; a = out. No value is compared
// with another: about n + k steps. Only for small whole numbers (a count per value 0..k is drawn).

const LOOK: MarkColor = 'orange'
const PEEK: MarkColor = 'blue'
const DONE: MarkColor = 'green'

/** The largest value counting sort draws a count for (count[] has k + 1 cells). */
export const COUNT_MAX = 15

export function countingSort(start: ArrayState): ArrayOperation {
	const { values } = start
	const n = values.length
	const r = recorder(start, { comparisons: 0 })
	const odd = values.find((v) => !/^\d+$/.test(v))
	const k = odd === undefined ? Math.max(...values.map(Number)) : -1
	if (odd !== undefined || k > COUNT_MAX) {
		r.step(
			odd !== undefined
				? `Counting sort counts whole numbers 0..k, a count each: ${odd} isn't one. Fill 0-9, or type small values`
				: `Counting sort keeps a count for each value 0..k: these go up to ${k}, ${k + 1} counts, more than drawds draws (${COUNT_MAX + 1}). Fill 0-9, or type small values`,
			{ ask: false }
		)
		return { frames: r.frames }
	}
	const code = 'counting-sort'
	const count: number[] = Array(k + 1).fill(0)
	const labels = count.map((_, v) => String(v))
	const strips = (marks: Record<number, MarkColor> = {}): Strip[] => [{ title: 'count[]', items: count.map(String), labels, marks }]
	r.let('k', k)
	r.step(`Counting sort compares no values. They run 0..k, k = ${k}: count = a new array of k + 1 = ${k + 1} zeros, a count per value`, {
		strips: strips(),
		line: 'alloc',
		ask: false,
	})

	// One pass: count each value.
	for (let i = 0; i < n; i++) {
		const v = Number(values[i])
		count[v]++
		r.step(`a[${i}] = ${v}: count[${v}]++ → ${count[v]}`, {
			lit: { [i]: LOOK },
			pointers: [ptr('i', i)],
			strips: strips({ [v]: LOOK }),
			line: 'count',
			ask: `a[${i}] = ${v}: which count goes up?`,
		})
	}

	// Prefix sums: count[v] becomes how many values are ≤ v, so the last v goes just before it.
	for (let v = 1; v <= k; v++) {
		const was = count[v]
		count[v] += count[v - 1]
		r.let('v', v)
		r.step(`count[${v}] += count[${v - 1}]: ${was} + ${count[v - 1]} = ${count[v]} values are ≤ ${v}`, {
			strips: strips({ [v]: LOOK, [v - 1]: PEEK }),
			line: 'prefix',
			ask: `count[${v}] + count[${v - 1}]: how many values are ≤ ${v}?`,
		})
	}
	r.let('v', undefined)

	// From the right, each value to out[--count[v]]: equal values keep their order (stable).
	const out: string[] = Array(n).fill('')
	const placed: Record<number, MarkColor> = {}
	const marks: Marks = {}
	r.set({ ...r.state, aux: { title: 'out', values: [...out] } })
	r.step(`out = a new array of n = ${n}. From the right: count[v] values are ≤ v, so the last v goes to out[count[v] - 1]`, {
		strips: strips(),
		line: 'out',
		ask: false,
	})
	for (let i = n - 1; i >= 0; i--) {
		const v = Number(values[i])
		count[v]--
		const to = count[v]
		out[to] = values[i]
		placed[to] = DONE
		if (start.marks[String(i)]) marks[String(to)] = start.marks[String(i)]
		r.set({ ...r.state, aux: { title: 'out', values: [...out], marks: { ...placed } } })
		r.step(`a[${i}] = ${v}: count[${v}]-- → ${to}; out[${to}] = ${v}`, {
			lit: { [i]: LOOK },
			pointers: [ptr('i', i)],
			moves: [[i, `aux:${to}`]],
			strips: strips({ [v]: LOOK }),
			line: 'place',
			ask: `a[${i}] = ${v}: where in out does it go?`,
		})
	}

	// a = out.
	r.set({ values: [...out], marks, ...(start.used === undefined ? {} : { used: start.used }) })
	const all = Object.fromEntries(out.map((_, j) => [String(j), DONE]))
	r.step(
		`a = out: sorted, equal values in the order they came. ${n} values and ${k + 1} counts, about n + k steps, and not one comparison: for small k, faster than any sort that compares`,
		{ lit: all, moves: out.map((_, j): [string, number] => [`aux:${j}`, j]), strips: strips(), line: 'copy', ask: false }
	)
	return { frames: r.frames, result: r.state, finalFlash: all, code }
}
