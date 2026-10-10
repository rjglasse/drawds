import type { MarkColor, Marks } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import { randomInt, type Rng } from '../../data/random'
import type { CallEvent } from '../../nodelink/playback'
import {
	NEXT_CALL,
	callEvents,
	lit,
	partition,
	ptr,
	recorder,
	sortCounts,
	span,
	type Around,
	type ArrayOperation,
	type ArrayState,
	type Recorder,
} from './operations'
import { countSort, medianOf3, ranks } from './sort-counts'
import { swapCells } from './swap'

// Quicksort, step by step (Lomuto's partition, in operations.ts), and lecture 10's improvements on
// it, one at a time: a random pivot, the median of three (the middle value of a[lo], a[mid], a[hi]:
// a value of the array, not their average), a three-way partition (Dijkstra's Dutch national flag:
// equal values are placed at once, the fix for many equal values, which neither a random pivot nor
// the median of three helps with) and a cut-off to insertion sort for short sub-arrays. Each counts
// its calls and how deep they go, and ends by comparing itself with plain quicksort on the same input.

const LOOK: MarkColor = 'orange'
const DONE: MarkColor = 'green'
const PIVOT: MarkColor = 'red'
const SMALL: MarkColor = 'blue'

export const QUICKSORT_VARIANTS = ['quicksort', 'quicksort-random', 'quicksort-median', 'quicksort-3way', 'quicksort-cutoff'] as const
export type QuicksortVariant = (typeof QUICKSORT_VARIANTS)[number]

export interface QuicksortOptions {
	/** A random pivot's picks. */
	rng?: Rng
	/** Sub-arrays of this many values or fewer are insertion sorted (quicksort-cutoff). */
	cutoff?: number
}

/** The cut-off a teacher typed, or 3. */
export const parseCutoff = (typed: string | undefined) => {
	const k = Math.floor(Number(typed))
	return Number.isFinite(k) && k >= 1 ? k : 3
}

const swapped = (state: ArrayState, a: number, b: number): ArrayState => ({ ...state, ...swapCells(state.values, state.marks, a, b) })

/**
 * Quicksort: partition, then sort each side the same way. The range being worked on is the one not
 * faded; the calls still open are a stack under the array (the innermost on the right). `variant`
 * picks one of lecture 10's improvements.
 */
