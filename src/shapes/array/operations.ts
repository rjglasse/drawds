import type { MarkColor, Marks } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { Frame, Strip } from '../../nodelink/playback'
import type { Pointer } from '../../pointers/pointers'
import { swapCells } from './swap'

// Array algorithms, step by step. Each step is a line of the code a teacher writes on the board
// (mid = (lo + hi) / 2, swap(a[j], a[j + 1]), a[i] = a[i + 1]...), drawn as it happens: pointers
// slide along the array, the cells being compared light orange, values swap or shift in arcs,
// cells in their final place turn green and cells out of play fade. Marks travel with values.

const LOOK: MarkColor = 'orange'
const DONE: MarkColor = 'green'
const GONE: MarkColor = 'red'
const PIVOT: MarkColor = 'red'
const SMALL: MarkColor = 'blue'

/** A second row of cells drawn under the array during a step: a new array being filled. */
export interface AuxRow {
	title: string
	values: string[]
}

/**
 * The array an operation works on: values and the marks travelling with them; for a fixed
 * capacity, how many are in use (the rest are blank). During a step, maybe a second row.
 */
export interface ArrayState {
	values: string[]
	marks: Marks
	used?: number
	aux?: AuxRow
}

export interface ArrayOperation {
	frames: Frame[]
	/** The array afterwards, if the operation changes it. */
	result?: ArrayState
	/** Highlights on the result. */
	finalFlash?: Marks
}

const ptr = (name: string, at: number): Pointer => ({ id: `#${name}`, name, at: String(at) })

/** Cell keys from..to (inclusive). */
const span = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => String(from + k))

/** The same colour on cells from..to. */
const lit = (from: number, to: number, color: MarkColor): Marks => Object.fromEntries(span(from, to).map((k) => [k, color]))

export const isSorted = (values: readonly string[]) => values.every((v, i) => i === 0 || compareKeys(values[i - 1], v) <= 0)

interface Step {
	/** Highlights shown at this step (the recorder works out what changed). */
	lit?: Marks
	pointers?: Pointer[]
	dim?: string[]
	swaps?: [number, number][]
	/** Copies, `[from, to]`: cell indices, or `aux:<i>` for the second row's cells. */
	moves?: [number | string, number | string][]
	strips?: Strip[]
}

/**
 * Records frames from what each step shows: its highlights (turned into the changes a frame
 * holds), pointers, faded cells, and the array as it is then, with the counts so far.
 */
function recorder(start: ArrayState, counts: Record<string, number>) {
	const frames: Frame[] = []
	let shown: Marks = {}
	let state: ArrayState = { ...start, values: [...start.values], marks: { ...start.marks } }
	return {
		frames,
		counts,
		get state() {
			return state
		},
		/** The array changes (a swap, a copy): later steps show it. */
		set(next: ArrayState) {
			state = next
		},
		step(caption: string, { lit: next = {}, pointers = [], dim = [], swaps, moves, strips }: Step = {}) {
			const flash: Record<string, MarkColor | null> = {}
			for (const key of Object.keys(shown)) if (!next[key]) flash[key] = null
			for (const [key, color] of Object.entries(next)) if (shown[key] !== color) flash[key] = color
			shown = { ...next }
			const keys = (pairs?: [number | string, number | string][]) => pairs?.map(([a, b]): [string, string] => [String(a), String(b)])
			const { values, marks, used, aux } = state
			frames.push({
				caption,
				props: { values, marks, ...(used === undefined ? {} : { used }), ...(aux ? { aux } : {}) },
				flash,
				pointers,
				dim,
				swaps: keys(swaps),
				moves: keys(moves),
				strips,
				counts: { ...counts },
			})
		},
	}
}

const swapped = (state: ArrayState, a: number, b: number): ArrayState => ({ ...state, ...swapCells(state.values, state.marks, a, b) })

/** a[to] = a[from]: the value (and its mark) copied, the old one at `to` overwritten. */
function copied(state: ArrayState, from: number, to: number): ArrayState {
	const values = [...state.values]
	values[to] = values[from]
	const marks = { ...state.marks }
	if (marks[String(from)]) marks[String(to)] = marks[String(from)]
	else delete marks[String(to)]
	return { ...state, values, marks }
}

// Searching.

/**
 * Binary search for `target`: lo and hi close in on it, each step comparing with the middle value
 * and discarding (fading) the half it can't be in, until it is found or the pointers cross. On an
 * unsorted array it runs anyway, after a warning: watching it miss is the lesson.
 */
