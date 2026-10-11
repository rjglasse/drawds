// An array's moves, as its transcript keeps them: language-neutral, so the code beside it can be
// written in any language and rewritten when the language changes. A move says what the teacher did
// (set a value, append one, sort), not how the shape's props came to change.

export type ArrayMove =
	/** The array as the transcript starts it: created, or as it was when logging began. */
	| { op: 'new'; name: string; values: string[] }
	| { op: 'set'; i: number; v: string }
	| { op: 'append'; v: string }
	| { op: 'insert'; i: number; v: string }
	/** The last value taken off. */
	| { op: 'pop' }
	| { op: 'delete'; i: number }
	| { op: 'swap'; i: number; j: number }
	| { op: 'sort'; descending?: boolean }
	| { op: 'reverse' }
	/** Shuffled, into this order (a run of it can't be told: the transcript says what came out). */
	| { op: 'shuffle'; values: string[] }
	/** New values all at once (a refill, or a change no single move explains). */
	| { op: 'assign'; values: string[] }
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
