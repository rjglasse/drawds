import type { MarkColor, Marks } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { CallEvent, Frame, Strip } from '../../nodelink/playback'
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
	/** A circular buffer's front. */
	front?: number
	aux?: AuxRow
}

export interface ArrayOperation {
	frames: Frame[]
	/** The array afterwards, if the operation changes it. */
	result?: ArrayState
	/** Highlights on the result. */
	finalFlash?: Marks
	/** Its code (an algorithm in `code.ts`), if it has some: the line each step is on is its frame's `line`. */
	code?: string
}

export const ptr = (name: string, at: number): Pointer => ({ id: `#${name}`, name, at: String(at) })

/** Cell keys from..to (inclusive). */
export const span = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => String(from + k))

/** The same colour on cells from..to. */
export const lit = (from: number, to: number, color: MarkColor): Marks => Object.fromEntries(span(from, to).map((k) => [k, color]))

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
	/** Predict mode's question before this step (false: nothing to guess), and the cells it is about. */
	ask?: string | false
	askFocus?: (number | string)[]
	/** Recursive calls made and returned at this step, for the recursion tree beside the array. */
	calls?: CallEvent[]
	/** The line of the operation's code this step is on (a tag in `code.ts`). */
	line?: string
	/** A labelled bracket along cells from..to: what holds over them (a loop invariant). */
	band?: Frame['band']
	/** Small notes in cells' corners, by index, kept for later steps ('' takes one away). */
	badges?: Record<string, string>
}

/**
 * Records frames from what each step shows: its highlights (turned into the changes a frame
 * holds), pointers, faded cells, and the array as it is then, with the counts so far.
 */
export function recorder(start: ArrayState, counts: Record<string, number>) {
	const frames: Frame[] = []
	let shown: Marks = {}
	let state: ArrayState = { ...start, values: [...start.values], marks: { ...start.marks } }
	/** The code's variables beside the pointers (maxval, swapped...): every step from now on shows them. */
	const vars: Record<string, string> = {}
	/** Times each counted line of the code has run, by tag. */
	const runs: Record<string, number> = {}
	return {
		frames,
		counts,
		/** The lines of the code that are counted (each from 0), by tag: every step shows their counts. */
		counting(...tags: string[]) {
			for (const tag of tags) runs[tag] = 0
		},
		/** The code ran these lines (once each, in order) on its way to the next step. */
		ran(...tags: string[]) {
			for (const tag of tags) runs[tag] = (runs[tag] ?? 0) + 1
		},
		/** Set a variable (undefined: it goes out of scope); later steps show it. */
		let(name: string, value: string | number | boolean | undefined) {
			if (value === undefined) delete vars[name]
			else vars[name] = String(value)
		},
		get state() {
			return state
		},
		/** The array changes (a swap, a copy): later steps show it. */
		set(next: ArrayState) {
			state = next
		},
		step(caption: string, { lit: next = {}, pointers = [], dim = [], swaps, moves, strips, ask, askFocus, calls, line, band, badges }: Step = {}) {
			const flash: Record<string, MarkColor | null> = {}
			for (const key of Object.keys(shown)) if (!next[key]) flash[key] = null
			for (const [key, color] of Object.entries(next)) if (shown[key] !== color) flash[key] = color
			shown = { ...next }
			const keys = (pairs?: [number | string, number | string][]) => pairs?.map(([a, b]): [string, string] => [String(a), String(b)])
			const { values, marks, used, front, aux } = state
			frames.push({
				caption,
				props: { values, marks, ...(used === undefined ? {} : { used }), ...(front === undefined ? {} : { front }), ...(aux ? { aux } : {}) },
				flash,
				pointers,
				dim,
				swaps: keys(swaps),
				moves: keys(moves),
				strips,
				counts: { ...counts },
				...(ask === undefined ? {} : { ask }),
				...(askFocus ? { askFocus: askFocus.map(String) } : {}),
				...(calls ? { calls } : {}),
				...(line ? { line } : {}),
				...(band ? { band } : {}),
				...(badges ? { badges } : {}),
				...(Object.keys(vars).length ? { vars: { ...vars } } : {}),
				...(Object.keys(runs).length ? { runs: { ...runs } } : {}),
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
	r.let('key', target)
	const outside = (lo: number, hi: number) => span(0, n - 1).filter((k) => Number(k) < lo || Number(k) > hi)
	let lo = 0
	let hi = n - 1
	const unsorted = values.findIndex((v, i) => i > 0 && compareKeys(values[i - 1], v) > 0)
	if (unsorted > 0) {
		const [a, b] = [unsorted - 1, unsorted]
		r.step(`Careful: a[${a}] = ${values[a]} > a[${b}] = ${values[b]}, so the array isn't sorted and binary search can miss ${target}`, {
			lit: { [a]: GONE, [b]: GONE },
			ask: 'Can binary search work on this array?',
		})
	}
	r.step(`lo = 0, hi = ${hi}: ${target} could be anywhere in a[0..${hi}]`, {
		pointers: [ptr('lo', lo), ptr('hi', hi)],
		ask: `Binary search for ${target}: where do lo and hi start?`,
		line: 'init',
	})
	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2)
		const v = values[mid]
		const at = { pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)], dim: outside(lo, hi) }
		r.counts.comparisons++
		r.step(`mid = (${lo} + ${hi}) / 2 = ${mid}. Is a[${mid}] = ${v} equal to ${target}?`, {
			...at,
			lit: { [mid]: LOOK },
			ask: `lo = ${lo}, hi = ${hi}: which index is mid?`,
			line: 'mid',
		})
		const c = compareKeys(v, target)
		// The same question whatever the answer: found, or which half is left.
		const half = { ask: `a[${mid}] = ${v} vs ${target}: found it, or which half is left?`, askFocus: [mid] }
		if (c === 0) {
			r.step(`Yes: found ${target} at index ${mid}, after ${r.counts.comparisons} comparison${r.counts.comparisons === 1 ? '' : 's'}`, {
				...at,
				lit: { [mid]: DONE },
				...half,
				line: 'found',
			})
			return { frames: r.frames, finalFlash: { [mid]: DONE }, code: 'binary-search' }
		}
		if (c < 0) {
			lo = mid + 1
			r.step(`${v} < ${target}, so ${target} can only be right of mid: lo = mid + 1 = ${lo}`, {
				pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)],
				dim: outside(lo, hi),
				...half,
				line: 'right',
			})
		} else {
			hi = mid - 1
			r.step(`${v} > ${target}, so ${target} can only be left of mid: hi = mid - 1 = ${hi}`, {
				pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)],
				dim: outside(lo, hi),
				...half,
				line: 'left',
			})
		}
	}
	r.step(`lo = ${lo} > hi = ${hi}: the pointers have crossed, so ${target} is not in the array`, {
		pointers: [ptr('lo', lo), ptr('hi', hi)],
		dim: span(0, n - 1),
		ask: `lo = ${lo}, hi = ${hi}: does the search go on?`,
		line: 'missing',
	})
	return { frames: r.frames, code: 'binary-search' }
}