export function binarySearch(start: ArrayState, target: string): ArrayOperation {
	const { values } = start
	const n = values.length
	const r = recorder(start, { comparisons: 0 })
	const outside = (lo: number, hi: number) => span(0, n - 1).filter((k) => Number(k) < lo || Number(k) > hi)
	let lo = 0
	let hi = n - 1
	const unsorted = values.findIndex((v, i) => i > 0 && compareKeys(values[i - 1], v) > 0)
	if (unsorted > 0) {
		const [a, b] = [unsorted - 1, unsorted]
		r.step(`Careful: a[${a}] = ${values[a]} > a[${b}] = ${values[b]}, so the array isn't sorted and binary search can miss ${target}`, {
			lit: { [a]: GONE, [b]: GONE },
		})
	}
	r.step(`lo = 0, hi = ${hi}: ${target} could be anywhere in a[0..${hi}]`, { pointers: [ptr('lo', lo), ptr('hi', hi)] })
	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2)
		const v = values[mid]
		const at = { pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)], dim: outside(lo, hi) }
		r.counts.comparisons++
		r.step(`mid = (${lo} + ${hi}) / 2 = ${mid}. Is a[${mid}] = ${v} equal to ${target}?`, { ...at, lit: { [mid]: LOOK } })
		const c = compareKeys(v, target)
		if (c === 0) {
			r.step(`Yes: found ${target} at index ${mid}, after ${r.counts.comparisons} comparison${r.counts.comparisons === 1 ? '' : 's'}`, {
				...at,
				lit: { [mid]: DONE },
			})
			return { frames: r.frames, finalFlash: { [mid]: DONE } }
		}
		if (c < 0) {
			lo = mid + 1
			r.step(`${v} < ${target}, so ${target} can only be right of mid: lo = mid + 1 = ${lo}`, {
				pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)],
				dim: outside(lo, hi),
			})
		} else {
			hi = mid - 1
			r.step(`${v} > ${target}, so ${target} can only be left of mid: hi = mid - 1 = ${hi}`, {
				pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)],
				dim: outside(lo, hi),
			})
		}
	}
	r.step(`lo = ${lo} > hi = ${hi}: the pointers have crossed, so ${target} is not in the array`, {
		pointers: [ptr('lo', lo), ptr('hi', hi)],
		dim: span(0, n - 1),
	})
	return { frames: r.frames }
}

/** Linear search for `target`: i walks from the start, comparing each value, fading the ones it passed. */
export function linearSearch(start: ArrayState, target: string): ArrayOperation {
	const { values } = start
	const n = values.length
	const r = recorder(start, { comparisons: 0 })
	for (let i = 0; i < n; i++) {
		r.counts.comparisons++
		const step = { pointers: [ptr('i', i)], dim: span(0, i - 1) }
		if (compareKeys(values[i], target) === 0) {
			r.step(`i = ${i}: a[${i}] = ${values[i]}. Found ${target} at index ${i}`, { ...step, lit: { [i]: DONE } })
			return { frames: r.frames, finalFlash: { [i]: DONE } }
		}
		r.step(`i = ${i}: a[${i}] = ${values[i]} ≠ ${target}, so on to the next`, { ...step, lit: { [i]: LOOK } })
	}
	r.step(`i = ${n}: past the end, so ${target} is not in the array`, { pointers: [ptr('i', n)], dim: span(0, n - 1) })
	return { frames: r.frames }
}

// Sorting. Counts of comparisons and swaps run in the play bar, so a class can compare algorithms.

function sortCounts() {
	return { comparisons: 0, swaps: 0 }
}

function sorted(r: ReturnType<typeof recorder>, n: number): ArrayOperation {
	const { comparisons, swaps } = r.counts
	r.step(`Sorted: ${comparisons} comparisons, ${swaps} swaps`, { lit: lit(0, n - 1, DONE) })
	return { frames: r.frames, result: r.state }
}

/**
 * Insertion sort (by swapping): each new value a[i] moves left, swapping with its neighbour while
 * that is larger, into the sorted part a[0..i] (green).
 */
