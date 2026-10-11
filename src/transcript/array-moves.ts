// An array's moves, as its transcript keeps them: language-neutral, so the code beside it can be
// written in any language and rewritten when the language changes. A move says what the teacher did
// (set a value, append one, sort), not how the shape's props came to change.

/**
 * A stack or queue with a fixed capacity: lecture 6's ArrayStack, or its ArrayQueue (a circular
 * buffer, its values from `front`). Anything else, growing stacks and queues too, is a list.
 */
export interface Fixed {
	as: 'stack' | 'queue'
	capacity: number
	front: number
}

export type ArrayMove =
	/** The array as the transcript starts it: created, or as it was when logging began. */
	| { op: 'new'; name: string; values: string[]; fixed?: Fixed }
	| { op: 'set'; i: number; v: string }
	| { op: 'append'; v: string }
	| { op: 'insert'; i: number; v: string }
	/** The last value taken off (an ArrayStack's pop). */
	| { op: 'pop' }
	/** An ArrayStack's push; an ArrayQueue's enqueue (at its rear) and dequeue (from its front). */
	| { op: 'push'; v: string }
	| { op: 'enqueue'; v: string }
	| { op: 'dequeue' }
	| { op: 'delete'; i: number }
	| { op: 'swap'; i: number; j: number }
	| { op: 'sort'; descending?: boolean }
	| { op: 'reverse' }
	/** Shuffled, into this order (a run of it can't be told: the transcript says what came out). */
	| { op: 'shuffle'; values: string[] }
	/** New values all at once (a refill, or a change no single move explains); a stack or queue built anew. */
	| { op: 'assign'; values: string[]; fixed?: Fixed }
	/**
	 * An operation played step by step and put in: its algorithm (an id in `ALGORITHMS`), written as a
	 * call where its parameters can be filled in, else as `effect`, under the operation's name.
	 */
	| { op: 'call'; algorithm: string; label: string; effect: ArrayMove[] }

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i])
const startsWith = (long: readonly string[], short: readonly string[]) => short.every((v, i) => long[i] === v)
const counted = (values: readonly string[]) => values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())
const permutation = (a: readonly string[], b: readonly string[]) => {
	if (a.length !== b.length) return false
	const ca = counted(a)
	const cb = counted(b)
	return [...ca].every(([v, n]) => cb.get(v) === n)
}
const numeric = (v: string) => v.trim() !== '' && Number.isFinite(Number(v))
const before = (x: string, y: string) => (numeric(x) && numeric(y) ? Number(x) - Number(y) : x < y ? -1 : x > y ? 1 : 0)
const ascending = (values: readonly string[]) => values.every((v, i) => i === 0 || before(values[i - 1], v) <= 0)
const descending = (values: readonly string[]) => values.every((v, i) => i === 0 || before(values[i - 1], v) >= 0)

/** The index where `long` has one value more than `short`, if that is the only difference. */
function extraAt(long: readonly string[], short: readonly string[]): number | undefined {
	let k = 0
	while (k < short.length && long[k] === short[k]) k++
	return same([...long.slice(0, k), ...long.slice(k + 1)], short) ? k : undefined
}

/**
 * The moves that take an array's values from `prev` to `next`, as a teacher would have made them: a
 * value set, values appended or popped, one inserted or deleted, two swapped, the whole array sorted
 * or reversed; else the new values assigned at once.
 */
