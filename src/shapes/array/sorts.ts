import type { Marks } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { CallEvent } from '../../nodelink/playback'

import { LOOK, DONE, PIVOT, SMALL, type ArrayState, type ArrayOperation, ptr, span, lit, type Step, recorder, swapped, type Recorder, type Around, NEXT_CALL } from './record'

// Array sorts and partitions, step by step (see operations.ts for what an operation is).

// Sorting. Counts of comparisons and swaps run in the play bar, so a class can compare algorithms.

export function sortCounts() {
	return { comparisons: 0, swaps: 0 }
}

/** The last step, the array sorted; `end`: the loop test that ends it (its line, with i where it fails). */
function sorted(r: ReturnType<typeof recorder>, n: number, code: string, end: Pick<Step, 'line' | 'pointers'> = {}): ArrayOperation {
	const { comparisons, swaps } = r.counts
	r.step(`Sorted: ${comparisons} comparisons, ${swaps} swaps`, { lit: lit(0, n - 1, DONE), ask: false, ...end })
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
			// The for loop's last test, i < n with i = n, is what ends it.
			{ lit: lit(0, n - 1, DONE), ask: false, line: 'outer', pointers: [ptr('i', n)] }
		)
		return { frames: r.frames, result: r.state, code: 'insertion-sort' }
	}
	return sorted(r, n, 'insertion-sort', { line: 'outer', pointers: [ptr('i', n)] })
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

