import { compareKeys } from '../../data/compare'

export type HeapType = 'min' | 'max'

export const parentIndex = (i: number) => Math.floor((i - 1) / 2)
export const childIndices = (i: number) => [2 * i + 1, 2 * i + 2]

/** Whether `a` belongs above `b` in a heap of this type. */
const above = (a: string, b: string, type: HeapType) => (type === 'min' ? compareKeys(a, b) < 0 : compareKeys(a, b) > 0)

export interface Sift {
	values: string[]
	/** Index pairs swapped, in order: each step of the animation. */
	swaps: [number, number][]
	/** Indices the moving value passed through, start first. */
	path: number[]
	/** Where the moving value ended up. */
	at: number
}

export function siftUp(values: readonly string[], i: number, type: HeapType): Sift {
	const out = [...values]
	const swaps: [number, number][] = []
	const path = [i]
	while (i > 0 && above(out[i], out[parentIndex(i)], type)) {
		const p = parentIndex(i)
		;[out[i], out[p]] = [out[p], out[i]]
		swaps.push([i, p])
		i = p
		path.push(i)
	}
	return { values: out, swaps, path, at: i }
}

export function siftDown(values: readonly string[], i: number, type: HeapType): Sift {
	const out = [...values]
	const swaps: [number, number][] = []
	const path = [i]
	for (;;) {
		let best = i
		for (const c of childIndices(i)) if (c < out.length && above(out[c], out[best], type)) best = c
		if (best === i) break
		;[out[i], out[best]] = [out[best], out[i]]
		swaps.push([i, best])
		i = best
		path.push(i)
	}
	return { values: out, swaps, path, at: i }
}

/** Append a value and sift it up. */
export function heapInsert(values: readonly string[], value: string, type: HeapType): Sift {
	return siftUp([...values, value], values.length, type)
}

/**
 * Remove the value at `i` (i = 0 is extract-min / extract-max): the last value takes its place
 * and sifts down, or up if it is now smaller (min heap) than its new parent.
 */
export function heapRemoveAt(values: readonly string[], i: number, type: HeapType): Sift & { removed: string } {
	const removed = values[i]
	const out = values.slice(0, -1)
	if (i >= out.length) return { values: out, swaps: [], path: [], at: -1, removed }
	out[i] = values[values.length - 1]
	const up = i > 0 && above(out[i], out[parentIndex(i)], type)
	return { ...(up ? siftUp(out, i, type) : siftDown(out, i, type)), removed }
}

/** Floyd's build-heap: sift down every internal node, last first. */
export function heapify(values: readonly string[], type: HeapType): Sift {
	let out = [...values]
	const swaps: [number, number][] = []
	for (let i = parentIndex(out.length - 1); i >= 0; i--) {
		const s = siftDown(out, i, type)
		out = s.values
		swaps.push(...s.swaps)
	}
	return { values: out, swaps, path: [], at: -1 }
}

/** A heap built by inserting values one at a time, as if typed in that order. */
export function buildByInsertion(stream: readonly string[], type: HeapType): string[] {
	return stream.reduce<string[]>((heap, v) => heapInsert(heap, v, type).values, [])
}

/** Indices whose value breaks the heap property against its parent. */
export function heapViolations(values: readonly string[], type: HeapType): Set<number> {
	const bad = new Set<number>()
	for (let i = 1; i < values.length; i++) if (above(values[i], values[parentIndex(i)], type)) bad.add(i)
	return bad
}