/**
 * Binary search written recursively, as lecture 4 writes it (low, mid, high): each call looks at
 * its middle value and, unless it is the key, makes one call on the half left (two calls in the
 * code, but only one runs: not branches). The calls make a chain, about log₂ n long, for the
 * recursion tree beside the array; then each returns what the call it made returned.
 */
export function recursiveBinarySearch(start: ArrayState, target: string): ArrayOperation {
	const { values } = start
	const n = values.length
	const r = recorder(start, { comparisons: 0, calls: 0, 'max depth': 0 })
	r.let('key', target)
	const stack: string[] = []
	const outside = (low: number, high: number) => span(0, n - 1).filter((k) => Number(k) < low || Number(k) > high)
	const unsorted = values.findIndex((v, i) => i > 0 && compareKeys(values[i - 1], v) > 0)
	if (unsorted > 0) {
		const [a, b] = [unsorted - 1, unsorted]
		r.step(`Careful: a[${a}] = ${values[a]} > a[${b}] = ${values[b]}, so the array isn't sorted and binary search can miss ${target}`, {
			lit: { [a]: GONE, [b]: GONE },
			ask: 'Can binary search work on this array?',
		})
	}
	const search = (low: number, high: number): number => {
		stack.push(`${low}..${high}`)
		r.counts.calls++
		r.counts['max depth'] = Math.max(r.counts['max depth'], stack.length)
		r.let('low', low)
		r.let('high', high)
		r.let('mid', undefined)
		const name = `binarySearch(${low}, ${high})`
		const call: CallEvent = { call: name, id: `${low}..${high}` }
		const around = { dim: outside(low, high), strips: [{ title: 'call stack', items: [...stack] }] }
		const ends = [ptr('low', low), ptr('high', high)]
		if (low > high) {
			r.step(`${name}: low > high, nothing left to search: return -1`, {
				...around,
				pointers: ends,
				calls: [call, { returns: '-1' }],
				ask: `low = ${low}, high = ${high}: what does this call do?`,
				line: 'missing',
			})
			stack.pop()
			return -1
		}
		const mid = Math.floor((low + high) / 2)
		const v = values[mid]
		const at = [ptr('low', low), ptr('mid', mid), ptr('high', high)]
		r.counts.comparisons++
		r.let('mid', mid)
		r.step(`${name}: mid = (${low} + ${high}) / 2 = ${mid}. Is a[${mid}] = ${v} the key ${target}?`, {
			...around,
			pointers: at,
			lit: { [mid]: LOOK },
			calls: [call],
			ask: `low = ${low}, high = ${high}: which index is mid?`,
			line: 'mid',
		})
		const c = compareKeys(v, target)
		const half = { ask: `a[${mid}] = ${v} vs ${target}: found it, or which half is left?`, askFocus: [mid] }
		if (c === 0) {
			r.step(`a[${mid}] = ${target}: found, so return ${mid}`, { ...around, pointers: at, lit: { [mid]: DONE }, calls: [{ returns: String(mid) }], ...half, line: 'found' })
			stack.pop()
			return mid
		}
		const [next, line] = c < 0 ? [`binarySearch(${mid + 1}, ${high})`, 'right'] : [`binarySearch(${low}, ${mid - 1})`, 'left']
		r.step(`${v} ${c < 0 ? '<' : '>'} ${target}: the key can only be ${c < 0 ? 'right' : 'left'} of mid, so return ${next}`, {
			...around,
			pointers: at,
			dim: c < 0 ? outside(mid + 1, high) : outside(low, mid - 1),
			...half,
			line,
		})
		const result = c < 0 ? search(mid + 1, high) : search(low, mid - 1)
		// Back from the call it made: it returns what that call returned, and comes off the stack.
		stack.pop()
		r.let('low', low)
		r.let('high', high)
		r.let('mid', mid)
		r.step(`${name} returns ${result}, what ${next} returned`, {
			dim: outside(low, high),
			strips: [{ title: 'call stack', items: [...stack] }],
			pointers: at,
			lit: result >= 0 ? { [result]: DONE } : {},
			calls: [{ returns: String(result) }],
			ask: false,
			line,
		})
		return result
	}
	const found = search(0, n - 1)
	const { calls } = r.counts
	r.let('low', undefined)
	r.let('high', undefined)
	r.let('mid', undefined)
	r.step(
		`${found >= 0 ? `Found ${target} at index ${found}` : `${target} is not in the array`}: ${calls} call${calls === 1 ? '' : 's'}, one per halving, so about log₂ ${n} deep: T(n) = T(n/2) + 1. The loop version needs no stack`,
		{ lit: found >= 0 ? { [found]: DONE } : {}, strips: [{ title: 'call stack', items: [] }], ask: false }
	)
	return { frames: r.frames, finalFlash: found >= 0 ? { [found]: DONE } : undefined, code: 'binary-search-recursive' }
}

/** Linear search for `target`: i walks from the start, comparing each value, fading the ones it passed. */
export function linearSearch(start: ArrayState, target: string): ArrayOperation {
	const { values } = start
	const n = values.length
	const r = recorder(start, { comparisons: 0 })
	r.let('key', target)
	r.counting('loop', 'compare', 'found', 'missing')
	for (let i = 0; i < n; i++) {
		r.counts.comparisons++
		r.ran('loop', 'compare')
		const step = { pointers: [ptr('i', i)], dim: span(0, i - 1), ask: `i = ${i}: is a[${i}] the ${target} we want?`, askFocus: [i] }
		if (compareKeys(values[i], target) === 0) {
			r.ran('found')
			r.step(`i = ${i}: a[${i}] = ${values[i]}. Found ${target} at index ${i}`, { ...step, lit: { [i]: DONE }, line: 'found' })
			return { frames: r.frames, finalFlash: { [i]: DONE }, code: 'linear-search' }
		}
		r.step(`i = ${i}: a[${i}] = ${values[i]} ≠ ${target}, so on to the next`, { ...step, lit: { [i]: LOOK }, line: 'compare' })
	}
	r.ran('loop', 'missing')
	r.step(`i = ${n}: past the end, so ${target} is not in the array`, {
		pointers: [ptr('i', n)],
		dim: span(0, n - 1),
		ask: `i = ${n}: what now?`,
		line: 'missing',
	})
	return { frames: r.frames, code: 'linear-search' }
}

// Sorting. Counts of comparisons and swaps run in the play bar, so a class can compare algorithms.

export function sortCounts() {
	return { comparisons: 0, swaps: 0 }
}

function sorted(r: ReturnType<typeof recorder>, n: number, code: string): ArrayOperation {
	const { comparisons, swaps } = r.counts
	r.step(`Sorted: ${comparisons} comparisons, ${swaps} swaps`, { lit: lit(0, n - 1, DONE), ask: false })
	return { frames: r.frames, result: r.state, code }
}