export function insertionSort(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, sortCounts())
	r.step('a[0] on its own is sorted', { lit: lit(0, 0, DONE) })
	for (let i = 1; i < n; i++) {
		r.step(`i = ${i}: insert a[${i}] = ${r.state.values[i]} into the sorted part a[0..${i - 1}]`, {
			lit: { ...lit(0, i - 1, DONE), [i]: LOOK },
			pointers: [ptr('i', i), ptr('j', i)],
		})
		let j = i
		while (j > 0) {
			const [x, y] = [r.state.values[j - 1], r.state.values[j]]
			// The sorted part, the value moving through it, and the neighbour it is compared with.
			const around = (at: number, also?: number) => ({
				...lit(0, i, DONE),
				[at]: LOOK,
				...(also === undefined ? {} : { [also]: LOOK }),
			})
			const pointers = [ptr('i', i), ptr('j', j)]
			r.counts.comparisons++
			if (compareKeys(x, y) <= 0) {
				r.step(`a[${j - 1}] = ${x} ≤ a[${j}] = ${y}: ${y} is in place`, { lit: lit(0, i, DONE), pointers })
				break
			}
			r.step(`a[${j - 1}] = ${x} > a[${j}] = ${y}: swap them`, { lit: around(j, j - 1), pointers })
			r.set(swapped(r.state, j - 1, j))
			r.counts.swaps++
			r.step(`swap(a[${j - 1}], a[${j}]); j = ${j - 1}`, {
				lit: around(j - 1),
				pointers: [ptr('i', i), ptr('j', j - 1)],
				swaps: [[j - 1, j]],
			})
			j--
			if (j === 0) r.step(`j = 0: ${y} is the smallest so far, at the front`, { lit: lit(0, i, DONE), pointers: [ptr('i', i), ptr('j', 0)] })
		}
	}
	return sorted(r, n)
}

/**
 * Selection sort: for each i, j scans the rest for the smallest value (min), which then swaps into
 * a[i], its final place (green).
 */
export function selectionSort(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, sortCounts())
	for (let i = 0; i < n - 1; i++) {
		let min = i
		r.step(`i = ${i}: find the smallest of a[${i}..${n - 1}]. min = ${i} (${r.state.values[i]}) so far`, {
			lit: { ...lit(0, i - 1, DONE), [i]: LOOK },
			pointers: [ptr('i', i), ptr('min', min)],
		})
		for (let j = i + 1; j < n; j++) {
			const [x, m] = [r.state.values[j], r.state.values[min]]
			r.counts.comparisons++
			if (compareKeys(x, m) < 0) {
				r.step(`a[${j}] = ${x} < a[min] = ${m}: min = ${j}`, {
					lit: { ...lit(0, i - 1, DONE), [j]: LOOK },
					pointers: [ptr('i', i), ptr('j', j), ptr('min', j)],
				})
				min = j
			} else {
				r.step(`a[${j}] = ${x} ≥ a[min] = ${m}: min stays ${min}`, {
					lit: { ...lit(0, i - 1, DONE), [j]: LOOK, [min]: LOOK },
					pointers: [ptr('i', i), ptr('j', j), ptr('min', min)],
				})
			}
		}
		if (min === i) {
			r.step(`a[${i}] = ${r.state.values[i]} is already the smallest: no swap`, { lit: lit(0, i, DONE), pointers: [ptr('i', i), ptr('min', min)] })
			continue
		}
		const v = r.state.values[min]
		r.set(swapped(r.state, i, min))
		r.counts.swaps++
		r.step(`swap(a[${i}], a[min]): ${v} goes to index ${i}, its place`, {
			lit: lit(0, i, DONE),
			pointers: [ptr('i', i), ptr('min', min)],
			swaps: [[i, min]],
		})
	}
	return sorted(r, n)
}

/**
 * Bubble sort: j walks along, swapping neighbours that are out of order, so the largest value of
 * the pass bubbles up to the end (green). A pass without swaps means the array is sorted.
 */