export function quicksort(start: ArrayState, variant: QuicksortVariant = 'quicksort', { rng, cutoff = 3 }: QuicksortOptions = {}): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, { ...sortCounts(), calls: 0, 'max depth': 0 })
	const settled: Marks = {}
	const stack: string[] = []
	const outside = (lo: number, hi: number) => span(0, n - 1).filter((k) => Number(k) < lo || Number(k) > hi)
	const less = (i: number, j: number) => compareKeys(r.state.values[i], r.state.values[j]) < 0
	if (variant === 'quicksort-cutoff') r.let('CUTOFF', cutoff)
	// For the recursion tree: a call returns after its inner calls, with no step of its own, so its
	// return goes with the next step.
	const tree = callEvents(r)
	const sort = (lo: number, hi: number) => {
		stack.push(`${lo}..${hi}`)
		r.counts.calls++
		r.counts['max depth'] = Math.max(r.counts['max depth'], stack.length)
		r.let('lo', lo)
		r.let('hi', hi)
		r.let('pivot', undefined)
		r.let('k', undefined)
		r.let('m', undefined)
		const around: Around = { dim: outside(lo, hi), strips: [{ title: 'call stack', items: [...stack] }] }
		const call = tree.call(lo, hi)
		const name = `quicksort(${lo}, ${hi})`
		const size = Math.max(0, hi - lo + 1)
		const first = { ...around, lit: { ...settled }, ask: NEXT_CALL }
		if (variant === 'quicksort-cutoff' && size <= cutoff) {
			if (size === 1) settled[String(lo)] = DONE
			if (size < 2) {
				r.step(`${name}: ${size ? `one value, a[${lo}]` : 'no values'}, at most the cut-off ${cutoff}: insertion sort has nothing to do`, {
					...first,
					lit: { ...settled },
					line: 'small',
					calls: tree.events(call, tree.returns(lo, hi)),
				})
			} else {
				r.step(`${name}: ${size} values, at most the cut-off ${cutoff}: insertion sort finishes them, with no more calls`, {
					...first,
					line: 'small',
					calls: tree.events(call),
				})
				insertionSteps(r, lo, hi, settled, around)
				tree.later(tree.returns(lo, hi))
			}
		} else if (lo >= hi) {
			if (lo === hi) settled[String(lo)] = DONE
			r.step(`${name}: ${lo === hi ? `one value, a[${lo}], is sorted` : 'no values: nothing to do'}`, {
				...first,
				lit: { ...settled },
				line: 'base',
				calls: tree.events(call, tree.returns(lo, hi)),
			})
		} else if (variant === 'quicksort-3way') {
			const [lt, gt] = partition3(r, lo, hi, settled, around, { name, calls: tree.events(call) })
			sort(lo, lt - 1)
			sort(gt + 1, hi)
			tree.later(tree.returns(lo, hi))
		} else {
			if (variant === 'quicksort-random') {
				const k = randomInt(lo, hi, rng!)
				const v = r.state.values[k]
				r.let('k', k)
				r.step(`${name}: a random index from ${lo} to ${hi}: k = ${k}, so the pivot is ${v}${k === hi ? ', at the end already' : ''}`, {
					...first,
					lit: { ...settled, [k]: PIVOT },
					pointers: [ptr('k', k)],
					line: 'pick',
					calls: tree.events(call),
				})
				if (k !== hi) {
					r.set(swapped(r.state, k, hi))
					r.counts.swaps++
					r.step(`swap(a[${k}], a[${hi}]): the pivot ${v} goes to the end, where the partition takes its pivot`, {
						...around,
						lit: { ...settled, [hi]: PIVOT },
						pointers: [ptr('k', k)],
						swaps: [[k, hi]],
						ask: false,
						line: 'toend',
					})
				}
			} else if (variant === 'quicksort-median' && size >= 3) {
				const mid = Math.floor((lo + hi) / 2)
				const { at, comparisons } = medianOf3(less, lo, mid, hi)
				const [x, y, z, m] = [lo, mid, hi, at].map((i) => r.state.values[i])
				r.counts.comparisons += comparisons
				r.let('m', at)
				const three = [lo, mid, hi]
				r.step(`${name}: of a[${lo}] = ${x}, a[${mid}] = ${y} and a[${hi}] = ${z}, the median (the middle one) is ${m}${at === hi ? ', at the end already' : ''}`, {
					...first,
					lit: { ...settled, [lo]: LOOK, [mid]: LOOK, [hi]: LOOK, [at]: PIVOT },
					pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)],
					ask: `${name}: of a[${lo}], a[${mid}] and a[${hi}], which is the median?`,
					askFocus: three,
					line: 'median',
					calls: tree.events(call),
				})
				if (at !== hi) {
					r.set(swapped(r.state, at, hi))
					r.counts.swaps++
					r.step(`swap(a[${at}], a[${hi}]): the median ${m} goes to the end, as the pivot`, {
						...around,
						lit: { ...settled, [hi]: PIVOT },
						swaps: [[at, hi]],
						ask: false,
						line: 'tohi',
					})
				}
			} else {
				const why = variant === 'quicksort-median' ? ': two values, too few for three samples' : ''
				r.step(`${name}: partition a[${lo}..${hi}]${why}`, { ...first, line: 'partition', calls: tree.events(call) })
			}
			const p = partition(r, lo, hi, settled, around)
			sort(lo, p - 1)
			sort(p + 1, hi)
			tree.later(tree.returns(lo, hi))
		}
		stack.pop()
	}
	sort(0, n - 1)
	r.let('lo', undefined)
	r.let('hi', undefined)
	r.let('pivot', undefined)
	const { comparisons, swaps, calls } = r.counts
	r.step(`Every call has returned: sorted, with ${comparisons} comparisons, ${swaps} swaps and ${calls} calls. ${tree.summary(n)}. ${afterword(start, variant)}`.trim(), {
		lit: lit(0, n - 1, DONE),
		strips: [{ title: 'call stack', items: [] }],
		ask: false,
		calls: tree.events(),
	})
	return { frames: r.frames, result: r.state, code: variant }
}