/**
 * Insertion sort (by swapping): each new value a[i] moves left, swapping with its neighbour while
 * that is larger, into the sorted part a[0..i] (green).
 */
export function insertionSort(start: ArrayState): ArrayOperation {
	const n = start.values.length
	// The while test runs once more than the comparisons when j reaches 0: j > 0 stops it before it
	// compares anything. Lecture 3 counts the tests (n(n + 1)/2 - 1 at worst): both are counted.
	const r = recorder(start, { ...sortCounts(), 'while tests': 0 })
	r.counting('outer', 'key', 'start', 'compare', 'swap', 'back')
	r.step('a[0] on its own is sorted', { lit: lit(0, 0, DONE), ask: false })
	for (let i = 1; i < n; i++) {
		r.ran('outer', 'key', 'start')
		r.let('key', r.state.values[i])
		r.step(`i = ${i}: insert a[${i}] = ${r.state.values[i]} into the sorted part a[0..${i - 1}]`, {
			lit: { ...lit(0, i - 1, DONE), [i]: LOOK },
			pointers: [ptr('i', i), ptr('j', i)],
			ask: `The sorted part is a[0..${i - 1}]: which value goes into it next?`,
			line: 'outer',
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
			const ask = { ask: `a[${j - 1}] = ${x} vs a[${j}] = ${y}: swap them or not?`, askFocus: [j - 1, j], line: 'compare' }
			r.counts.comparisons++
			r.counts['while tests']++
			r.ran('compare')
			if (compareKeys(x, y) <= 0) {
				r.step(`a[${j - 1}] = ${x} ≤ a[${j}] = ${y}: ${y} is in place`, { lit: lit(0, i, DONE), pointers, ...ask })
				break
			}
			r.step(`a[${j - 1}] = ${x} > a[${j}] = ${y}: swap them`, { lit: around(j, j - 1), pointers, ...ask })
			r.set(swapped(r.state, j - 1, j))
			r.counts.swaps++
			r.ran('swap', 'back')
			r.step(`swap(a[${j - 1}], a[${j}]); j = ${j - 1}`, {
				lit: around(j - 1),
				pointers: [ptr('i', i), ptr('j', j - 1)],
				swaps: [[j - 1, j]],
				ask: false,
				line: 'swap',
			})
			j--
			if (j === 0) {
				r.counts['while tests']++
				r.ran('compare')
				r.step(`j = 0: ${y} is the smallest so far, at the front. The while test stops at j > 0, comparing no values`, {
					lit: lit(0, i, DONE),
					pointers: [ptr('i', i), ptr('j', 0)],
					ask: false,
					line: 'compare',
				})
			}
		}
	}
	r.ran('outer')
	const { comparisons, swaps } = r.counts
	const tests = r.counts['while tests']
	if (tests > comparisons) {
		r.step(
			`Sorted: ${comparisons} comparisons, ${swaps} swaps. The while test ran ${tests} times, ${tests - comparisons} more: once for each value that reached the front, where j > 0 stops it before it compares anything`,
			{ lit: lit(0, n - 1, DONE), ask: false }
		)
		return { frames: r.frames, result: r.state, code: 'insertion-sort' }
	}
	return sorted(r, n, 'insertion-sort')
}

/**
 * Selection sort: for each i, j scans the rest for the smallest value (min), which then swaps into
 * a[i], its final place (green).
 */
export function selectionSort(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, sortCounts())
	r.counting('n', 'outer', 'init', 'inner', 'compare', 'update', 'noswap', 'swap')
	r.ran('n')
	for (let i = 0; i < n - 1; i++) {
		let min = i
		r.ran('outer', 'init')
		r.step(`i = ${i}: find the smallest of a[${i}..${n - 1}]. min = ${i} (${r.state.values[i]}) so far`, {
			lit: { ...lit(0, i - 1, DONE), [i]: LOOK },
			pointers: [ptr('i', i), ptr('min', min)],
			ask: false,
			line: 'init',
		})
		for (let j = i + 1; j < n; j++) {
			const [x, m] = [r.state.values[j], r.state.values[min]]
			const ask = { ask: `a[${j}] = ${x} vs a[min] = ${m}: does min move?`, askFocus: [j, min] }
			r.counts.comparisons++
			r.ran('inner', 'compare')
			if (compareKeys(x, m) < 0) {
				r.ran('update')
				r.step(`a[${j}] = ${x} < a[min] = ${m}: min = ${j}`, {
					lit: { ...lit(0, i - 1, DONE), [j]: LOOK },
					pointers: [ptr('i', i), ptr('j', j), ptr('min', j)],
					...ask,
					line: 'update',
				})
				min = j
			} else {
				r.step(`a[${j}] = ${x} ≥ a[min] = ${m}: min stays ${min}`, {
					lit: { ...lit(0, i - 1, DONE), [j]: LOOK, [min]: LOOK },
					pointers: [ptr('i', i), ptr('j', j), ptr('min', min)],
					...ask,
					line: 'compare',
				})
			}
		}
		const placed = { ask: `The scan is done and min = ${min}: what happens at index ${i}?`, askFocus: [i] }
		r.ran('inner', 'noswap')
		if (min === i) {
			r.step(`a[${i}] = ${r.state.values[i]} is already the smallest: no swap`, {
				lit: lit(0, i, DONE),
				pointers: [ptr('i', i), ptr('min', min)],
				...placed,
				line: 'noswap',
			})
			continue
		}
		const v = r.state.values[min]
		r.set(swapped(r.state, i, min))
		r.counts.swaps++
		r.ran('swap')
		r.step(`swap(a[${i}], a[min]): ${v} goes to index ${i}, its place`, {
			lit: lit(0, i, DONE),
			pointers: [ptr('i', i), ptr('min', min)],
			swaps: [[i, min]],
			...placed,
			line: 'swap',
		})
	}
	r.ran('outer')
	return sorted(r, n, 'selection-sort')
}

/**
 * Bubble sort: j walks along, swapping neighbours that are out of order, so the largest value of
 * the pass bubbles up to the end (green). A pass without swaps means the array is sorted.
 */
