import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import { lit, ptr, recorder, span, type ArrayOperation, type ArrayState } from './operations'

// The scans lectures 2 and 3 analyse by counting their basic operation (Levitin's MaxElement,
// UniqueElements and SequentialSearch2): one pass for the largest value, every pair for "all
// unique?", and a search that puts the key past the end so its loop needs no bounds check.

const LOOK: MarkColor = 'orange'
const DONE: MarkColor = 'green'
const GONE: MarkColor = 'red'
const HELD: MarkColor = 'blue'

const times = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * MaxElement: maxval starts as a[0], then i walks the rest, each value compared with it once: n - 1
 * comparisons whatever the order (the number of updates is what varies). maxval sits in a strip
 * under the array, the cell it came from lit blue.
 */
export function findMax(start: ArrayState): ArrayOperation {
	const { values } = start
	const n = values.length
	const r = recorder(start, { comparisons: 0, updates: 0 })
	const held = (at: number) => [{ title: 'maxval', items: [values[at]] }]
	let at = 0
	r.let('maxval', values[0])
	r.counting('init', 'loop', 'compare', 'update', 'done')
	r.ran('init')
	r.step(`maxval = a[0] = ${values[0]}: the largest so far`, {
		lit: { 0: HELD },
		pointers: [ptr('i', 0)],
		strips: held(0),
		ask: 'Find the largest value: where does maxval start?',
		line: 'init',
	})
	for (let i = 1; i < n; i++) {
		r.counts.comparisons++
		r.ran('loop', 'compare')
		const step = { pointers: [ptr('i', i)], strips: held(at), ask: `a[${i}] = ${values[i]} vs maxval = ${values[at]}: a new largest?`, askFocus: [i] }
		if (compareKeys(values[i], values[at]) > 0) {
			r.counts.updates++
			r.ran('update')
			r.let('maxval', values[i])
			r.step(`i = ${i}: a[${i}] = ${values[i]} > maxval = ${values[at]}, so maxval = ${values[i]}`, {
				...step,
				lit: { [at]: LOOK, [i]: HELD },
				strips: held(i),
				line: 'update',
			})
			at = i
		} else {
			r.step(`i = ${i}: a[${i}] = ${values[i]} ≤ maxval = ${values[at]}: no change`, { ...step, lit: { [at]: HELD, [i]: LOOK }, line: 'compare' })
		}
	}
	r.ran('loop', 'done')
	r.step(`The largest is ${values[at]} (index ${at}): ${times(n - 1, 'comparison')}, n - 1 for any order of ${n} values`, {
		lit: { [at]: DONE },
		strips: held(at),
		ask: false,
		line: 'done',
	})
	return { frames: r.frames, finalFlash: { [at]: DONE }, code: 'find-max' }
}

/**
 * UniqueElements: every pair a[i], a[j] with i < j compared once, until two are equal. All unique
 * is the worst case: n(n - 1)/2 comparisons. The values a[i] has been checked against fade as i
 * moves on.
 */
export function allUnique(start: ArrayState): ArrayOperation {
	const { values } = start
	const n = values.length
	const pairs = (n * (n - 1)) / 2
	const r = recorder(start, { comparisons: 0 })
	r.counting('n', 'outer', 'inner', 'compare', 'repeat', 'unique')
	r.ran('n')
	for (let i = 0; i < n - 1; i++) {
		r.ran('outer')
		for (let j = i + 1; j < n; j++) {
			r.counts.comparisons++
			r.ran('inner', 'compare')
			const step = { pointers: [ptr('i', i), ptr('j', j)], dim: span(0, i - 1), ask: `a[${i}] = ${values[i]} vs a[${j}] = ${values[j]}: the same?`, askFocus: [i, j] }
			if (compareKeys(values[i], values[j]) === 0) {
				r.ran('repeat')
				r.step(`a[${i}] = a[${j}] = ${values[i]}: not all unique, return false after ${times(r.counts.comparisons, 'comparison')}`, {
					...step,
					lit: { [i]: GONE, [j]: GONE },
					line: 'repeat',
				})
				return { frames: r.frames, finalFlash: { [i]: GONE, [j]: GONE }, code: 'all-unique' }
			}
			r.step(`a[${i}] = ${values[i]} ≠ a[${j}] = ${values[j]}`, { ...step, lit: { [i]: HELD, [j]: LOOK }, line: 'compare' })
		}
		// j has run out: the inner loop's last test.
		r.ran('inner')
	}
	r.ran('outer', 'unique')
	r.step(`No two are equal: all unique, return true after ${times(pairs, 'comparison')}, every pair: n(n - 1)/2 = ${n}·${n - 1}/2, the worst case`, {
		lit: lit(0, n - 1, DONE),
		ask: false,
		line: 'unique',
	})
	return { frames: r.frames, finalFlash: lit(0, n - 1, DONE), code: 'all-unique' }
}

/**
 * SequentialSearch2: the key goes into a[n], one past the end, so the loop only asks a[i] ≠ K and
 * needs no i < n check: it is sure to stop. After it, i < n means found; i = n means it only found
 * the sentinel. The sentinel is taken out again. The counts show the i < n checks it saved.
 */
export function sentinelSearch(start: ArrayState, target: string): ArrayOperation {
	const { values } = start
	const n = values.length
	const r = recorder(start, { comparisons: 0, 'i < n checks saved': 0 })
	r.let('key', target)
	r.let('n', n)
	const withSentinel = { ...r.state, values: [...values, target] }
	r.set(withSentinel)
	r.step(`a[${n}] = ${target}: the key goes one past the end as a sentinel, so the search is sure to stop`, {
		lit: { [n]: HELD },
		ask: `Search for ${target} without checking i < n: how can the loop be sure to stop?`,
		line: 'sentinel',
	})
	let i = 0
	for (;;) {
		r.counts.comparisons++
		const step = { pointers: [ptr('i', i)], dim: span(0, i - 1), ask: `i = ${i}: a[${i}] = ${withSentinel.values[i]} vs ${target}: stop or go on?`, askFocus: [i] }
		if (compareKeys(withSentinel.values[i], target) === 0) {
			r.step(`i = ${i}: a[${i}] = ${target}, so the loop stops`, {
				...step,
				lit: { [i]: i < n ? DONE : HELD, ...(i < n ? { [n]: HELD } : {}) },
				line: 'compare',
			})
			break
		}
		r.counts['i < n checks saved']++
		r.step(`i = ${i}: a[${i}] = ${values[i]} ≠ ${target}: i = ${i + 1}, no i < n check needed`, { ...step, lit: { [i]: LOOK, [n]: HELD }, line: 'compare' })
		i++
	}
	r.set(start)
	const saved = r.counts['i < n checks saved']
	const found = i < n
	r.step(
		found
			? `i = ${i} < n = ${n}: found ${target} at index ${i}. The sentinel comes out again; ${times(saved, 'i < n check')} saved`
			: `i = n = ${n}: only the sentinel matched, so ${target} is not in the array. It comes out again; ${times(saved, 'i < n check')} saved`,
		{ pointers: [ptr('i', i)], lit: found ? { [i]: DONE } : {}, ask: false, line: found ? 'found' : 'missing' }
	)
	return { frames: r.frames, finalFlash: found ? { [i]: DONE } : undefined, code: 'sentinel-search' }
}
