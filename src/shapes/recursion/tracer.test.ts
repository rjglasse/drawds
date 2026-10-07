import { describe, expect, it } from 'vitest'
import { branches, callRun, repeatedCalls } from './calls'
import { STACK_ROOM, parseCall, traceCall, traceOf, type Traced } from './tracer'
import { tracerLayout } from './tracer-layout'

const stacks = (fn: Traced, args: number[]) => traceCall(fn, args).frames.map((f) => traceOf(f)!.stack.map((s) => `${s.call}: ${s.work}`))

describe('typed calls', () => {
	it('reads a known function and its arguments; a name picks the function', () => {
		expect(parseCall('gcd(60, 24)')).toEqual({ fn: 'gcd', args: [60, 24] })
		expect(parseCall(' factorial( 5 ) ')).toEqual({ fn: 'fact', args: [5] })
		expect(parseCall('sayHello()')).toEqual({ fn: 'hello', args: [] })
		// Two sums: the one picked wins, else the one that ends.
		expect(parseCall('sum(3)')).toEqual({ fn: 'sum', args: [3] })
		expect(parseCall('sum(3)', 'stuck')).toEqual({ fn: 'stuck', args: [3] })
	})

	it('says what is wrong with a call it cannot trace', () => {
		expect(parseCall('gcd(60)')).toEqual({ error: 'gcd takes m, n' })
		expect(parseCall('fib(9)')).toEqual({ error: 'fib: up to fib(7) here (41 calls)' })
		expect(parseCall('power(2, 3)')).toEqual({ error: 'power: try gcd, fact, fib, sum or sayHello' })
		expect(parseCall('fact 4')).toEqual({ error: 'Type a call, like gcd(60, 24)' })
		expect(parseCall('sum(0)')).toEqual({ error: 'sum needs a whole number ≥ 1' })
	})
})