export function bubbleSort(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, sortCounts())
	for (let pass = 1; pass < n; pass++) {
		const end = n - pass
		let swaps = 0
		const settled = lit(end + 1, n - 1, DONE)
		for (let j = 0; j < end; j++) {
			const [x, y] = [r.state.values[j], r.state.values[j + 1]]
			const step = { lit: { ...settled, [j]: LOOK, [j + 1]: LOOK }, pointers: [ptr('j', j)] }
			r.counts.comparisons++
			if (compareKeys(x, y) <= 0) {
				r.step(`Pass ${pass}: a[${j}] = ${x} ≤ a[${j + 1}] = ${y}: leave them`, step)
				continue
			}
			r.step(`Pass ${pass}: a[${j}] = ${x} > a[${j + 1}] = ${y}: swap them`, step)
			r.set(swapped(r.state, j, j + 1))
			r.counts.swaps++
			swaps++
			r.step(`swap(a[${j}], a[${j + 1}])`, { ...step, swaps: [[j, j + 1]] })
		}
		if (!swaps) {
			r.step(`No swaps in pass ${pass}: every neighbour is in order, so the array is sorted`, { lit: lit(0, n - 1, DONE) })
			break
		}
		r.step(`End of pass ${pass}: ${r.state.values[end]} has bubbled up to index ${end}`, { lit: lit(end, n - 1, DONE) })
	}
	return sorted(r, n)
}

// Quicksort (Lomuto's partition): the last value of the range is the pivot (red); i marks the end of
// the values smaller than it (blue), j walks the rest; then the pivot swaps into its final place.

type Recorder = ReturnType<typeof recorder>

/** Steps of partitioning a[lo..hi] around a[hi]; returns the pivot's final index. */
function partition(r: Recorder, lo: number, hi: number, settled: Marks, around: Pick<Step, 'dim' | 'strips'>): number {
	const p = r.state.values[hi]
	let i = lo - 1
	// Settled cells, the pivot, the smaller values so far, and whatever else this step lights.
	const shown = (extra: Marks = {}): Marks => ({ ...settled, ...lit(lo, i, SMALL), [hi]: PIVOT, ...extra })
	const at = (j?: number) => [ptr('i', i), ...(j === undefined ? [] : [ptr('j', j)])]
	r.step(`pivot = a[${hi}] = ${p}. i = ${i}: no values smaller than the pivot yet`, { ...around, lit: shown(), pointers: at(lo) })
	for (let j = lo; j < hi; j++) {
		const x = r.state.values[j]
		r.counts.comparisons++
		if (compareKeys(x, p) >= 0) {
			r.step(`a[${j}] = ${x} ≥ ${p}: it stays on the right`, { ...around, lit: shown({ [j]: LOOK }), pointers: at(j) })
			continue
		}
		r.step(`a[${j}] = ${x} < ${p}: it belongs with the smaller values`, { ...around, lit: shown({ [j]: LOOK }), pointers: at(j) })
		i++
		if (i === j) {
			r.step(`i = ${i}, which is j: a[${j}] is in place already`, { ...around, lit: shown(), pointers: at(j) })
			continue
		}
		r.set(swapped(r.state, i, j))
		r.counts.swaps++
		r.step(`i = ${i}; swap(a[${i}], a[${j}])`, { ...around, lit: shown(), pointers: at(j), swaps: [[i, j]] })
	}
	const to = i + 1
	if (to !== hi) {
		r.set(swapped(r.state, to, hi))
		r.counts.swaps++
	}
	settled[String(to)] = DONE
	r.step(
		to === hi
			? `No value is larger than the pivot: ${p} stays at index ${hi}, its final place`
			: `swap(a[${to}], a[${hi}]): the pivot ${p} lands at index ${to}, its final place. Smaller values are left of it, the others right`,
		{ ...around, lit: { ...settled, ...lit(lo, i, SMALL) }, pointers: [ptr('i', i)], swaps: to === hi ? undefined : [[to, hi]] }
	)
	return to
}

/** One partition of the whole array around its last value. */
export function partitionArray(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, sortCounts())
	const settled: Marks = {}
	const p = partition(r, 0, n - 1, settled, {})
	return { frames: r.frames, result: r.state, finalFlash: { [p]: DONE } }
}

/**
 * Quicksort: partition, then sort each side the same way. The range being worked on is the one
 * not faded; the calls still open are a stack under the array (the innermost on the right).
 */
