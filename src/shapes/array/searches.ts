import { compareKeys } from '../../data/compare'
import type { CallEvent } from '../../nodelink/playback'

import { LOOK, DONE, GONE, type ArrayState, type ArrayOperation, ptr, span, recorder } from './record'

// Array searches, step by step (see operations.ts for what an operation is).

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
	r.counting('init', 'loop', 'mid', 'compare', 'found', 'less', 'right', 'left', 'missing')
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
	r.ran('init')
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
		r.ran('loop', 'mid')
		r.step(`mid = (${lo} + ${hi}) / 2 = ${mid}. Is a[${mid}] = ${v} equal to ${target}?`, {
			...at,
			lit: { [mid]: LOOK },
			ask: `lo = ${lo}, hi = ${hi}: which index is mid?`,
			line: 'mid',
		})
		const c = compareKeys(v, target)
		// The same question whatever the answer: found, or which half is left.
		const half = { ask: `a[${mid}] = ${v} vs ${target}: found it, or which half is left?`, askFocus: [mid] }
		r.ran('compare')
		if (c === 0) {
			r.ran('found')
			r.step(`Yes: found ${target} at index ${mid}, after ${r.counts.comparisons} comparison${r.counts.comparisons === 1 ? '' : 's'}`, {
				...at,
				lit: { [mid]: DONE },
				...half,
				line: 'found',
			})
			return { frames: r.frames, finalFlash: { [mid]: DONE }, code: 'binary-search' }
		}
		r.ran('less', c < 0 ? 'right' : 'left')
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
	r.ran('loop', 'missing')
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
	r.counting('base', 'missing', 'mid', 'compare', 'found', 'less', 'right', 'left')
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
		r.ran('base')
		if (low > high) {
			r.ran('missing')
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
		r.ran('mid')
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
		r.ran('compare')
		if (c === 0) {
			r.ran('found')
			r.step(`a[${mid}] = ${target}: found, so return ${mid}`, { ...around, pointers: at, lit: { [mid]: DONE }, calls: [{ returns: String(mid) }], ...half, line: 'found' })
			stack.pop()
			return mid
		}
		const [next, line] = c < 0 ? [`binarySearch(${mid + 1}, ${high})`, 'right'] : [`binarySearch(${low}, ${mid - 1})`, 'left']
		r.ran('less', line)
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