describe('tracing on the stack', () => {
	it('fact: frames go on above the call that made them, then come off as the values come back', () => {
		expect(stacks('fact', [3])).toEqual([
			['main: fact(3)', 'fact(3): 3 * fact(2)'],
			['main: fact(3)', 'fact(3): 3 * fact(2)', 'fact(2): 2 * fact(1)'],
			['main: fact(3)', 'fact(3): 3 * fact(2)', 'fact(2): 2 * fact(1)', 'fact(1): return 1'],
			['main: fact(3)', 'fact(3): 3 * fact(2)', 'fact(2): 2 * 1 = 2'],
			['main: fact(3)', 'fact(3): 3 * 2 = 6'],
			['main: fact(3) = 6'],
		])
		const { frames, depth, overflowed } = traceCall('fact', [3])
		expect([depth, overflowed]).toEqual([4, false])
		expect(frames.map((f) => traceOf(f)!.line)).toEqual(['recursive', 'recursive', 'base', 'recursive', 'recursive', undefined])
		// The value a frame returned moves down into the frame below it.
		expect(frames[3].moves).toEqual([['slot:3', 'slot:2']])
		expect(traceOf(frames[3])!.flowing).toEqual(['1'])
		expect(frames.at(-1)!.caption).toBe('main: fact(3) = 6. 3 calls, at most 3 on the stack at once')
		expect(frames.at(-1)!.counts).toEqual({ calls: 3, 'max depth': 3 })
	})

	it('the frames carry the calls for the recursion tree: base cases return as they are made', () => {
		const run = callRun(traceCall('fact', [3]).frames)
		expect(run.calls).toEqual([
			{ label: 'fact(3)', parent: -1, result: '6' },
			{ label: 'fact(2)', parent: 0, result: '2' },
			{ label: 'fact(1)', parent: 1, result: '1' },
		])
		expect(run.returned).toEqual([4, 3, 2])
		expect(branches(run.calls)).toBe(false)
	})

	it('gcd passes the answer straight back down', () => {
		expect(stacks('gcd', [60, 24]).map((s) => s.at(-1))).toEqual([
			'gcd(60, 24): return gcd(24, 12)',
			'gcd(24, 12): return gcd(12, 0)',
			'gcd(12, 0): return 12',
			'gcd(24, 12): return 12',
			'gcd(60, 24): return 12',
			'main: gcd(60, 24) = 12',
		])
	})

	it('fib branches, and makes the same calls again: the tree marks them', () => {
		const { frames } = traceCall('fib', [4])
		const run = callRun(frames)
		expect(run.calls.map((c) => c.label)).toEqual(['fib(4)', 'fib(3)', 'fib(2)', 'fib(1)', 'fib(0)', 'fib(1)', 'fib(2)', 'fib(1)', 'fib(0)'])
		expect(run.calls[0].result).toBe('3')
		expect(branches(run.calls)).toBe(true)
		// fib(1) under fib(3), then fib(2) and everything under it, were worked out before.
		expect([...repeatedCalls(run.calls)]).toEqual([5, 6, 7, 8])
		expect(frames.find((f) => f.caption?.startsWith('fib(4): fib(3) returned'))).toBeUndefined()
		expect(frames.some((f) => f.caption === 'fib(3) returned 2: fib(4) = 2 + fib(2), so now call fib(2)')).toBe(true)
		expect(frames.some((f) => f.caption?.includes('fib(2) again: it was worked out before'))).toBe(true)
	})

	it('sayHello has no base case: it fills the stack and overflows, printing all the way', () => {
		const { frames, depth, overflowed } = traceCall('hello', [])
		expect(overflowed).toBe(true)
		expect(depth).toBe(STACK_ROOM + 1)
		const last = frames.at(-1)!
		expect(traceOf(last)!.overflow).toBe(true)
		expect(last.caption).toMatch(/^sayHello\(\) calls sayHello\(\), but the stack is full: StackOverflowError/)
		expect(last.strips).toEqual([{ title: 'output', items: Array(STACK_ROOM).fill('Hello!') }])
		// No call ever returns.
		expect(callRun(frames).returned.every((r) => r === undefined)).toBe(true)
	})

	it('a sum whose n never gets smaller overflows too; sum(1) is its base case at once', () => {
		expect(traceCall('stuck', [3]).overflowed).toBe(true)
		expect(stacks('stuck', [3])[1].at(-1)).toBe('sum(3): 3 + sum(3)')
		expect(traceCall('stuck', [1]).overflowed).toBe(false)
		expect(stacks('sum', [3]).at(-1)).toEqual(['main: sum(3) = 6'])
	})
})

describe('tracer layout', () => {
	const props = { fn: 'fact' as const, size: 'm' as const, font: 'mono' as const }

	it('room for the deepest the run goes and one to spare; main in the bottom slot; the code under it', () => {
		const layout = tracerLayout(props, 'fact(3)', traceCall('fact', [3]))
		expect(layout.slots).toBe(5)
		const main = layout.slotBox(0)
		expect(main.y + main.h).toBeCloseTo(layout.stack.y + layout.stack.h)
		expect(layout.slotBox(1).y + layout.slotBox(1).h).toBeCloseTo(main.y)
		expect(layout.code.box.y).toBeGreaterThan(layout.stack.y + layout.stack.h)
		expect(layout.box.h).toBeCloseTo(layout.code.box.y + layout.code.box.h)
		expect(layout.offset.y).toBeCloseTo(main.y)
	})

	it('an overflowing run fills the stack exactly; a call it cannot trace leaves room for one frame', () => {
		expect(tracerLayout({ ...props, fn: 'hello' }, 'sayHello()', traceCall('hello', [])).slots).toBe(STACK_ROOM + 1)
		expect(tracerLayout(props, 'fact(', undefined).slots).toBe(2)
	})

	it('frames are wide enough for every value the run shows', () => {
		const trace = traceCall('fib', [5])
		const layout = tracerLayout({ ...props, fn: 'fib' }, 'fib(5)', trace)
		const longest = Math.max(...trace.texts.map((t) => t.work.length))
		expect(layout.slotBox(0).w - layout.callW).toBeGreaterThanOrEqual(longest * layout.fontSize * 0.62)
	})
})