export function quicksort(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, sortCounts())
	const settled: Marks = {}
	const calls: string[] = []
	const outside = (lo: number, hi: number) => span(0, n - 1).filter((k) => Number(k) < lo || Number(k) > hi)
	const sort = (lo: number, hi: number) => {
		calls.push(`${lo}..${hi}`)
		const around = { dim: outside(lo, hi), strips: [{ title: 'call stack', items: [...calls] }] }
		if (lo >= hi) {
			if (lo === hi) settled[String(lo)] = DONE
			r.step(`quicksort(${lo}, ${hi}): ${lo === hi ? `one value, a[${lo}], is sorted` : 'no values: nothing to do'}`, {
				...around,
				lit: { ...settled },
			})
		} else {
			r.step(`quicksort(${lo}, ${hi}): partition a[${lo}..${hi}]`, { ...around, lit: { ...settled } })
			const p = partition(r, lo, hi, settled, around)
			sort(lo, p - 1)
			sort(p + 1, hi)
		}
		calls.pop()
	}
	sort(0, n - 1)
	const { comparisons, swaps } = r.counts
	r.step(`Every call has returned: sorted, with ${comparisons} comparisons and ${swaps} swaps`, {
		lit: lit(0, n - 1, DONE),
		strips: [{ title: 'call stack', items: [] }],
	})
	return { frames: r.frames, result: r.state }
}

/**
 * Hoare's partition around the first value: i walks in from the left past values smaller than the
 * pivot, j from the right past larger ones; when both stop, the two values swap, until the
 * pointers cross. Then a[0..j] ≤ pivot ≤ a[j+1..], but the pivot need not be in its final place.
 */
export function hoarePartition(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, sortCounts())
	const p = r.state.values[0]
	let i = -1
	let j = n
	let pivotAt = 0
	const shown = (extra: Marks = {}): Marks => ({ [pivotAt]: PIVOT, ...extra })
	const at = () => [ptr('i', i), ptr('j', j)]
	r.step(`pivot = a[0] = ${p}. i starts before the array, j after it`, { lit: shown(), pointers: at() })
	for (;;) {
		do {
			i++
			r.counts.comparisons++
			const x = r.state.values[i]
			const stop = compareKeys(x, p) >= 0
			r.step(`i = ${i}: a[${i}] = ${x} ${stop ? `≥ ${p}, so i stops` : `< ${p}, so keep going`}`, {
				lit: shown(stop ? { [i]: LOOK } : {}),
				pointers: at(),
			})
			if (stop) break
		} while (i < n - 1)
		do {
			j--
			r.counts.comparisons++
			const x = r.state.values[j]
			const stop = compareKeys(x, p) <= 0
			r.step(`j = ${j}: a[${j}] = ${x} ${stop ? `≤ ${p}, so j stops` : `> ${p}, so keep going`}`, {
				lit: shown(stop ? { [i]: LOOK, [j]: LOOK } : { [i]: LOOK }),
				pointers: at(),
			})
			if (stop) break
		} while (j > 0)
		if (i >= j) break
		r.set(swapped(r.state, i, j))
		r.counts.swaps++
		if (pivotAt === i) pivotAt = j
		else if (pivotAt === j) pivotAt = i
		r.step(`i < j: swap(a[${i}], a[${j}]), so each goes to its side`, { lit: shown(), pointers: at(), swaps: [[i, j]] })
	}
	r.step(
		`i = ${i} ≥ j = ${j}: the pointers have crossed. a[0..${j}] ≤ ${p} ≤ a[${j + 1}..${n - 1}]; unlike Lomuto's, the pivot isn't necessarily in its final place`,
		{ lit: { ...lit(0, j, SMALL), [pivotAt]: PIVOT }, pointers: at() }
	)
	return { frames: r.frames, result: r.state }
}

/**
 * Merge sort: split the range in half, sort each half the same way, then merge them: the smaller
 * of the two front values goes next into the merged run (a strip; taken values fade), and the run
 * is copied back, each value arcing into its new cell. Open calls are a stack, as in quicksort.
 */