export function bubbleSort(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, sortCounts())
	r.counting('n', 'outer', 'reset', 'inner', 'compare', 'swap', 'flag', 'pass', 'sorted')
	r.ran('n')
	let early = false
	for (let pass = 1; pass < n; pass++) {
		const end = n - pass
		let swaps = 0
		r.ran('outer', 'reset')
		r.let('pass', pass)
		r.let('swapped', false)
		const settled = lit(end + 1, n - 1, DONE)
		for (let j = 0; j < end; j++) {
			const [x, y] = [r.state.values[j], r.state.values[j + 1]]
			const step = { lit: { ...settled, [j]: LOOK, [j + 1]: LOOK }, pointers: [ptr('j', j)] }
			const ask = { ask: `a[${j}] = ${x} vs a[${j + 1}] = ${y}: swap them or leave them?`, askFocus: [j, j + 1], line: 'compare' }
			r.counts.comparisons++
			r.ran('inner', 'compare')
			if (compareKeys(x, y) <= 0) {
				r.step(`Pass ${pass}: a[${j}] = ${x} ≤ a[${j + 1}] = ${y}: leave them`, { ...step, ...ask })
				continue
			}
			r.step(`Pass ${pass}: a[${j}] = ${x} > a[${j + 1}] = ${y}: swap them`, { ...step, ...ask })
			r.set(swapped(r.state, j, j + 1))
			r.counts.swaps++
			swaps++
			r.ran('swap', 'flag')
			r.let('swapped', true)
			r.step(`swap(a[${j}], a[${j + 1}])`, { ...step, swaps: [[j, j + 1]], ask: false, line: 'swap' })
		}
		const over = { ask: `Pass ${pass} is over: what do we know now?` }
		r.ran('inner', 'pass')
		if (!swaps) {
			r.ran('sorted')
			early = true
			r.step(`No swaps in pass ${pass}: every neighbour is in order, so the array is sorted`, { lit: lit(0, n - 1, DONE), ...over, line: 'sorted' })
			break
		}
		r.step(`End of pass ${pass}: ${r.state.values[end]} has bubbled up to index ${end}`, { lit: lit(end, n - 1, DONE), ...over, line: 'pass' })
	}
	if (!early) r.ran('outer')
	return sorted(r, n, 'bubble-sort')
}

// Quicksort (Lomuto's partition): the last value of the range is the pivot (red); i marks the end of
// the values smaller than it (blue), j walks the rest; then the pivot swaps into its final place.
// Quicksort itself and lecture 10's improvements are in `quicksorts.ts`.

export type Recorder = ReturnType<typeof recorder>

/** What every step of a recursive call shows around its range: the rest faded, the call stack. */
export type Around = Pick<Step, 'dim' | 'strips'>

/** Steps of partitioning a[lo..hi] around a[hi]; returns the pivot's final index. */
export function partition(r: Recorder, lo: number, hi: number, settled: Marks, around: Around): number {
	const p = r.state.values[hi]
	let i = lo - 1
	r.let('lo', lo)
	r.let('hi', hi)
	r.let('pivot', p)
	// Settled cells, the pivot, the smaller values so far, and whatever else this step lights.
	const shown = (extra: Marks = {}): Marks => ({ ...settled, ...lit(lo, i, SMALL), [hi]: PIVOT, ...extra })
	const at = (j?: number) => [ptr('i', i), ...(j === undefined ? [] : [ptr('j', j)])]
	r.step(`pivot = a[${hi}] = ${p}. i = ${i}: no values smaller than the pivot yet`, {
		...around,
		lit: shown(),
		pointers: at(lo),
		ask: `Partition a[${lo}..${hi}] (Lomuto): which value is the pivot?`,
		line: 'pivot',
	})
	for (let j = lo; j < hi; j++) {
		const x = r.state.values[j]
		const side = { ask: `a[${j}] = ${x} vs the pivot ${p}: which side does it belong on?`, askFocus: [j], line: 'compare' }
		r.counts.comparisons++
		if (compareKeys(x, p) >= 0) {
			r.step(`a[${j}] = ${x} ≥ ${p}: it stays on the right`, { ...around, lit: shown({ [j]: LOOK }), pointers: at(j), ...side })
			continue
		}
		r.step(`a[${j}] = ${x} < ${p}: it belongs with the smaller values`, { ...around, lit: shown({ [j]: LOOK }), pointers: at(j), ...side })
		// Where i says the smaller values end: the same question whether or not a swap is needed.
		const where = { ask: `${x} belongs with the smaller values: what happens to i, and where does ${x} go?`, askFocus: [j], line: 'swap' }
		i++
		if (i === j) {
			r.step(`i = ${i}, which is j: a[${j}] is in place already`, { ...around, lit: shown(), pointers: at(j), ...where })
			continue
		}
		r.set(swapped(r.state, i, j))
		r.counts.swaps++
		r.step(`i = ${i}; swap(a[${i}], a[${j}])`, { ...around, lit: shown(), pointers: at(j), swaps: [[i, j]], ...where })
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
		{
			...around,
			lit: { ...settled, ...lit(lo, i, SMALL) },
			pointers: [ptr('i', i)],
			swaps: to === hi ? undefined : [[to, hi]],
			ask: `Every value is compared: where does the pivot ${p} go?`,
			askFocus: [hi],
			line: 'place',
		}
	)
	return to
}

/** One partition of the whole array around its last value. */
export function partitionArray(start: ArrayState): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, sortCounts())
	const settled: Marks = {}
	const p = partition(r, 0, n - 1, settled, {})
	return { frames: r.frames, result: r.state, finalFlash: { [p]: DONE }, code: 'partition' }
}

/** Predict mode's question before each recursive call: the call stack is under the array. */
export const NEXT_CALL = 'Which call comes next?'

/**
 * A sort's calls for the recursion tree beside the array: each call shows the values it is handed
 * (told apart by its range) and returns them sorted; its size is how many values it works on, so
 * each level's work adds up beside the tree. Returns a step can't carry wait for the next.
 */
export function callEvents(r: Recorder) {
	const pending: CallEvent[] = []
	const values = (lo: number, hi: number) => (lo > hi ? '[ ]' : r.state.values.slice(lo, hi + 1).join(' '))
	let depth = 0
	let deepest = 0
	let worked = 0
	return {
		call(lo: number, hi: number): CallEvent {
			const size = Math.max(0, hi - lo + 1)
			worked += size
			return { call: values(lo, hi), id: `${lo}..${hi}`, size }
		},
		returns: (lo: number, hi: number): CallEvent => ({ returns: lo > hi ? '' : values(lo, hi) }),
		/** The events for a step: any returns waiting, then these. */
		events(...own: CallEvent[]): CallEvent[] {
			const all = [...pending, ...own]
			pending.length = 0
			for (const e of all) {
				if ('call' in e) deepest = Math.max(deepest, ++depth)
				else depth--
			}
			return all
		},
		/** A return for the next step to carry. */
		later(e: CallEvent) {
			pending.push(e)
		},
		/** What the tree comes to: its levels, and the values worked on in all. */
		summary(n: number) {
			const worst = deepest >= n && n > 2
			return worst
				? `${deepest} levels: each call leaves one side empty, so ${n} + ${n - 1} + … + 1 = ${worked} values worked on, about n²/2`
				: `${deepest} levels, ${worked} values worked on in all (n = ${n}, n log₂ n ≈ ${Math.round(n * Math.log2(Math.max(2, n)))})`
		},
	}
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
	r.let('pivot', p)
	const shown = (extra: Marks = {}): Marks => ({ [pivotAt]: PIVOT, ...extra })
	const at = () => [ptr('i', i), ptr('j', j)]
	r.step(`pivot = a[0] = ${p}. i starts before the array, j after it`, { lit: shown(), pointers: at(), ask: false, line: 'pivot' })
	for (;;) {
		do {
			i++
			r.counts.comparisons++
			const x = r.state.values[i]
			const stop = compareKeys(x, p) >= 0
			r.step(`i = ${i}: a[${i}] = ${x} ${stop ? `≥ ${p}, so i stops` : `< ${p}, so keep going`}`, {
				lit: shown(stop ? { [i]: LOOK } : {}),
				pointers: at(),
				ask: `i = ${i}: does i stop at a[${i}] = ${x}?`,
				askFocus: [i],
				line: 'left',
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
				ask: `j = ${j}: does j stop at a[${j}] = ${x}?`,
				askFocus: [j],
				line: 'right',
			})
			if (stop) break
		} while (j > 0)
		if (i >= j) break
		r.set(swapped(r.state, i, j))
		r.counts.swaps++
		if (pivotAt === i) pivotAt = j
		else if (pivotAt === j) pivotAt = i
		r.step(`i < j: swap(a[${i}], a[${j}]), so each goes to its side`, { lit: shown(), pointers: at(), swaps: [[i, j]], ask: BOTH_STOPPED, line: 'swap' })
	}
	r.step(
		`i = ${i} ≥ j = ${j}: the pointers have crossed. a[0..${j}] ≤ ${p} ≤ a[${j + 1}..${n - 1}]; unlike Lomuto's, the pivot isn't necessarily in its final place`,
		{ lit: { ...lit(0, j, SMALL), [pivotAt]: PIVOT }, pointers: at(), ask: BOTH_STOPPED, line: 'crossed' }
	)
	return { frames: r.frames, result: r.state, code: 'hoare-partition' }
}

