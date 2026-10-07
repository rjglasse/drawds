import type { Frame, Strip } from '../../nodelink/playback'

// Recursion traced on the call stack (lecture 1's "keeping track with a stack", lecture 4a's
// overlapping subproblems): a recursive function run step by step, each call a frame pushed on
// the stack above the one that made it, showing what it still has to do (3 * fact(2)), until a
// base case returns and the values come back down, each frame finishing its sum or product and
// returning in turn. Functions with no base case, or whose argument never shrinks, fill the stack
// until it overflows. Pure: frames for the tracer shape (and its recursion tree beside it).

export const TRACED = ['gcd', 'fact', 'fib', 'sum', 'hello', 'stuck'] as const
export type Traced = (typeof TRACED)[number]

/** Which line of the code a step is on: the base case, the recursive case, or (sayHello) the print. */
export type CodeLine = 'base' | 'recursive' | 'print'

interface TracedFunction {
	/** As it is called: gcd(60, 24), sayHello(). */
	name: string
	params: string[]
	/** The call a new tracer (or the Function picker) starts with. */
	example: string
	/** Java, as on the slides, with the lines a step can be on. */
	code: { text: string; line?: CodeLine; note?: string }[]
	/** Why these arguments can't be traced here (too big a tree, not a natural number...). */
	check(args: number[]): string | undefined
}

const natural = (n: number) => Number.isInteger(n) && n >= 0

export const FUNCTIONS: Record<Traced, TracedFunction> = {
	gcd: {
		name: 'gcd',
		params: ['m', 'n'],
		example: 'gcd(60, 24)',
		code: [
			{ text: 'int gcd(int m, int n) {' },
			{ text: '    if (n == 0) return m;', line: 'base', note: 'base case' },
			{ text: '    return gcd(n, m % n);', line: 'recursive', note: 'recursive case' },
			{ text: '}' },
		],
		check: ([m, n]) => (!natural(m) || !natural(n) ? 'gcd needs two whole numbers ≥ 0' : m === 0 && n === 0 ? 'gcd(0, 0) has no answer' : m > 1e9 || n > 1e9 ? 'gcd: keep the numbers under a billion' : undefined),
	},
	fact: {
		name: 'fact',
		params: ['n'],
		example: 'fact(4)',
		code: [
			{ text: 'int fact(int n) {' },
			{ text: '    if (n <= 1) return 1;', line: 'base', note: 'base case' },
			{ text: '    return n * fact(n - 1);', line: 'recursive', note: 'recursive case' },
			{ text: '}' },
		],
		check: ([n]) => (!natural(n) ? 'fact needs a whole number ≥ 0' : n > 10 ? 'fact: up to fact(10) here' : undefined),
	},
	fib: {
		name: 'fib',
		params: ['n'],
		example: 'fib(5)',
		code: [
			{ text: 'int fib(int n) {' },
			{ text: '    if (n < 2) return n;', line: 'base', note: 'base case' },
			{ text: '    return fib(n - 1) + fib(n - 2);', line: 'recursive', note: 'recursive case' },
			{ text: '}' },
		],
		check: ([n]) => (!natural(n) ? 'fib needs a whole number ≥ 0' : n > 7 ? 'fib: up to fib(7) here (41 calls)' : undefined),
	},
	sum: {
		name: 'sum',
		params: ['n'],
		example: 'sum(4)',
		code: [
			{ text: 'int sum(int n) {' },
			{ text: '    if (n == 1) return 1;', line: 'base', note: 'base case' },
			{ text: '    return n + sum(n - 1);', line: 'recursive', note: 'recursive case' },
			{ text: '}' },
		],
		check: ([n]) => (!Number.isInteger(n) || n < 1 ? 'sum needs a whole number ≥ 1' : n > 10 ? 'sum: up to sum(10) here' : undefined),
	},
	hello: {
		name: 'sayHello',
		params: [],
		example: 'sayHello()',
		code: [
			{ text: 'void sayHello() {' },
			{ text: '    System.out.println("Hello!");', line: 'print' },
			{ text: '    sayHello();', line: 'recursive', note: 'no base case!' },
			{ text: '}' },
		],
		check: () => undefined,
	},
	stuck: {
		name: 'sum',
		params: ['n'],
		example: 'sum(3)',
		code: [
			{ text: 'int sum(int n) {' },
			{ text: '    if (n == 1) return 1;', line: 'base', note: 'base case' },
			{ text: '    return n + sum(n);', line: 'recursive', note: 'never gets smaller!' },
			{ text: '}' },
		],
		check: ([n]) => (!Number.isInteger(n) || n < 1 ? 'sum needs a whole number ≥ 1' : n > 99 ? 'sum: keep n under 100' : undefined),
	},
}

/** Frames the stack has room for above main: the never-ending runs fill it and overflow. */
export const STACK_ROOM = 8