/** The lines of Lomuto's partition, counted when an operation counts them (see `recorder`'s `ran`). */
export const PARTITION_LINES = ['pivot', 'init', 'loop', 'compare', 'grow', 'swap', 'place', 'result']

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
	r.ran('pivot', 'init')
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
		r.ran('loop', 'compare')
		if (compareKeys(x, p) >= 0) {
			r.step(`a[${j}] = ${x} ≥ ${p}: it stays on the right`, { ...around, lit: shown({ [j]: LOOK }), pointers: at(j), ...side })
			continue
		}
		r.step(`a[${j}] = ${x} < ${p}: it belongs with the smaller values`, { ...around, lit: shown({ [j]: LOOK }), pointers: at(j), ...side })
		// Where i says the smaller values end: the same question whether or not a swap is needed.
		const where = { ask: `${x} belongs with the smaller values: what happens to i, and where does ${x} go?`, askFocus: [j], line: 'swap' }
		i++
		// The code swaps a[i] with itself when i reaches j: the line runs, nothing moves.
		r.ran('grow', 'swap')
		if (i === j) {
			r.step(`i = ${i}, which is j: a[${j}] is in place already`, { ...around, lit: shown(), pointers: at(j), ...where })
			continue
		}
		r.set(swapped(r.state, i, j))
		r.counts.swaps++
		r.step(`i = ${i}; swap(a[${i}], a[${j}])`, { ...around, lit: shown(), pointers: at(j), swaps: [[i, j]], ...where })
	}
	const to = i + 1
	r.ran('loop', 'place', 'result')
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
	r.counting(...PARTITION_LINES)
	const settled: Marks = {}
	const p = partition(r, 0, n - 1, settled, {})
	return { frames: r.frames, result: r.state, finalFlash: { [p]: DONE }, code: 'partition' }
}


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
	// Python writes each do-while as a step, then a while that steps again: its lines count apart.
	r.counting('pivot', 'init', 'round', 'step-i', 'left', 'more-i', 'step-j', 'right', 'more-j', 'crossed', 'done', 'swap')
	r.ran('pivot', 'init')
	r.step(`pivot = a[0] = ${p}. i starts before the array, j after it`, { lit: shown(), pointers: at(), ask: false, line: 'pivot' })
	for (;;) {
		r.ran('round')
		let first = true
		do {
			i++
			r.ran(first ? 'step-i' : 'more-i', 'left')
			first = false
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
		first = true
		do {
			j--
			r.ran(first ? 'step-j' : 'more-j', 'right')
			first = false
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
		r.ran('crossed')
		if (i >= j) {
			r.ran('done')
			break
		}
		r.ran('swap')
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
	r.counting(
		...['base', 'leaf', 'split', 'sort-left', 'sort-right', 'merge', 'alloc', 'start', 'loop', 'compare', 'left', 'next-i', 'right', 'next-j'],
		...['rest-left-loop', 'rest-left', 'rest-next-i', 'rest-right-loop', 'rest-right', 'rest-next-j', 'copy-loop', 'copy']
	)
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
		r.ran('base')
		if (lo === hi) {
			r.ran('leaf')
			r.step(`mergeSort(${lo}, ${hi}): one value, a[${lo}], is sorted`, {
				dim: outside(lo, hi),
				strips: strips(),
				lit: { [lo]: DONE },
				ask: NEXT_CALL,
				line: 'leaf',
				calls: tree.events(made, tree.returns(lo, hi)),
			})
			calls.pop()
			return
		}
		const mid = Math.floor((lo + hi) / 2)
		call(lo, hi, mid)
		r.ran('split')
		r.step(`mergeSort(${lo}, ${hi}): sort a[${lo}..${mid}] and a[${mid + 1}..${hi}], then merge them`, {
			dim: outside(lo, hi),
			strips: strips(),
			ask: NEXT_CALL,
			line: 'split',
			calls: tree.events(made),
		})
		r.ran('sort-left')
		sort(lo, mid)
		r.ran('sort-right')
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
		r.ran('merge', 'alloc', 'start')
		r.step(`Merge a[${lo}..${mid}] (blue) and a[${mid + 1}..${hi}] (green), both sorted`, {
			dim: outside(lo, hi),
			strips: strips(),
			lit: halves,
			pointers: [ptr('i', i), ptr('j', j)],
			ask: `Both halves of a[${lo}..${hi}] are sorted: what now?`,
			line: 'merge',
		})
		// The code's three loops, in turn: both halves, then what is left of the left one, then of the right one.
		let loop: 'both' | 'rest-left' | 'rest-right' = 'both'
		while (i <= mid || j <= hi) {
			// Which half the next value comes from (i and j can be equal once the left half is used up).
			let left: boolean
			let why: string
			let line: string
			if (i <= mid && j <= hi) {
				r.counts.comparisons++
				left = compareKeys(values[i], values[j]) <= 0
				why = left
					? `a[${i}] = ${values[i]} ≤ a[${j}] = ${values[j]}: take ${values[i]}`
					: `a[${j}] = ${values[j]} < a[${i}] = ${values[i]}: take ${values[j]}`
				line = left ? 'left' : 'right'
				r.ran('loop', 'compare', line, left ? 'next-i' : 'next-j')
			} else {
				// A loop's last test, as the next one starts: both halves' when one is used up, the left
				// one's (maybe its only one) before the right one's.
				if (loop === 'both') {
					r.ran('loop')
					loop = 'rest-left'
				}
				if (loop === 'rest-left' && i > mid) {
					r.ran('rest-left-loop')
					loop = 'rest-right'
				}
				left = loop === 'rest-left'
				why = left ? `The right half is used up: take a[${i}] = ${values[i]}` : `The left half is used up: take a[${j}] = ${values[j]}`
				line = loop
				r.ran(`${loop}-loop`, loop, left ? 'rest-next-i' : 'rest-next-j')
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
		// The rest loops' last tests (the left one's, unless it ended already), then the copy loop.
		if (loop === 'rest-left') r.ran('rest-left-loop')
		r.ran('rest-right-loop')
		for (let k = 0; k < merged.length; k++) r.ran('copy-loop', 'copy')
		r.ran('copy-loop')
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
	r.let('lo', undefined)
	r.let('hi', undefined)
	r.let('mid', undefined)
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