const BOTH_STOPPED = 'i and j have both stopped: what now?'

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
	// The call's own variables (a call's steps come after its inner calls' too).
	const call = (lo: number, hi: number, mid?: number) => {
		r.let('lo', lo)
		r.let('hi', hi)
		r.let('mid', mid)
	}
	const tree = callEvents(r)
	const sort = (lo: number, hi: number) => {
		calls.push(`${lo}..${hi}`)
		call(lo, hi)
		const made = tree.call(lo, hi)
		if (lo === hi) {
			r.step(`mergeSort(${lo}, ${hi}): one value, a[${lo}], is sorted`, {
				dim: outside(lo, hi),
				strips: strips(),
				lit: { [lo]: DONE },
				ask: NEXT_CALL,
				line: 'base',
				calls: tree.events(made, tree.returns(lo, hi)),
			})
			calls.pop()
			return
		}
		const mid = Math.floor((lo + hi) / 2)
		call(lo, hi, mid)
		r.step(`mergeSort(${lo}, ${hi}): sort a[${lo}..${mid}] and a[${mid + 1}..${hi}], then merge them`, {
			dim: outside(lo, hi),
			strips: strips(),
			ask: NEXT_CALL,
			line: 'split',
			calls: tree.events(made),
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
		call(lo, hi, mid)
		r.let('k', 0)
		r.step(`Merge a[${lo}..${mid}] (blue) and a[${mid + 1}..${hi}] (green), both sorted`, {
			dim: outside(lo, hi),
			strips: strips(),
			lit: halves,
			pointers: [ptr('i', i), ptr('j', j)],
			ask: `Both halves of a[${lo}..${hi}] are sorted: what now?`,
			line: 'merge',
		})
		while (i <= mid || j <= hi) {
			// Which half the next value comes from (i and j can be equal once the left half is used up).
			let left: boolean
			let why: string
			let line: string
			if (i > mid) {
				left = false
				why = `The left half is used up: take a[${j}] = ${values[j]}`
				line = 'rest-right'
			} else if (j > hi) {
				left = true
				why = `The right half is used up: take a[${i}] = ${values[i]}`
				line = 'rest-left'
			} else {
				r.counts.comparisons++
				left = compareKeys(values[i], values[j]) <= 0
				why = left
					? `a[${i}] = ${values[i]} ≤ a[${j}] = ${values[j]}: take ${values[i]}`
					: `a[${j}] = ${values[j]} < a[${i}] = ${values[i]}: take ${values[j]}`
				line = left ? 'left' : 'right'
			}
			const ask =
				i <= mid && j <= hi
					? { ask: `a[${i}] = ${values[i]} vs a[${j}] = ${values[j]}: which goes next into the merged run?`, askFocus: [i, j] }
					: { ask: 'Which value goes next into the merged run?' }
			const take = left ? i++ : j++
			merged.push(values[take])
			from.push(take)
			r.let('k', merged.length)
			r.counts.copies++
			r.step(why, {
				dim: [...outside(lo, hi), ...taken()],
				strips: strips([...merged]),
				lit: { ...halves, [take]: LOOK },
				pointers: [ptr('i', i), ptr('j', j)],
				...ask,
				line,
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
		r.let('k', undefined)
		r.counts.copies += merged.length
		r.step(`Copy the merged run back into a[${lo}..${hi}]: it is sorted`, {
			dim: outside(lo, hi),
			strips: strips(),
			lit: lit(lo, hi, DONE),
			moves: from.map((old, k): [number, number] => [old, lo + k]).filter(([a, b]) => a !== b),
			ask: false,
			line: 'copy',
			calls: tree.events(tree.returns(lo, hi)),
		})
		calls.pop()
	}
	sort(0, n - 1)
	const { comparisons, copies } = r.counts
	r.step(`Every call has returned: sorted, with ${comparisons} comparisons and ${copies} copies. ${tree.summary(n)}`, {
		lit: lit(0, n - 1, DONE),
		strips: [
			{ title: 'call stack', items: [] },
			{ title: 'merged', items: [] },
		],
		ask: false,
	})
	return { frames: r.frames, result: r.state, code: 'merge-sort' }
}

// Summing recursively (lecture 1's recursive strategies): the last value plus the sum of the rest
// makes one call per value, so the stack grows n deep; summing each half and adding makes more
// calls (2n - 1) but never more than log n on the stack. The same additions either way. Each call
// is made and returned in the frames' `calls`, for the recursion tree beside the array.

/** Every value in use is a number, so the array can be summed. */
export const allNumbers = (values: readonly string[]) => values.every((v) => v.trim() !== '' && Number.isFinite(Number(v)))

/** A sum as it reads on the board: whole numbers as they are, others without float noise. */
const total = (x: number) => String(Number.isInteger(x) ? x : Number(x.toFixed(10)))

const sumCall = (lo: number, hi: number) => `sum(${lo}, ${hi})`

/** A recorder for a recursive sum: counts calls, the deepest the stack goes, and additions. */
/**
 * Lecture 4's loop invariant, on summing an array with a loop: total starts at nums[0] (0 would say
 * nothing about nums; an empty array has no nums[0]), and after each pass total = nums[0] + … +
 * nums[i - 1]. A band under the cells summed so far says so, true at the beginning, in the middle
 * and at the end, where i = n makes it the sum of the whole array.
 */
export function sumWithInvariant(start: ArrayState): ArrayOperation {
	const { values } = start
	const n = values.length
	const nums = values.map(Number)
	const r = recorder(start, { additions: 0 })
	// What the invariant says total is: the values written out while they fit, else their range.
	const sumOf = (i: number) => (i <= 6 ? values.slice(0, i).join(' + ') : `nums[0] + … + nums[${i - 1}]`)
	const band = (i: number, sum: number) => ({ from: 0, to: i - 1, label: `total = ${sumOf(i)}${i > 1 ? ` = ${total(sum)}` : ''}` })
	let sum = nums[0]
	r.let('total', total(sum))
	r.step(
		`Beginning: total = nums[0] = ${total(sum)}, i = 1. The invariant, total = nums[0] + … + nums[i − 1], says total = nums[0]: it holds (total = 0 would say nothing about nums)`,
		{
			pointers: [ptr('i', 1)],
			lit: { 0: LOOK },
			band: band(1, sum),
			ask: 'Sum the array: where do total and i start, so that something about total is true from the beginning?',
			line: 'init',
		}
	)
	for (let i = 1; i < n; i++) {
		sum += nums[i]
		r.counts.additions++
		r.let('total', total(sum))
		r.step(`Middle: total += nums[${i}] = ${values[i]}, so total = ${total(sum)}; i = ${i + 1}. The invariant holds again: total = nums[0] + … + nums[${i}]`, {
			pointers: [ptr('i', i + 1)],
			lit: { [i]: LOOK },
			band: band(i + 1, sum),
			ask: `i = ${i}: what are total and i after this pass, and does the invariant still hold?`,
			askFocus: [i],
			line: 'add',
		})
	}
	r.step(`End: i = ${n} = nums.length, so the loop stops. The invariant with i = n says total = nums[0] + … + nums[${n - 1}] = ${total(sum)}: the whole array, the sum`, {
		pointers: [ptr('i', n)],
		band: band(n, sum),
		ask: false,
		line: 'done',
	})
	return { frames: r.frames, finalFlash: lit(0, n - 1, DONE), code: 'sum-invariant' }
}

function sumRecorder(start: ArrayState) {
	const r = recorder(start, { calls: 0, 'max depth': 0, additions: 0 })
	let depth = 0
	const n = start.values.length
	const outside = (lo: number, hi: number) => span(0, n - 1).filter((k) => Number(k) < lo || Number(k) > hi)
	return {
		r,
		value: (i: number) => Number(r.state.values[i]),
		/** Make the call sum(lo, hi): it goes on the stack. */
		enter() {
			r.counts.calls++
			depth++
			r.counts['max depth'] = Math.max(r.counts['max depth'], depth)
		},
		/** It returns: off the stack. */
		leave() {
			depth--
		},
		around: (lo: number, hi: number) => ({ dim: outside(lo, hi) }),
	}
}

/** sum(lo, hi) = sum(lo, hi - 1) + a[hi]: the last value plus the sum of the rest, one call per value. */
export function sumByRest(start: ArrayState): ArrayOperation {
	const s = sumRecorder(start)
	const { r } = s
	const sum = (hi: number): number => {
		const call = sumCall(0, hi)
		s.enter()
		if (hi === 0) {
			const v = s.value(0)
			r.step(`${call}: one value, so return a[0] = ${total(v)}`, {
				...s.around(0, 0),
				lit: { 0: LOOK },
				pointers: [ptr('lo', 0), ptr('hi', 0)],
				calls: [{ call }, { returns: total(v) }],
				ask: NEXT_CALL,
			})
			s.leave()
			return v
		}
		r.step(`${call}: more than one value, so ${sumCall(0, hi - 1)} + a[${hi}]`, {
			...s.around(0, hi),
			lit: lit(0, hi, LOOK),
			pointers: [ptr('lo', 0), ptr('hi', hi)],
			calls: [{ call }],
			ask: NEXT_CALL,
		})
		const rest = sum(hi - 1)
		const v = s.value(hi)
		r.counts.additions++
		const result = rest + v
		r.step(`${call} = ${sumCall(0, hi - 1)} + a[${hi}] = ${total(rest)} + ${total(v)} = ${total(result)}: return ${total(result)}`, {
			...s.around(0, hi),
			lit: lit(0, hi, DONE),
			pointers: [ptr('lo', 0), ptr('hi', hi)],
			calls: [{ returns: total(result) }],
			ask: `What does ${call} return?`,
			askFocus: span(0, hi),
		})
		s.leave()
		return result
	}
	const n = start.values.length
	const result = sum(n - 1)
	const { calls, additions } = r.counts
	r.step(`${sumCall(0, n - 1)} = ${total(result)}: ${plural(calls, 'call')}, all on the stack at once (one per value), and ${plural(additions, 'addition')}`, {
		lit: lit(0, n - 1, DONE),
		ask: false,
	})
	return { frames: r.frames }
}

/** sum(lo, hi) = sum(lo, mid) + sum(mid + 1, hi): divide and conquer, never more than log n calls deep. */
export function sumByHalves(start: ArrayState): ArrayOperation {
	const s = sumRecorder(start)
	const { r } = s
	const sum = (lo: number, hi: number): number => {
		const call = sumCall(lo, hi)
		s.enter()
		if (lo === hi) {
			const v = s.value(lo)
			r.step(`${call}: one value, so return a[${lo}] = ${total(v)}`, {
				...s.around(lo, hi),
				lit: { [lo]: LOOK },
				pointers: [ptr('lo', lo), ptr('hi', hi)],
				calls: [{ call }, { returns: total(v) }],
				ask: NEXT_CALL,
			})
			s.leave()
			return v
		}
		const mid = Math.floor((lo + hi) / 2)
		r.step(`${call}: mid = (${lo} + ${hi}) / 2 = ${mid}, so ${sumCall(lo, mid)} + ${sumCall(mid + 1, hi)}`, {
			...s.around(lo, hi),
			lit: lit(lo, hi, LOOK),
			pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)],
			calls: [{ call }],
			ask: NEXT_CALL,
		})
		const left = sum(lo, mid)
		const right = sum(mid + 1, hi)
		r.counts.additions++
		const result = left + right
		r.step(`${call} = ${sumCall(lo, mid)} + ${sumCall(mid + 1, hi)} = ${total(left)} + ${total(right)} = ${total(result)}: return ${total(result)}`, {
			...s.around(lo, hi),
			lit: lit(lo, hi, DONE),
			pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)],
			calls: [{ returns: total(result) }],
			ask: `What does ${call} return?`,
			askFocus: span(lo, hi),
		})
		s.leave()
		return result
	}
	const n = start.values.length
	const result = sum(0, n - 1)
	const { calls, additions } = r.counts
	r.step(
		`${sumCall(0, n - 1)} = ${total(result)}: ${plural(calls, 'call')}, but never more than ${r.counts['max depth']} on the stack at once, and ${plural(additions, 'addition')}`,
		{ lit: lit(0, n - 1, DONE), ask: false }
	)
	return { frames: r.frames }
}

