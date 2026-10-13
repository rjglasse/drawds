
import { LOOK, DONE, type ArrayState, type ArrayOperation, ptr, span, lit, recorder, NEXT_CALL, plural } from './record'

// Sums, with a loop and recursively, step by step (see operations.ts for what an operation is).

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