/**
 * What the end of a run adds: a variant how plain quicksort does on the same input; with many equal
 * values, what helps with them.
 */
function afterword(start: ArrayState, variant: QuicksortVariant): string {
	const n = start.values.length
	const repeats = n >= 4 && new Set(start.values).size * 2 <= n
	const equal =
		repeats && variant !== 'quicksort-3way'
			? 'Many equal values: no choice of pivot splits them, but a three-way partition places them all at once.'
			: ''
	if (variant === 'quicksort') return equal
	const plain = countSort('quicksort', ranks(start.values))
	return `Plain quicksort (the last value as pivot) on the same input: ${plain.comparisons} comparisons, ${plain.calls} calls, ${plain['max depth']} levels. ${equal}`
}

/**
 * Dijkstra's three-way partition of a[lo..hi] around the value v = a[hi]: i walks along; a smaller
 * value swaps to lt (lt and i move on), a larger one swaps with a[gt] (gt moves back, i stays to look
 * at what came), an equal one stays (i moves on). Then a[lo..lt-1] < v, a[lt..gt] = v, in their final
 * places, and a[gt+1..hi] > v. Returns lt and gt.
 */
function partition3(
	r: Recorder,
	lo: number,
	hi: number,
	settled: Marks,
	around: Around,
	{ name, calls }: { name?: string; calls?: CallEvent[] } = {}
): [number, number] {
	const v = r.state.values[hi]
	let [lt, i, gt] = [lo, lo, hi]
	r.let('pivot', v)
	const shown = (extra: Marks = {}): Marks => ({ ...settled, ...lit(lo, lt - 1, SMALL), ...lit(lt, i - 1, PIVOT), ...extra })
	const at = () => [ptr('lt', lt), ptr('i', i), ptr('gt', gt)]
	r.step(
		`${name ? `${name}: ` : ''}pivot = a[${hi}] = ${v}. lt = i = ${lo}, gt = ${hi}: smaller values will gather left of lt, equal ones from lt up to i, larger ones right of gt`,
		{
			...around,
			lit: { ...settled, [hi]: PIVOT },
			pointers: at(),
			ask: name ? NEXT_CALL : `Three-way partition of a[${lo}..${hi}]: which value is the pivot?`,
			line: 'pivot',
			...(calls ? { calls } : {}),
		}
	)
	while (i <= gt) {
		const x = r.state.values[i]
		const which = { ask: `a[${i}] = ${x} vs the pivot ${v}: smaller, equal or larger?`, askFocus: [i] }
		const c = compareKeys(x, v)
		r.counts.comparisons++
		if (c < 0) {
			r.step(`a[${i}] = ${x} < ${v}: smaller`, { ...around, lit: shown({ [i]: LOOK }), pointers: at(), ...which, line: 'less' })
			const move = lt !== i
			if (move) {
				r.set(swapped(r.state, lt, i))
				r.counts.swaps++
			}
			const [from, to] = [i, lt]
			lt++
			i++
			r.step(
				move
					? `swap(a[${to}], a[${from}]): ${x} joins the smaller values, an equal one moves up; lt = ${lt}, i = ${i}`
					: `lt = i, so ${x} is where the smaller values end already; lt = ${lt}, i = ${i}`,
				{
					...around,
					lit: shown(),
					pointers: at(),
					...(move ? { swaps: [[to, from]] as [number, number][] } : {}),
					ask: `${x} is smaller: where does it go, and which pointers move?`,
					askFocus: [from],
					line: 'less-swap',
				}
			)
			continue
		}
		// Not smaller: the second test.
		r.counts.comparisons++
		if (c > 0) {
			r.step(`a[${i}] = ${x} > ${v}: larger`, { ...around, lit: shown({ [i]: LOOK }), pointers: at(), ...which, line: 'more' })
			const move = i !== gt
			if (move) {
				r.set(swapped(r.state, i, gt))
				r.counts.swaps++
			}
			const to = gt
			gt--
			r.step(
				move
					? `swap(a[${i}], a[${to}]): ${x} goes right with the larger values; gt = ${gt}. i stays: ${r.state.values[i]} has come to i, unseen yet`
					: `i = gt, so ${x} is where the larger values start already; gt = ${gt}`,
				{
					...around,
					lit: shown(),
					pointers: at(),
					...(move ? { swaps: [[i, to]] as [number, number][] } : {}),
					ask: `${x} is larger: where does it go, and which pointers move?`,
					askFocus: [i],
					line: 'more-swap',
				}
			)
			continue
		}
		r.step(`a[${i}] = ${x} = ${v}: equal, so it stays, with the equal ones; i = ${i + 1}`, {
			...around,
			lit: shown({ [i]: PIVOT }),
			pointers: at(),
			...which,
			line: 'equal',
		})
		i++
	}
	for (const k of span(lt, gt)) settled[k] = DONE
	r.step(
		`i > gt: partitioned. a[${lo}..${lt - 1}] < ${v}; a[${lt}..${gt}] = ${v}, ${gt > lt ? 'all in their final places, never to be sorted again' : 'in its final place'}; a[${gt + 1}..${hi}] > ${v}`,
		{
			...around,
			lit: { ...settled, ...lit(lo, lt - 1, SMALL) },
			pointers: at(),
			ask: 'i has passed gt: what do we know now?',
			line: 'split',
		}
	)
	return [lt, gt]
}

