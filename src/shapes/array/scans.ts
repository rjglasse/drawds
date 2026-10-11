import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import { lit, ptr, recorder, span, type ArrayOperation, type ArrayState } from './operations'
import { countSort, ranks } from './sort-counts'

// The scans lectures 2 and 3 analyse by counting their basic operation (Levitin's MaxElement,
// UniqueElements and SequentialSearch2): one pass for the largest value, every pair for "all
// unique?" (and lecture 3's faster ways: a set, or sorting first), and a search that puts the key
// past the end so its loop needs no bounds check.

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
 * Lecture 3's first faster way: every value goes into a set, and a repeat adds nothing, so one
 * comparison at the end, the set's size against the array's length, answers it. n adds (each O(1)
 * on average: hashing, lecture 7) and a set as big as the array: time traded for space. As the
 * lecture writes it, it adds every value even after a repeat; add's answer (false: there already)
 * could stop at the first one.
 */
export function allUniqueBySet(start: ArrayState): ArrayOperation {
	const { values } = start
	const n = values.length
	const r = recorder(start, { adds: 0, comparisons: 0 })
	const seen: string[] = []
	const repeats: number[] = []
	const set = (marks?: Record<number, MarkColor>) => [{ title: 'seen', items: [...seen], ...(marks ? { marks } : {}) }]
	r.counting('init', 'loop', 'add', 'compare')
	r.ran('init')
	r.step('seen = an empty set: a value is in it once, however often it is added', {
		strips: set(),
		ask: 'All unique? Every value goes into a set: what will its size tell us?',
		line: 'init',
	})
	for (let i = 0; i < n; i++) {
		const v = values[i]
		r.counts.adds++
		r.ran('loop', 'add')
		r.let('x', v)
		const at = seen.findIndex((s) => compareKeys(s, v) === 0)
		const step = { pointers: [ptr('i', i)], ask: `seen.add(${v}): does the set grow?`, askFocus: [i], line: 'add' }
		if (at >= 0) {
			repeats.push(i)
			r.step(`seen.add(a[${i}] = ${v}): ${v} is in the set already, so it stays at ${seen.length}`, {
				...step,
				lit: { [i]: GONE },
				strips: set({ [at]: GONE }),
			})
		} else {
			seen.push(v)
			r.step(`seen.add(a[${i}] = ${v}): new, the set has ${seen.length}`, { ...step, lit: { [i]: LOOK }, strips: set({ [seen.length - 1]: LOOK }) })
		}
	}
	r.let('x', undefined)
	r.counts.comparisons++
	r.ran('loop', 'compare')
	const cost = `${times(n, 'add')} and 1 comparison`
	const unique = seen.length === n
	const flash = unique ? lit(0, n - 1, DONE) : Object.fromEntries(repeats.map((i) => [i, GONE]))
	r.step(
		unique
			? `seen.size() = ${n} == a.length = ${n}: all unique, return true. ${cost}: linear, but the set takes as much room again as the array (time traded for space)`
			: `seen.size() = ${seen.length} ≠ a.length = ${n}: not all unique, return false. ${cost}, every value added even after the repeat: add's answer (false: already there) could stop at the first one`,
		{ lit: flash, strips: set(), ask: false, line: 'compare' }
	)
	return { frames: r.frames, finalFlash: flash, code: 'all-unique-set' }
}

/**
 * Lecture 3's second faster way: sort a copy (sorting reorders, and a is the caller's), and equal
 * values end up side by side, so each value need only be compared with the one before it: about
 * n log n to sort (merge sort's comparisons on these values stand for it), then at most n - 1, the
 * first repeat stopping it. The copy is the second row under the array. For a few values every
 * pair is cheaper; as n grows n log n + n wins by far.
 */