/** A call typed as text: its function (by name; `prefer` breaks the tie between the two sums) and arguments. */
export function parseCall(text: string, prefer?: Traced): { fn: Traced; args: number[] } | { error: string } {
	const m = /^\s*([A-Za-z_]\w*)\s*\(([^()]*)\)\s*$/.exec(text)
	if (!m) return { error: 'Type a call, like gcd(60, 24)' }
	const named = TRACED.filter((fn) => FUNCTIONS[fn].name === m[1] || (fn === 'fact' && m[1] === 'factorial'))
	if (!named.length) return { error: `${m[1]}: try gcd, fact, fib, sum or sayHello` }
	const fn = prefer && named.includes(prefer) ? prefer : named[0]
	const args = m[2].trim() ? m[2].split(',').map((a) => Number(a.trim())) : []
	const { params } = FUNCTIONS[fn]
	if (args.length !== params.length || args.some((a) => !Number.isFinite(a))) {
		return { error: `${FUNCTIONS[fn].name} takes ${params.length ? params.join(', ') : 'no arguments'}` }
	}
	const error = FUNCTIONS[fn].check(args)
	return error ? { error } : { fn, args }
}

/** A frame on the stack: the call, and what it is doing (still to do, or the value it returns). */
export interface StackFrameView {
	call: string
	work: string
}

/** What the tracer draws at a step (a frame's props): the stack from main up, and the line of code. */
export interface TraceView {
	stack: StackFrameView[]
	line?: CodeLine
	/** The stack is full and the next call can't go on it. */
	overflow?: boolean
	/** The run is over: main has its value. */
	done?: boolean
	/** Values just returned, moving down into the frames below (the frame's `moves`, in order). */
	flowing?: string[]
}

export const traceOf = (frame: Frame | undefined) => (frame?.props as { trace?: TraceView } | undefined)?.trace

/** The key of slot `i` on the stack (0: main), for values moving down it. */
export const slotKey = (i: number) => `slot:${i}`
export const slotIndex = (key: string) => Number(key.slice('slot:'.length))

export interface Trace {
	frames: Frame[]
	/** The most frames on the stack at once, main included. */
	depth: number
	/** Every frame's text any step shows, to size the frames once for the whole run. */
	texts: StackFrameView[]
	overflowed: boolean
}

/**
 * Records a run: the stack as each step leaves it. A frame that returns stays on the stack for that
 * step (showing its value), and goes at the next, its value moving down into the frame below.
 */
function tracer(callText: string) {
	const frames: Frame[] = []
	const stack: (StackFrameView & { returned?: string })[] = [{ call: 'main', work: callText }]
	const texts: StackFrameView[] = [{ call: 'main', work: callText }]
	const counts = { calls: 0, 'max depth': 0 }
	const output: string[] = []
	let depth = 1
	return {
		stack,
		counts,
		output,
		get depth() {
			return depth
		},
		/**
		 * A step. `push`: a new frame on top (its call made at this step); `returns`: the top frame
		 * (pushed now, or resumed) returns this value. Frames that returned at the step before go first.
		 */
		step(
			caption: string,
			{
				push,
				work,
				returns,
				line,
				ask,
				overflow,
				done,
			}: { push?: string; work?: string; returns?: string; line?: CodeLine; ask?: string | false; overflow?: boolean; done?: boolean }
		) {
			const moves: [string, string][] = []
			const flowing: string[] = []
			while (stack.length > 1 && stack[stack.length - 1].returned !== undefined) {
				flowing.push(stack.pop()!.returned!)
				moves.push([slotKey(stack.length), slotKey(stack.length - 1)])
			}
			const calls: Frame['calls'] = []
			if (push !== undefined) {
				stack.push({ call: push, work: work ?? '' })
				counts.calls++
				counts['max depth'] = Math.max(counts['max depth'], stack.length - 1)
				calls.push({ call: push })
			} else if (work !== undefined) {
				stack[stack.length - 1].work = work
			}
			if (returns !== undefined) {
				stack[stack.length - 1].returned = returns
				calls.push({ returns })
			}
			depth = Math.max(depth, stack.length)
			const view: TraceView = {
				stack: stack.map(({ call, work }) => ({ call, work })),
				...(line ? { line } : {}),
				...(overflow ? { overflow } : {}),
				...(done ? { done } : {}),
				...(flowing.length ? { flowing } : {}),
			}
			texts.push(...view.stack)
			const strips: Strip[] | undefined = output.length ? [{ title: 'output', items: [...output] }] : undefined
			frames.push({
				caption,
				props: { trace: view },
				counts: { ...counts },
				...(moves.length ? { moves } : {}),
				...(calls.length ? { calls } : {}),
				...(strips ? { strips } : {}),
				...(ask === undefined ? {} : { ask }),
			})
		},
		result(overflowed: boolean): Trace {
			return { frames, depth, texts, overflowed }
		},
	}
}

const NEXT_CALL = 'Which call comes next?'

/** The call as a call: name(args). */
export const callOf = (fn: Traced, args: readonly number[]) => `${FUNCTIONS[fn].name}(${args.join(', ')})`