// Inserting and deleting, shifting the values after the index: one copy per value, where a linked
// list re-points two arrows.

/** Delete a[k]: each later value is copied one cell left, then the last cell is dropped. */
export function deleteAt(start: ArrayState, k: number): ArrayOperation {
	const n = start.values.length
	const r = recorder(start, { moves: 0 })
	const v = start.values[k]
	r.let('k', k)
	r.step(
		k === n - 1
			? `Delete a[${k}] = ${v}, the last value: nothing has to move`
			: `Delete a[${k}] = ${v}: every value after it moves one cell left`,
		{ lit: { [k]: GONE }, pointers: [ptr('i', k)], ask: `Delete a[${k}]: what has to happen to the values after it?`, askFocus: [k], line: 'start' }
	)
	for (let i = k; i < n - 1; i++) {
		r.set(copied(r.state, i + 1, i))
		r.counts.moves++
		r.step(`a[${i}] = a[${i + 1}] (${r.state.values[i]})`, { pointers: [ptr('i', i)], moves: [[i + 1, i]], ask: 'Which value moves next, and where to?', line: 'shift' })
	}
	// The last step shows the result, so the array stays as it is once the operation is done.
	const result = withoutCell(start, k)
	r.set(result)
	const moved = r.counts.moves
	r.step(`The array shrinks by one cell (it grows and shrinks, like a Python list). ${moved} value${moved === 1 ? '' : 's'} moved`, {
		ask: 'Every value after it has moved: what now?',
		line: 'shrink',
	})
	return { frames: r.frames, result, code: 'array-delete' }
}

