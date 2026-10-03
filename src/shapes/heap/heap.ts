import type { MarkColor, Marks } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { Frame } from '../../nodelink/playback'

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

/**
 * Floyd's build-heap, step by step: leaves are heaps on their own (green); each parent, from the
 * last back to the root, sifts down, after which everything from it to the end is a heap, so the
 * green grows: a suffix of the array, bottom-up in the tree. Keys are indices (the shape lights
 * both of its views). Pointer i stays on the parent being sifted.
 */
export function buildHeapSteps(start: readonly string[], type: HeapType): { frames: Frame[]; values: string[]; swaps: [number, number][] } {
	const n = start.length
	const values = [...start]
	const frames: Frame[] = []
	const swaps: [number, number][] = []
	let shown: Marks = {}
	const green = (from: number): Marks => Object.fromEntries(Array.from({ length: Math.max(0, n - from) }, (_, k) => [String(from + k), 'green']))
	const step = (caption: string, lit: Marks, extra: Partial<Frame> = {}) => {
		const flash: Record<string, MarkColor | null> = {}
		for (const key of Object.keys(shown)) if (!lit[key]) flash[key] = null
		for (const [key, color] of Object.entries(lit)) if (shown[key] !== color) flash[key] = color
		shown = lit
		frames.push({ caption, props: { values: [...values] }, flash, counts: { swaps: swaps.length }, ...extra })
	}
	const [beats, holds, child] = type === 'min' ? ['<', '≤', 'smaller'] : ['>', '≥', 'larger']
	const last = n > 1 ? parentIndex(n - 1) : -1
	step(
		last < 0
			? 'A single value is a heap already'
			: `The leaves (index ${last + 1} on) are heaps on their own. Sift down each parent, from the last (index ${last}) back to the root`,
		green(last + 1)
	)
	for (let i = last; i >= 0; i--) {
		const pointers = [{ id: '#i', name: 'i', at: String(i) }]
		step(`i = ${i}: sift ${values[i]} down until it ${holds} its children`, { ...green(i + 1), [i]: 'orange' }, { pointers })
		let at = i
		for (;;) {
			let best = at
			for (const c of childIndices(at)) if (c < n && above(values[c], values[best], type)) best = c
			if (best === at) break
			const caption = `${values[best]} ${beats} ${values[at]}: ${values[best]} is the ${child} child, so swap them`
			;[values[at], values[best]] = [values[best], values[at]]
			swaps.push([at, best])
			step(caption, { ...green(i + 1), [best]: 'orange' }, { pointers, swaps: [[String(at), String(best)]] })
			at = best
		}
		const kids = childIndices(at)
			.filter((c) => c < n)
			.map((c) => values[c])
		const rest = kids.length ? `${holds} its children (${kids.join(', ')})` : 'has no children'
		step(`${values[at]} ${rest}: the subtree at index ${i} is a heap`, green(i), { pointers })
	}
	const s = swaps.length
	step(`Every parent ${holds} its children: a ${type} heap, after ${s} swap${s === 1 ? '' : 's'}`, green(0))
	return { frames, values, swaps }
}