/** Trace `fn(args)` from main, step by step. */
export function traceCall(fn: Traced, args: readonly number[]): Trace {
	const first = callOf(fn, args)
	const r = tracer(first)
	const label = (...a: number[]) => callOf(fn, a)
	/** Calls already made and returned, for fib's repeats. */
	const known = new Map<string, number>()
	const again = (call: string) => (known.has(call) ? ` (${call} again: it was worked out before)` : '')
	let overflowed = false

	/** The stack is full: the next call can't go on it. */
	const full = () => r.stack.length - 1 >= STACK_ROOM

	const run = (a: number[]): number | undefined => {
		const call = label(...a)
		switch (fn) {
			case 'gcd': {
				const [m, n] = a
				if (n === 0) {
					r.step(`${call}: n = 0, the base case: return m = ${m}`, { push: call, work: `return ${m}`, returns: String(m), line: 'base', ask: NEXT_CALL })
					return m
				}
				const next = label(n, m % n)
				r.step(`${call}: n = ${n} isn't 0, so return gcd(${n}, ${m} % ${n}) = ${next}`, { push: call, work: `return ${next}`, line: 'recursive', ask: NEXT_CALL })
				const g = run([n, m % n])!
				r.step(`${next} returned ${g}, so ${call} returns ${g} too`, { work: `return ${g}`, returns: String(g), line: 'recursive', ask: `What does ${call} return?` })
				return g
			}
			case 'fact':
			case 'sum': {
				const [n] = a
				const op = fn === 'fact' ? '*' : '+'
				const base = fn === 'fact' ? n <= 1 : n === 1
				if (base) {
					r.step(`${call}: ${fn === 'fact' ? `${n} ≤ 1` : 'n = 1'}, the base case: return 1`, { push: call, work: 'return 1', returns: '1', line: 'base', ask: NEXT_CALL })
					return 1
				}
				const next = label(n - 1)
				r.step(`${call}: ${fn === 'fact' ? `${n} > 1` : `${n} ≠ 1`}, so return ${n} ${op} ${next}: call ${next} first`, {
					push: call,
					work: `${n} ${op} ${next}`,
					line: 'recursive',
					ask: NEXT_CALL,
				})
				const rest = run([n - 1])!
				const value = fn === 'fact' ? n * rest : n + rest
				r.step(`${next} returned ${rest}: ${call} = ${n} ${op} ${rest} = ${value}, return ${value}`, {
					work: `${n} ${op} ${rest} = ${value}`,
					returns: String(value),
					line: 'recursive',
					ask: `What does ${call} return?`,
				})
				return value
			}
			case 'fib': {
				const [n] = a
				if (n < 2) {
					r.step(`${call}: ${n} < 2, the base case: return ${n}${again(call)}`, { push: call, work: `return ${n}`, returns: String(n), line: 'base', ask: NEXT_CALL })
					known.set(call, n)
					return n
				}
				const [x, y] = [label(n - 1), label(n - 2)]
				r.step(`${call}: ${n} ≥ 2, so return ${x} + ${y}: call ${x} first${again(call)}`, { push: call, work: `${x} + ${y}`, line: 'recursive', ask: NEXT_CALL })
				const p = run([n - 1])!
				r.step(`${x} returned ${p}: ${call} = ${p} + ${y}, so now call ${y}`, { work: `${p} + ${y}`, line: 'recursive', ask: `What does ${call} do next?` })
				const q = run([n - 2])!
				r.step(`${y} returned ${q}: ${call} = ${p} + ${q} = ${p + q}, return ${p + q}`, {
					work: `${p} + ${q} = ${p + q}`,
					returns: String(p + q),
					line: 'recursive',
					ask: `What does ${call} return?`,
				})
				known.set(call, p + q)
				return p + q
			}
			case 'hello':
			case 'stuck': {
				if (full()) {
					overflowed = true
					r.step(
						`${r.stack[r.stack.length - 1].call} calls ${call}, but the stack is full: StackOverflowError (Java's stack holds thousands of frames; this one holds ${STACK_ROOM})`,
						{ overflow: true, ask: 'What happens next?' }
					)
					return undefined
				}
				if (fn === 'hello') {
					r.output.push('Hello!')
					r.step(`${call}: print "Hello!", then call sayHello() again: there is no base case to stop it`, {
						push: call,
						work: 'print, then sayHello()',
						line: 'print',
						ask: NEXT_CALL,
					})
				} else {
					const [n] = a
					if (n === 1) {
						r.step(`${call}: n = 1, the base case: return 1`, { push: call, work: 'return 1', returns: '1', line: 'base', ask: NEXT_CALL })
						return 1
					}
					r.step(`${call}: ${n} ≠ 1, so return ${n} + ${call}: the same call again, n never gets smaller`, {
						push: call,
						work: `${n} + ${call}`,
						line: 'recursive',
						ask: NEXT_CALL,
					})
				}
				const value = run(a)
				if (value === undefined) return undefined
				// Only sum(1) gets here: n = 1 at the first call.
				return value
			}
		}
	}

	const value = run([...args])
	if (value === undefined || overflowed) {
		return r.result(true)
	}
	const { calls } = r.counts
	r.step(`main: ${first} = ${value}. ${calls} call${calls === 1 ? '' : 's'}, at most ${r.counts['max depth']} on the stack at once`, {
		work: `${first} = ${value}`,
		done: true,
		ask: false,
	})
	return r.result(false)
}