export function mergeSort(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, { comparisons: 0, copies: 0 })
	const calls: string[] = []
	const outside = (lo: number, hi: number) => span(0, n - 1).filter((k) => Number(k) < lo || Number(k) > hi)
	const strips = (merged: string[] = []) => [
		{ title: 'call stack', items: [...calls] },
		{ title: 'merged', items: merged },
	]
	const sort = (lo: number, hi: number) => {
		calls.push(`${lo}..${hi}`)
		if (lo === hi) {
			r.step(`mergeSort(${lo}, ${hi}): one value, a[${lo}], is sorted`, { dim: outside(lo, hi), strips: strips(), lit: { [lo]: DONE } })
			calls.pop()
			return
		}
		const mid = Math.floor((lo + hi) / 2)
		r.step(`mergeSort(${lo}, ${hi}): sort a[${lo}..${mid}] and a[${mid + 1}..${hi}], then merge them`, {
			dim: outside(lo, hi),
			strips: strips(),
		})
		sort(lo, mid)
		sort(mid + 1, hi)
		// Merge: i and j walk the two sorted halves; the smaller front value goes next.
		const values = r.state.values
		const merged: string[] = []
		const from: number[] = []
		let i = lo
		let j = mid + 1
		const halves = { ...lit(lo, mid, SMALL), ...lit(mid + 1, hi, DONE) }
		const taken = () => from.map(String)
		r.step(`Merge a[${lo}..${mid}] (blue) and a[${mid + 1}..${hi}] (green), both sorted`, {
			dim: outside(lo, hi),
			strips: strips(),
			lit: halves,
			pointers: [ptr('i', i), ptr('j', j)],
		})
		while (i <= mid || j <= hi) {
			// Which half the next value comes from (i and j can be equal once the left half is used up).
			let left: boolean
			let why: string
			if (i > mid) {
				left = false
				why = `The left half is used up: take a[${j}] = ${values[j]}`
			} else if (j > hi) {
				left = true
				why = `The right half is used up: take a[${i}] = ${values[i]}`
			} else {
				r.counts.comparisons++
				left = compareKeys(values[i], values[j]) <= 0
				why = left
					? `a[${i}] = ${values[i]} ≤ a[${j}] = ${values[j]}: take ${values[i]}`
					: `a[${j}] = ${values[j]} < a[${i}] = ${values[i]}: take ${values[j]}`
			}
			const take = left ? i++ : j++
			merged.push(values[take])
			from.push(take)
			r.counts.copies++
			r.step(why, {
				dim: [...outside(lo, hi), ...taken()],
				strips: strips([...merged]),
				lit: { ...halves, [take]: LOOK },
				pointers: [ptr('i', i), ptr('j', j)],
			})
		}
		// Copy the run back: marks travel with their values.
		const marks: Marks = { ...r.state.marks }
		for (let k = lo; k <= hi; k++) delete marks[String(k)]
		from.forEach((old, k) => {
			const mark = r.state.marks[String(old)]
			if (mark) marks[String(lo + k)] = mark
		})
		r.set({ values: [...values.slice(0, lo), ...merged, ...values.slice(hi + 1)], marks })
		r.counts.copies += merged.length
		r.step(`Copy the merged run back into a[${lo}..${hi}]: it is sorted`, {
			dim: outside(lo, hi),
			strips: strips(),
			lit: lit(lo, hi, DONE),
			moves: from.map((old, k): [number, number] => [old, lo + k]).filter(([a, b]) => a !== b),
		})
		calls.pop()
	}
	sort(0, n - 1)
	const { comparisons, copies } = r.counts
	r.step(`Every call has returned: sorted, with ${comparisons} comparisons and ${copies} copies`, {
		lit: lit(0, n - 1, DONE),
		strips: [
			{ title: 'call stack', items: [] },
			{ title: 'merged', items: [] },
		],
	})
	return { frames: r.frames, result: r.state }
}

// Inserting and deleting, shifting the values after the index: one copy per value, where a linked
// list re-points two arrows.

/** Delete a[k]: each later value is copied one cell left, then the last cell is dropped. */
export function deleteAt(start: ArrayState, k: number): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, { moves: 0 })
	const v = start.values[k]
	r.step(
		k === n - 1
			? `Delete a[${k}] = ${v}, the last value: nothing has to move`
			: `Delete a[${k}] = ${v}: every value after it moves one cell left`,
		{ lit: { [k]: GONE }, pointers: [ptr('i', k)] }
	)
	for (let i = k; i < n - 1; i++) {
		r.set(copied(r.state, i + 1, i))
		r.counts.moves++
		r.step(`a[${i}] = a[${i + 1}] (${r.state.values[i]})`, { pointers: [ptr('i', i)], moves: [[i + 1, i]] })
	}
	// The last step shows the result, so the array stays as it is once the operation is done.
	const result = withoutCell(start, k)
	r.set(result)
	const moved = r.counts.moves
	r.step(`n = n - 1: the last cell is no longer used. ${moved} value${moved === 1 ? '' : 's'} moved`)
	return { frames: r.frames, result }
}

/**
 * Insert `value` at index k: a cell is added at the end, the values from k on are copied one cell
 * right starting from the end (so nothing is overwritten), then a[k] = value.
 */