/**
 * Insert `value` at index k: a cell is added at the end, the values from k on are copied one cell
 * right starting from the end (so nothing is overwritten), then a[k] = value.
 */
export function insertAt(start: ArrayState, k: number, value: string): ArrayOperation {
	const n = start.values.length
	const r = recorder({ values: [...start.values, ''], marks: start.marks }, { moves: 0 })
	r.let('k', k)
	r.let('value', value)
	r.step(
		k === n
			? `Insert ${value} at the end: the array grows by one cell, and nothing has to move`
			: `Insert ${value} at index ${k}. First the array grows by one cell, to make room`,
		{ lit: { [n]: LOOK }, ask: `Insert ${value} at index ${k}: where does the room come from?`, line: 'grow' }
	)
	for (let i = n; i > k; i--) {
		r.set(copied(r.state, i - 1, i))
		r.counts.moves++
		const why = i === n ? ': from the end, so nothing is overwritten' : ''
		r.step(`a[${i}] = a[${i - 1}] (${r.state.values[i]})${why}`, {
			pointers: [ptr('i', i)],
			moves: [[i - 1, i]],
			// The first is the lesson: copying from the front would overwrite what hasn't moved yet.
			ask: i === n ? 'There is room at the end: which value moves first?' : 'Which value moves next, and where to?',
			line: 'shift',
		})
	}
	const result = withCell(start, k, value)
	r.set(result)
	const moved = r.counts.moves
	r.step(`a[${k}] = ${value}. ${moved} value${moved === 1 ? '' : 's'} moved to make room`, {
		lit: { [k]: DONE },
		pointers: [ptr('i', k)],
		ask: `Every value from index ${k} on has moved: what now?`,
		line: 'place',
	})
	return { frames: r.frames, result, finalFlash: { [k]: DONE }, code: 'array-insert' }
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

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

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
			line: 'full',
		})
		return { frames: r.frames, code: 'array-insert-fixed' }
	}
	r.let('k', k)
	r.let('value', value)
	r.step(`Insert ${value} at index ${k}: size ${used} < capacity ${capacity}, so a[${used}] is free`, { lit: { [used]: LOOK }, line: 'start' })
	for (let i = used; i > k; i--) {
		r.set(copied(r.state, i - 1, i))
		r.counts.moves++
		const why = i === used ? ': from the end, so nothing is overwritten' : ''
		r.step(`a[${i}] = a[${i - 1}] (${r.state.values[i]})${why}`, { pointers: [ptr('i', i)], moves: [[i - 1, i]], line: 'shift' })
	}
	const result = { ...withUsedCell(start, used, k, value), used: used + 1 }
	r.set(result)
	r.step(`a[${k}] = ${value}; size = ${used + 1}. ${plural(r.counts.moves, 'value')} moved`, { lit: { [k]: DONE }, pointers: [ptr('i', k)], line: 'place' })
	return { frames: r.frames, result, finalFlash: { [k]: DONE }, code: 'array-insert-fixed' }
}

/** Delete a[k] of a fixed array: the used values after it move left, then the last used slot is spare. */
export function deleteFixed(start: ArrayState, used: number, k: number): ArrayOperation {
	const r = recorder({ ...start, used }, { moves: 0 })
	r.let('k', k)
	r.step(`Delete a[${k}] = ${start.values[k]}: the values after it, up to a[size - 1], move one cell left`, {
		lit: { [k]: GONE },
		pointers: [ptr('i', k)],
		line: 'start',
	})
	for (let i = k; i < used - 1; i++) {
		r.set(copied(r.state, i + 1, i))
		r.counts.moves++
		r.step(`a[${i}] = a[${i + 1}] (${r.state.values[i]})`, { pointers: [ptr('i', i)], moves: [[i + 1, i]], line: 'shift' })
	}
	const result = { ...withoutUsedCell(start, k), used: used - 1 }
	r.set(result)
	r.step(`size = ${used - 1}: a[${used - 1}] is a spare slot again. ${plural(r.counts.moves, 'value')} moved`, { line: 'shrink' })
	return { frames: r.frames, result, code: 'array-delete-fixed' }
}

/**
 * Steps of growing a fixed array to `capacity` cells: newArr appears under it, the values in use
 * are copied down (one step each, or all in one), then a = newArr takes its place. A circular
 * buffer's values are copied in queue order, from its front, so the new array's front is index 0.
 */
function growSteps(r: Recorder, capacity: number, { oneByOne }: { oneByOne: boolean }) {
	const { values, used = values.length, front } = r.state
	const old = values.length
	const order = Array.from({ length: used }, (_, k) => ((front ?? 0) + k) % Math.max(1, old))
	const wraps = (front ?? 0) > 0
	const title = `newArr = new int[${capacity}]`
	const blank = Array<string>(capacity).fill('')
	const copied = (k: number) => [...order.slice(0, k).map((i) => values[i]), ...blank.slice(k)]
	r.set({ ...r.state, aux: { title, values: blank } })
	r.step(
		`${title}: a new array with room for ${capacity}. Arrays can't grow, so the values have to move` +
			(wraps ? ', in queue order from the front' : '')
	)
	if (oneByOne) {
		order.forEach((i, k) => {
			r.set({ ...r.state, aux: { title, values: copied(k + 1) } })
			r.counts.copies++
			const from = wraps ? `a[(front + ${k}) % ${old}] = a[${i}]` : `a[${i}]`
			r.step(`newArr[${k}] = ${from} (${values[i]})`, { pointers: [ptr('i', i)], lit: { [i]: LOOK }, moves: [[i, `aux:${k}`]] })
		})
	} else {
		r.set({ ...r.state, aux: { title, values: copied(used) } })
		r.counts.copies += used
		r.step(`Copy all ${plural(used, 'value')} into newArr`, { moves: order.map((i, k): [number, string] => [i, `aux:${k}`]) })
	}
	const marks: Marks = {}
	order.forEach((i, k) => {
		const mark = r.state.marks[String(i)]
		if (mark) marks[String(k)] = mark
	})
	r.set({ values: copied(used), marks, used, ...(front === undefined ? {} : { front: 0 }) })
	r.step(`a = newArr: capacity ${old} → ${capacity}${wraps ? ', front = 0' : ''}. The old array is garbage now`, {
		moves: order.map((_, k): [string, number] => [`aux:${k}`, k]),
	})
}