/** One three-way partition of the whole array around its last value. */
export function partition3Array(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, sortCounts())
	const settled: Marks = {}
	const [lt, gt] = partition3(r, 0, n - 1, settled, {})
	return { frames: r.frames, result: r.state, finalFlash: lit(lt, gt, DONE), code: 'partition-3way' }
}

/** Insertion sort of a[lo..hi] (j stops at lo), as quicksort with a cut-off finishes a short range. */
function insertionSteps(r: Recorder, lo: number, hi: number, settled: Marks, around: Around) {
	for (let i = lo + 1; i <= hi; i++) {
		r.let('i', i)
		for (let j = i; j > lo; j--) {
			r.let('j', j)
			const [x, y] = [r.state.values[j - 1], r.state.values[j]]
			const pointers = [ptr('i', i), ptr('j', j)]
			const sorted = { ...settled, ...lit(lo, i - 1, DONE) }
			r.counts.comparisons++
			const ask = { ask: `a[${j - 1}] = ${x} vs a[${j}] = ${y}: swap them or not?`, askFocus: [j - 1, j], line: 'is-compare' }
			if (compareKeys(x, y) <= 0) {
				r.step(`insertion sort: a[${j - 1}] = ${x} ≤ a[${j}] = ${y}: ${y} is in place`, { ...around, lit: { ...sorted, [j]: LOOK }, pointers, ...ask })
				break
			}
			r.step(`insertion sort: a[${j - 1}] = ${x} > a[${j}] = ${y}: swap them`, { ...around, lit: { ...sorted, [j - 1]: LOOK, [j]: LOOK }, pointers, ...ask })
			r.set(swapped(r.state, j - 1, j))
			r.counts.swaps++
			r.step(`swap(a[${j - 1}], a[${j}])`, {
				...around,
				lit: { ...sorted, [j - 1]: LOOK },
				pointers: [ptr('i', i), ptr('j', j - 1)],
				swaps: [[j - 1, j]],
				ask: false,
				line: 'is-swap',
			})
		}
	}
	r.let('i', undefined)
	r.let('j', undefined)
	for (const k of span(lo, hi)) settled[k] = DONE
}