export function diffValues(prev: readonly string[], next: readonly string[]): ArrayMove[] {
	if (same(prev, next)) return []
	const [n, m] = [prev.length, next.length]
	if (m === n) {
		const changed = prev.flatMap((v, k) => (v === next[k] ? [] : [k]))
		if (changed.length === 1) return [{ op: 'set', i: changed[0], v: next[changed[0]] }]
		const [i, j] = changed
		if (changed.length === 2 && prev[i] === next[j] && prev[j] === next[i]) return [{ op: 'swap', i, j }]
		if (permutation(prev, next)) {
			if (ascending(next)) return [{ op: 'sort' }]
			if (descending(next)) return [{ op: 'sort', descending: true }]
			if (same([...prev].reverse(), next)) return [{ op: 'reverse' }]
		}
	} else if (m > n) {
		if (startsWith(next, prev)) return next.slice(n).map((v) => ({ op: 'append', v }))
		const k = m === n + 1 ? extraAt(next, prev) : undefined
		if (k !== undefined) return [{ op: 'insert', i: k, v: next[k] }]
	} else {
		if (startsWith(prev, next)) return Array.from({ length: n - m }, () => ({ op: 'pop' }))
		const k = n === m + 1 ? extraAt(prev, next) : undefined
		if (k !== undefined) return [{ op: 'delete', i: k }]
	}
	return [{ op: 'assign', values: [...next] }]
}

/** What an array's transcript follows: its values in use, in order (a queue's from its front), and whether it is an ArrayStack or ArrayQueue. */
export interface ArrayLogState {
	values: string[]
	fixed?: Fixed
}

const sameFixed = (a?: Fixed, b?: Fixed) => a?.as === b?.as && a?.capacity === b?.capacity && a?.front === b?.front

export const sameArray = (a: ArrayLogState, b: ArrayLogState) => same(a.values, b.values) && sameFixed(a.fixed, b.fixed)

/**
 * The moves that take an array from `prev` to `next`. A list (growing stacks and queues are lists
 * too): as `diffValues`. An ArrayStack: a push, a pop, a value typed; an ArrayQueue: an enqueue, a
 * dequeue (its front moving on), a value typed at its place in the buffer. Another kind, another
 * capacity, anything else: built anew.
 */
export function diffArray(prev: ArrayLogState, next: ArrayLogState): ArrayMove[] {
	if (sameArray(prev, next)) return []
	const [a, b] = [prev.fixed, next.fixed]
	const anew: ArrayMove[] = [{ op: 'assign', values: [...next.values], ...(b ? { fixed: { ...b } } : {}) }]
	if (!a && !b) return diffValues(prev.values, next.values)
	if (!a || !b || a.as !== b.as || a.capacity !== b.capacity) return anew
	const [x, y] = [prev.values, next.values]
	const last = y[y.length - 1]
	if (a.front === b.front && y.length === x.length + 1 && startsWith(y, x)) return [b.as === 'stack' ? { op: 'push', v: last } : { op: 'enqueue', v: last }]
	if (b.as === 'stack' && y.length === x.length - 1 && startsWith(x, y)) return [{ op: 'pop' }]
	if (b.as === 'queue' && x.length && b.front === (a.front + 1) % b.capacity && same(x.slice(1), y)) return [{ op: 'dequeue' }]
	if (a.front === b.front && x.length === y.length) {
		const changed = x.flatMap((v, k) => (v === y[k] ? [] : [k]))
		// At its place in the array: a queue's k-th value is (front + k) % capacity along.
		if (changed.length === 1) return [{ op: 'set', i: (b.front + changed[0]) % b.capacity, v: y[changed[0]] }]
	}
	return anew
}

/** The values a log leaves the array with. */
export function replay(moves: readonly ArrayMove[]): string[] {
	let a: string[] = []
	for (const move of moves) {
		switch (move.op) {
			case 'new':
			case 'assign':
			case 'shuffle':
				a = [...move.values]
				break
			case 'set':
				a[move.i] = move.v
				break
			case 'append':
				a.push(move.v)
				break
			case 'insert':
				a.splice(move.i, 0, move.v)
				break
			case 'pop':
				a.pop()
				break
			case 'delete':
				a.splice(move.i, 1)
				break
			case 'swap':
				;[a[move.i], a[move.j]] = [a[move.j], a[move.i]]
				break
			case 'sort':
				a.sort((x, y) => (move.descending ? before(y, x) : before(x, y)))
				break
			case 'reverse':
				a.reverse()
				break
			case 'call':
				a = replay([{ op: 'assign', values: a }, ...move.effect])
				break
		}
	}
	return a
}