/** Grow a fixed array to twice its capacity, value by value. */
export function growFixed(start: ArrayState, used: number): ArrayOperation {
	const r = recorder({ ...start, used }, { copies: 0 })
	growSteps(r, Math.max(1, start.values.length * 2), { oneByOne: true })
	r.step(`Growing cost ${plural(r.counts.copies, 'copy', 'copies')}, one per value: doubling makes it rare`)
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

export type GrowthPolicy = 'double' | 'plus-one'

/**
 * Append `values` one after another to a fixed array, growing it whenever it is full: to twice the
 * capacity, or by one cell. Each grow copies every value (in one step); the counts show what that
 * costs: doubling stays under 2 copies per append (amortised O(1)), growing by one copies
 * everything every time (O(n) per append).
 */
export function appendMany(start: ArrayState, used: number, values: readonly string[], policy: GrowthPolicy): ArrayOperation {
	const r = recorder({ ...start, used }, { appends: 0, copies: 0 })
	const how = policy === 'double' ? 'doubling the capacity when full' : 'growing by one cell when full'
	// Lecture 7's aggregate method: each append's cost (1 for the write, plus any copies), in a row.
	const costs: string[] = []
	const strips = () => [{ title: 'cost of each append', items: [...costs] }]
	r.step(`Append ${plural(values.length, 'value')}, ${how}: size ${used}, capacity ${start.values.length}`, { strips: strips() })
	for (const value of values) {
		const size = r.state.used ?? used
		const capacity = r.state.values.length
		const before = r.counts.copies
		if (size >= capacity) {
			const next = policy === 'double' ? Math.max(1, capacity * 2) : capacity + 1
			r.step(`Append ${value}: full (size = capacity = ${capacity}), so grow to ${next} first`, { lit: { [capacity - 1]: GONE }, strips: strips() })
			growSteps(r, next, { oneByOne: false })
		}
		const after = [...r.state.values]
		after[size] = value
		r.set({ values: after, marks: r.state.marks, used: size + 1 })
		r.counts.appends++
		const copied = r.counts.copies - before
		costs.push(String(1 + copied))
		r.step(`Append ${value}: a[${size}] = ${value}; size = ${size + 1}. Cost ${1 + copied}${copied ? `: 1 for the write, ${copied} for the copies` : ''}`, {
			lit: { [size]: DONE },
			pointers: [ptr('size', size + 1)],
			strips: strips(),
		})
	}
	const { appends, copies } = r.counts
	const total = appends + copies
	const each = (total / Math.max(1, appends)).toFixed(1)
	const sum = `${appends} write${appends === 1 ? '' : 's'} + ${copies} cop${copies === 1 ? 'y' : 'ies'} = ${total}`
	r.step(
		policy === 'double'
			? `${plural(appends, 'append')} cost ${sum}, ${each} each: the copies (1 + 2 + 4 + …) add up to less than 2n, so n appends cost under 3n: amortised O(1)`
			: `${plural(appends, 'append')} cost ${sum}, ${each} each: growing by one copies everything every time, so each append costs O(n)`,
		{ strips: strips() }
	)
	return { frames: r.frames, result: r.state }
}

/**
 * Lecture 7's accounting method: every append pays 3 kr, 1 for its write and 2 saved on its cell (a
 * badge). When the array is full, doubling copies every value at 1 kr each, paid from what the
 * values added since the last doubling saved: exactly enough, so the bank (in the play bar) is
 * never in debt and each append costs at most 3: amortised O(1). Values already there are counted
 * as if added this way.
 */
export function appendAccounting(start: ArrayState, used: number, values: readonly string[]): ArrayOperation {
	const capacity0 = start.values.length
	// Saved so far, as if every value had been appended this way: 2 kr on each added since the last doubling.
	const since = Math.max(0, used - Math.floor(capacity0 / 2))
	const saved: Record<string, string> = Object.fromEntries(Array.from({ length: since }, (_, k) => [String(used - since + k), '2 kr']))
	const r = recorder({ ...start, used }, { appends: 0, copies: 0, 'bank (kr)': 2 * since })
	r.step(`Each append pays 3 kr: 1 for its write, 2 saved on its cell for later copies. Saved so far: ${2 * since} kr`, { badges: { ...saved } })
	for (const value of values) {
		const size = r.state.used ?? used
		const capacity = r.state.values.length
		if (size >= capacity) {
			const next = Math.max(1, capacity * 2)
			const bank = r.counts['bank (kr)']
			r.step(`Append ${value}: full, so double to ${next}: ${plural(size, 'copy', 'copies')} at 1 kr each, ${size} kr, and the bank holds ${bank} kr`, {
				lit: { [capacity - 1]: GONE },
			})
			growSteps(r, next, { oneByOne: false })
			// The copies are paid for: the credit on the cells is spent.
			r.counts['bank (kr)'] -= size
			const spent = Object.fromEntries(Object.keys(saved).map((k) => [k, '']))
			for (const k of Object.keys(saved)) delete saved[k]
			r.step(`The ${size} kr saved paid for the ${plural(size, 'copy', 'copies')}: bank ${bank} → ${r.counts['bank (kr)']} kr, never in debt`, {
				badges: spent,
			})
		}
		const after = [...r.state.values]
		after[size] = value
		r.set({ values: after, marks: r.state.marks, used: size + 1 })
		r.counts.appends++
		r.counts['bank (kr)'] += 2
		saved[String(size)] = '2 kr'
		r.step(`Append ${value}: pay 3 kr, 1 for a[${size}] = ${value}, 2 saved on its cell. Bank ${r.counts['bank (kr)']} kr`, {
			lit: { [size]: DONE },
			pointers: [ptr('size', size + 1)],
			badges: { [String(size)]: '2 kr' },
		})
	}
	const { appends, copies } = r.counts
	r.step(
		`${plural(appends, 'append')} paid ${3 * appends} kr for ${appends} writes and ${copies} copies, with ${r.counts['bank (kr)']} kr left: never in debt, so each append costs at most 3, amortised O(1)`,
		{ ask: false }
	)
	return { frames: r.frames, result: r.state }
}
