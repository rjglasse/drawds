import { heapify, heapRemoveAt, type HeapType } from '../shapes/heap/heap'

// A heap's moves, as its transcript keeps them (as `array-moves.ts` for arrays): a heap is its array
// and its type, and its code (`src/shapes/heap/code.ts`) works on that array. A heap is made from
// values as they are (a broken heap is a fine exercise); build_heap() is what makes it one.

export type HeapMove =
	| { op: 'new'; name: string; type: HeapType; values: string[] }
	/** A value typed into index i (no sifting). */
	| { op: 'set'; i: number; v: string }
	/** Floyd's build-heap at once (switching min and max rebuilds it). */
	| { op: 'build' }
	/** Shuffled, into this order. */
	| { op: 'shuffle'; values: string[] }
	/** A new heap, of this type, holding these values as they are. */
	| { op: 'assign'; type: HeapType; values: string[] }
	/**
	 * An operation played step by step and put in: its algorithm's call, `args` what can be told of
	 * its parameters from what it did (the value put in, the index taken out), else its effect.
	 */
	| { op: 'call'; algorithm: string; label: string; effect: HeapMove[]; args?: { value?: string; i?: string } }

/** What a heap's transcript follows. */
export interface HeapState {
	type: HeapType
	values: string[]
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i])

export const sameHeap = (a: HeapState, b: HeapState) => a.type === b.type && same(a.values, b.values)

/**
 * The moves that take a heap from `prev` to `next`: a value typed, the heap built (the values
 * Floyd's build-heap gives); else a new heap with the new values (and type: min and max switched).
 */
export function diffHeap(prev: HeapState, next: HeapState): HeapMove[] {
	if (sameHeap(prev, next)) return []
	const { type, values } = next
	if (prev.type === type && prev.values.length === values.length) {
		const changed = prev.values.flatMap((v, k) => (v === values[k] ? [] : [k]))
		if (changed.length === 1) return [{ op: 'set', i: changed[0], v: values[changed[0]] }]
		if (same(heapify(prev.values, type).values, values)) return [{ op: 'build' }]
	}
	return [{ op: 'assign', type, values: [...values] }]
}

/** What can be told of an operation's parameters from what it did: the value put in, the index taken out. */
export function heapArgs(prev: HeapState, next: HeapState): { value?: string; i?: string } {
	const [a, b] = [prev.values, next.values]
	if (b.length === a.length + 1) {
		const left = [...b]
		for (const v of a) {
			const k = left.indexOf(v)
			if (k < 0) return {}
			left.splice(k, 1)
		}
		return { value: left[0] }
	}
	// The index whose removal leaves this heap (with repeated values, the first that does).
	const i = b.length === a.length - 1 ? a.findIndex((_, k) => same(heapRemoveAt(a, k, prev.type).values, b)) : -1
	return i < 0 ? {} : { i: String(i) }
}
