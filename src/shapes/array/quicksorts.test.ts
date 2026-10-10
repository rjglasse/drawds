import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../data/random'
import type { Frame } from '../../nodelink/playback'
import { callDepth, callRun } from '../recursion/calls'
import type { ArrayOperation, ArrayState } from './operations'
import { parseCutoff, partition3Array, quicksort } from './quicksorts'

// Lecture 10's quicksort improvements, step by step.

const array = (...values: (string | number)[]): ArrayState => ({ values: values.map(String), marks: {} })
const valuesOf = (f: Frame) => (f.props as { values: string[] }).values
const last = (op: ArrayOperation) => op.frames[op.frames.length - 1]
const sortedCopy = (values: string[]) => [...values].sort((a, b) => Number(a) - Number(b))

/** Every swap a frame shows matches the values of the frame before it. */
function expectConsistent(op: ArrayOperation, start: string[]) {
	let before = start
	for (const frame of op.frames) {
		const now = valuesOf(frame)
		for (const [a, b] of frame.swaps ?? []) {
			expect(now[Number(a)]).toBe(before[Number(b)])
			expect(now[Number(b)]).toBe(before[Number(a)])
		}
		before = now
	}
}

describe('quicksort and its improvements', () => {
	const inputs = [array(2, 8, 7, 1, 3, 5, 6, 4), array(1, 2, 3, 4, 5, 6, 7), array(2, 0, 1, 2, 2, 0, 1, 2, 0), array(3, 3, 3, 3), array(5), array(9, 4)]

	it('every variant sorts, showing its swaps as they happen', () => {
		for (const start of inputs) {
			const runs = [
				quicksort(start),
				quicksort(start, 'quicksort-random', { rng: mulberry32(4) }),
				quicksort(start, 'quicksort-median'),
				quicksort(start, 'quicksort-3way'),
				quicksort(start, 'quicksort-cutoff', { cutoff: 3 }),
			]
			for (const op of runs) {
				expect(op.result?.values, `${op.code} on ${start.values.join(' ')}`).toEqual(sortedCopy(start.values))
				expectConsistent(op, start.values)
				expect(last(op).strips).toEqual([{ title: 'call stack', items: [] }])
				// Every call the recursion tree shows returns.
				expect(callRun(op.frames).calls.every((c) => c.result !== undefined)).toBe(true)
			}
		}
	})

	it('a random pivot is picked from lo..hi and swapped to the end; on sorted input the stack stays shallow', () => {
		const sorted = array(...Array.from({ length: 12 }, (_, i) => i + 1))
		const op = quicksort(sorted, 'quicksort-random', { rng: mulberry32(11) })
		const pick = op.frames.find((f) => f.line === 'pick')!
		expect(pick.caption).toMatch(/^quicksort\(0, 11\): a random index from 0 to 11: k = \d+, so the pivot is \d+/)
		expect(pick.pointers?.[0].name).toBe('k')
		expect(last(op).counts!['max depth']).toBeLessThan(12)
		expect(last(op).caption).toContain('Plain quicksort (the last value as pivot) on the same input: 66 comparisons, 23 calls, 12 levels')
		// The same seed, the same run.
		expect(quicksort(sorted, 'quicksort-random', { rng: mulberry32(11) }).frames.map((f) => f.caption)).toEqual(op.frames.map((f) => f.caption))
	})

	it('the median of three is a value of the array (not an average), moved to the end as the pivot', () => {
		const op = quicksort(array(7, 1, 9, 2, 4), 'quicksort-median')
		const median = op.frames.find((f) => f.line === 'median')!
		expect(median.caption).toBe('quicksort(0, 4): of a[0] = 7, a[2] = 9 and a[4] = 4, the median (the middle one) is 7')
		expect(median.ask).toBe('quicksort(0, 4): of a[0], a[2] and a[4], which is the median?')
		expect(median.askFocus).toEqual(['0', '2', '4'])
		expect(median.vars?.m).toBe('0')
		const toEnd = op.frames[op.frames.indexOf(median) + 1]
		expect(toEnd.caption).toBe('swap(a[0], a[4]): the median 7 goes to the end, as the pivot')
		expect(toEnd.line).toBe('tohi')
		// Sorted input: halves every time, about log₂ n levels where plain quicksort goes n deep.
		const sorted = quicksort(array(...Array.from({ length: 15 }, (_, i) => i + 1)), 'quicksort-median')
		expect(callDepth(callRun(sorted.frames).calls)).toBe(4)
		expect(last(sorted).caption).toContain('15 levels')
		// Two values are too few to sample three.
		expect(quicksort(array(9, 4), 'quicksort-median').frames[0].caption).toBe('quicksort(0, 1): partition a[0..1]: two values, too few for three samples')
	})

	it('three ways: lt, i and gt; equal values gather in the middle, placed at once and never sorted again', () => {
		const op = partition3Array(array(2, 0, 2, 1, 2, 0, 1))
		expect(op.code).toBe('partition-3way')
		expect(op.frames[0].pointers?.map((p) => [p.name, p.at])).toEqual([
			['lt', '0'],
			['i', '0'],
			['gt', '6'],
		])
		expect(op.result?.values).toEqual(['0', '0', '1', '1', '2', '2', '2'])
		expect(op.finalFlash).toEqual({ 2: 'green', 3: 'green' })
		expect(last(op).caption).toBe('i > gt: partitioned. a[0..1] < 1; a[2..3] = 1, all in their final places, never to be sorted again; a[4..6] > 1')
		const lines = new Set(op.frames.map((f) => f.line))
		for (const line of ['pivot', 'less', 'less-swap', 'more', 'more-swap', 'equal', 'split']) expect(lines).toContain(line)
		// Predict mode: the same question whatever the answer.
		expect(op.frames.filter((f) => /^a\[\d\] = \d [<>=] 1: /.test(f.caption ?? '')).every((f) => /: smaller, equal or larger\?$/.test(String(f.ask)))).toBe(true)
	})

	it('all equal: one three-way partition places them all, where the other pivots go n deep', () => {
		const equal = array(5, 5, 5, 5, 5, 5)
		const three = quicksort(equal, 'quicksort-3way')
		expect(last(three).counts).toEqual({ comparisons: 12, swaps: 0, calls: 3, 'max depth': 2 })
		expect(last(three).caption).toContain('Plain quicksort (the last value as pivot) on the same input: 15 comparisons, 11 calls, 6 levels')
		for (const variant of ['quicksort', 'quicksort-median'] as const) {
			const op = quicksort(equal, variant)
			expect(last(op).counts!['max depth']).toBeGreaterThanOrEqual(5)
			expect(last(op).caption).toContain('Many equal values: no choice of pivot splits them, but a three-way partition places them all at once.')
		}
		expect(last(three).caption).not.toContain('Many equal values')
	})

	it('a cut-off: short sub-arrays are insertion sorted, with fewer calls than plain quicksort makes', () => {
		const start = array(2, 8, 7, 1, 3, 5, 6, 4)
		const op = quicksort(start, 'quicksort-cutoff', { cutoff: 3 })
		expect(op.frames[0].vars?.CUTOFF).toBe('3')
		const small = op.frames.find((f) => f.caption === 'quicksort(0, 2): 3 values, at most the cut-off 3: insertion sort finishes them, with no more calls')
		expect(small?.line).toBe('small')
		expect(op.frames.some((f) => f.line === 'is-compare') && op.frames.some((f) => f.line === 'is-swap')).toBe(true)
		const plain = quicksort(start)
		expect(last(op).counts!.calls).toBeLessThan(last(plain).counts!.calls)
		expect(last(op).caption).toContain(`on the same input: ${last(plain).counts!.comparisons} comparisons, ${last(plain).counts!.calls} calls`)
		expect([parseCutoff('5'), parseCutoff(' 2 '), parseCutoff('x'), parseCutoff('0'), parseCutoff(undefined)]).toEqual([5, 2, 3, 3, 3])
	})

	it('plain quicksort counts its calls and how deep they go', () => {
		const op = quicksort(array(2, 8, 7, 1, 3, 5, 6, 4))
		expect(Object.keys(last(op).counts!)).toEqual(['comparisons', 'swaps', 'calls', 'max depth'])
		expect(last(op).caption).toMatch(/^Every call has returned: sorted, with \d+ comparisons, \d+ swaps and \d+ calls\. /)
		expect(last(op).caption).not.toContain('Plain quicksort')
	})
})