export function allUniqueBySorting(start: ArrayState): ArrayOperation {
	const { values } = start
	const n = values.length
	const pairs = (n * (n - 1)) / 2
	const order = [...values.keys()].sort((x, y) => compareKeys(values[x], values[y]) || x - y)
	const sorted = order.map((k) => values[k])
	const sorting = countSort('merge-sort', ranks(values)).comparisons
	const r = recorder(start, { 'sorting comparisons': 0, 'neighbour comparisons': 0 })
	const b = (row: string[], marks?: Record<number, MarkColor>) => ({ ...r.state, aux: { title: 'b', values: row, ...(marks ? { marks } : {}) } })
	r.counting('copy', 'sort', 'loop', 'compare', 'repeat', 'unique')
	r.ran('copy')
	r.set(b([...values]))
	r.step('b = a copy of a: sorting reorders values, so a stays as it was', {
		moves: values.map((_, k): [number, string] => [k, `aux:${k}`]),
		ask: 'All unique? Sort first: why sort a copy, not a itself?',
		line: 'copy',
	})
	r.ran('sort')
	r.counts['sorting comparisons'] = sorting
	r.set(b(sorted))
	r.step(`Sort b: equal values end up side by side. About n log n comparisons (merge sort makes ${sorting} on these)`, {
		moves: order.map((from, k): [string, string] => [`aux:${from}`, `aux:${k}`]),
		ask: 'Sort b: where do equal values end up?',
		line: 'sort',
	})
	const total = () => `${sorting} comparisons sorting + ${r.counts['neighbour comparisons']} after`
	for (let i = 1; i < n; i++) {
		r.counts['neighbour comparisons']++
		r.ran('loop', 'compare')
		r.let('i', i)
		const ask = `b[${i - 1}] = ${sorted[i - 1]} vs b[${i}] = ${sorted[i]}: the same?`
		if (compareKeys(sorted[i - 1], sorted[i]) === 0) {
			r.ran('repeat')
			r.set(b(sorted, { [i - 1]: GONE, [i]: GONE }))
			r.step(`b[${i - 1}] = b[${i}] = ${sorted[i]}: neighbours, so not all unique, return false after ${total()}`, {
				lit: { [order[i - 1]]: GONE, [order[i]]: GONE },
				ask,
				line: 'repeat',
			})
			return { frames: r.frames, finalFlash: { [order[i - 1]]: GONE, [order[i]]: GONE }, code: 'all-unique-sorted' }
		}
		r.set(b(sorted, { [i - 1]: HELD, [i]: LOOK }))
		r.step(`b[${i - 1}] = ${sorted[i - 1]} ≠ b[${i}] = ${sorted[i]}`, { ask, line: 'compare' })
	}
	r.ran('loop', 'unique')
	r.let('i', undefined)
	r.set(b(sorted, Object.fromEntries(sorted.map((_, k) => [k, DONE]))))
	const spent = sorting + n - 1
	r.step(
		`No two neighbours are equal: all unique, return true after ${total()} = ${spent}, against every pair's n(n - 1)/2 = ${pairs}. ` +
			(spent > pairs ? `For ${n} values every pair is cheaper, but` : 'Already fewer, and') +
			' n log n + n grows far slower: at n = 1000 about 11 000 against 499 500',
		{ lit: lit(0, n - 1, DONE), ask: false, line: 'unique' }
	)
	return { frames: r.frames, finalFlash: lit(0, n - 1, DONE), code: 'all-unique-sorted' }
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
	r.counting('n', 'sentinel', 'init', 'compare', 'next', 'restore', 'check', 'found', 'missing')
	r.ran('n', 'sentinel')
	const withSentinel = { ...r.state, values: [...values, target] }
	r.set(withSentinel)
	r.step(`a[${n}] = ${target}: the key goes one past the end as a sentinel, so the search is sure to stop`, {
		lit: { [n]: HELD },
		ask: `Search for ${target} without checking i < n: how can the loop be sure to stop?`,
		line: 'sentinel',
	})
	let i = 0
	r.ran('init')
	for (;;) {
		r.counts.comparisons++
		r.ran('compare')
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
		r.ran('next')
		r.step(`i = ${i}: a[${i}] = ${values[i]} ≠ ${target}: i = ${i + 1}, no i < n check needed`, { ...step, lit: { [i]: LOOK, [n]: HELD }, line: 'compare' })
		i++
	}
	r.set(start)
	const saved = r.counts['i < n checks saved']
	const found = i < n
	r.ran('restore', 'check', found ? 'found' : 'missing')
	r.step(
		found
			? `i = ${i} < n = ${n}: found ${target} at index ${i}. The sentinel comes out again; ${times(saved, 'i < n check')} saved`
			: `i = n = ${n}: only the sentinel matched, so ${target} is not in the array. It comes out again; ${times(saved, 'i < n check')} saved`,
		{ pointers: [ptr('i', i)], lit: found ? { [i]: DONE } : {}, ask: false, line: found ? 'found' : 'missing' }
	)
	return { frames: r.frames, finalFlash: found ? { [i]: DONE } : undefined, code: 'sentinel-search' }
}