export function insertAt(start: ArrayState, k: number, value: string): ArrayOperation {
	const n = start.values.length
	const r = recorder({ values: [...start.values, ''], marks: start.marks }, { moves: 0 })
	r.step(
		k === n
			? `Insert ${value} at the end: n = n + 1, and nothing has to move`
			: `Insert ${value} at index ${k}. First make room: n = n + 1`,
		{ lit: { [n]: LOOK } }
	)
	for (let i = n; i > k; i--) {
		r.set(copied(r.state, i - 1, i))
		r.counts.moves++
		const why = i === n ? ': from the end, so nothing is overwritten' : ''
		r.step(`a[${i}] = a[${i - 1}] (${r.state.values[i]})${why}`, { pointers: [ptr('i', i)], moves: [[i - 1, i]] })
	}
	const result = withCell(start, k, value)
	r.set(result)
	const moved = r.counts.moves
	r.step(`a[${k}] = ${value}. ${moved} value${moved === 1 ? '' : 's'} moved to make room`, { lit: { [k]: DONE }, pointers: [ptr('i', k)] })
	return { frames: r.frames, result, finalFlash: { [k]: DONE } }
}

/** The array without cell k: later values (and their marks) one index down. */
export function withoutCell({ values, marks }: ArrayState, k: number): ArrayState {
	const moved: Marks = {}
	for (const [key, color] of Object.entries(marks)) {
		const i = Number(key)
		if (i < k) moved[key] = color
		else if (i > k) moved[String(i - 1)] = color
	}
	return { values: values.filter((_, i) => i !== k), marks: moved }
}

/** The array with `value` at index k: values from k on (and their marks) one index up. */
export function withCell({ values, marks }: ArrayState, k: number, value: string): ArrayState {
	const moved: Marks = {}
	for (const [key, color] of Object.entries(marks)) moved[String(Number(key) < k ? Number(key) : Number(key) + 1)] = color
	return { values: [...values.slice(0, k), value, ...values.slice(k)], marks: moved }
}

/**
 * Fixed capacity: cell k's value goes, the used values after it move down one, and the last used
 * slot becomes a blank spare one (the capacity stays).
 */
export function withoutUsedCell(state: ArrayState, k: number): ArrayState {
	const { values, marks } = withoutCell(state, k)
	return { values: [...values, ''], marks }
}

/**
 * Fixed capacity, with room (used < capacity): `value` at index k, the used values from k on move
 * up one into the first spare slot.
 */
export function withUsedCell(state: ArrayState, used: number, k: number, value: string): ArrayState {
	const { values, marks } = withCell(state, k, value)
	// The spare slot that was at index `used` is now at used + 1, and is taken.
	values.splice(used + 1, 1)
	return { values, marks }
}

// Fixed capacity, as in C and Java: the array's cells are its capacity, the first `used` hold
// values, the rest are blank spare slots. Inserting needs a spare slot; when the array is full,
// a bigger one has to be made and everything copied into it.

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Insert `value` at index k of a fixed array. With a spare slot, the used values from the end back
 * to k move right one at a time, then a[k] = value and size goes up. Full, it stops and says so.
 */
export function insertFixed(start: ArrayState, used: number, k: number, value: string): ArrayOperation {
	const capacity = start.values.length
	const r = recorder({ ...start, used }, { moves: 0 })
	if (used >= capacity) {
		r.step(`size = capacity = ${capacity}: the array is full, so there is no room for ${value}. Grow it first (Capacity > Grow)`, {
			lit: { [capacity - 1]: GONE },
		})
		return { frames: r.frames }
	}
	r.step(`Insert ${value} at index ${k}: size ${used} < capacity ${capacity}, so a[${used}] is free`, { lit: { [used]: LOOK } })
	for (let i = used; i > k; i--) {
		r.set(copied(r.state, i - 1, i))
		r.counts.moves++
		const why = i === used ? ': from the end, so nothing is overwritten' : ''
		r.step(`a[${i}] = a[${i - 1}] (${r.state.values[i]})${why}`, { pointers: [ptr('i', i)], moves: [[i - 1, i]] })
	}
	const result = { ...withUsedCell(start, used, k, value), used: used + 1 }
	r.set(result)
	r.step(`a[${k}] = ${value}; size = ${used + 1}. ${plural(r.counts.moves, 'value')} moved`, { lit: { [k]: DONE }, pointers: [ptr('i', k)] })
	return { frames: r.frames, result, finalFlash: { [k]: DONE } }
}

/** Delete a[k] of a fixed array: the used values after it move left, then the last used slot is spare. */
export function deleteFixed(start: ArrayState, used: number, k: number): ArrayOperation {
	const r = recorder({ ...start, used }, { moves: 0 })
	r.step(`Delete a[${k}] = ${start.values[k]}: the values after it, up to a[size - 1], move one cell left`, {
		lit: { [k]: GONE },
		pointers: [ptr('i', k)],
	})
	for (let i = k; i < used - 1; i++) {
		r.set(copied(r.state, i + 1, i))
		r.counts.moves++
		r.step(`a[${i}] = a[${i + 1}] (${r.state.values[i]})`, { pointers: [ptr('i', i)], moves: [[i + 1, i]] })
	}
	const result = { ...withoutUsedCell(start, k), used: used - 1 }
	r.set(result)
	r.step(`size = ${used - 1}: a[${used - 1}] is a spare slot again. ${plural(r.counts.moves, 'value')} moved`)
	return { frames: r.frames, result }
}

/**
 * Steps of growing a fixed array to `capacity` cells: newArr appears under it, the values in use
 * are copied down (one step each, or all in one), then a = newArr takes its place.
 */
function growSteps(r: Recorder, capacity: number, { oneByOne }: { oneByOne: boolean }) {
	const { values, used = values.length } = r.state
	const old = values.length
	const title = `newArr = new int[${capacity}]`
	const blank = Array<string>(capacity).fill('')
	r.set({ ...r.state, aux: { title, values: blank } })
	r.step(`${title}: a new array with room for ${capacity}. Arrays can't grow, so the values have to move`)
	if (oneByOne) {
		for (let i = 0; i < used; i++) {
			r.set({ ...r.state, aux: { title, values: [...values.slice(0, i + 1), ...blank.slice(i + 1)] } })
			r.counts.copies++
			r.step(`newArr[${i}] = a[${i}] (${values[i]})`, { pointers: [ptr('i', i)], lit: { [i]: LOOK }, moves: [[i, `aux:${i}`]] })
		}
	} else {
		r.set({ ...r.state, aux: { title, values: [...values.slice(0, used), ...blank.slice(used)] } })
		r.counts.copies += used
		r.step(`Copy all ${plural(used, 'value')} into newArr`, { moves: Array.from({ length: used }, (_, i): [number, string] => [i, `aux:${i}`]) })
	}
	r.set({ values: [...values.slice(0, used), ...blank.slice(used)], marks: r.state.marks, used })
	r.step(`a = newArr: capacity ${old} → ${capacity}. The old array is garbage now`, {
		moves: Array.from({ length: used }, (_, i): [string, number] => [`aux:${i}`, i]),
	})
}

/** Grow a fixed array to twice its capacity, value by value. */
export function growFixed(start: ArrayState, used: number): ArrayOperation {
	const r = recorder({ ...start, used }, { copies: 0 })
	growSteps(r, Math.max(1, start.values.length * 2), { oneByOne: true })
	r.step(`Growing cost ${plural(r.counts.copies, 'copy')}, one per value: doubling makes it rare`)
	return { frames: r.frames, result: { ...r.state, aux: undefined } }
}

/**
 * Append `value` to a fixed array, as ArrayList.add does: straight into a[size] when there is a
 * spare slot (nothing moves), else grow to twice the capacity first.
 */
export function appendFixed(start: ArrayState, used: number, value: string): ArrayOperation {
	const r = recorder({ ...start, used }, { copies: 0 })
	if (used >= start.values.length) {
		r.step(`Append ${value}: size = capacity = ${used}, the array is full. Grow it first, to twice the capacity`, {
			lit: { [used - 1]: GONE },
		})
		growSteps(r, Math.max(1, start.values.length * 2), { oneByOne: false })
	}
	const capacity = r.state.values.length
	r.step(`Append ${value}: size ${used} < capacity ${capacity}, so it goes straight into a[${used}]`, {
		lit: { [used]: LOOK },
		pointers: [ptr('size', used)],
	})
	const values = [...r.state.values]
	values[used] = value
	r.set({ values, marks: r.state.marks, used: used + 1 })
	r.step(`a[size] = ${value}; size = ${used + 1}. Nothing had to move`, { lit: { [used]: DONE }, pointers: [ptr('size', used + 1)] })
	return { frames: r.frames, result: r.state, finalFlash: { [used]: DONE } }
}
