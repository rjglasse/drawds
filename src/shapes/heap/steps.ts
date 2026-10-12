import type { Frame } from '../../nodelink/playback'
import { heapCode } from './code'
import { childIndices, heapInsert, heapRemoveAt, parentIndex, type HeapType, type Sift } from './heap'

// A heap's insert and remove step by step, keyed by index: the shape lights, swaps and asks about
// both of its views (tree node i and array cell i) from them. Each step names the line of its code
// (`code.ts`) it shows.

export interface HeapSteps {
	frames: Frame[]
	result: Sift
	code: string
}

/** Append `value`, then sift it up: a step per swap, then where it came to rest and why. */
export function insertSteps(values: readonly string[], value: string, type: HeapType): HeapSteps {
	const result = heapInsert(values, value, type)
	const appended = [...values, value]
	const frames: Frame[] = [
		{
			props: { values: appended },
			flash: { [values.length]: 'orange' },
			caption: `Append ${value} at the end (index ${values.length})`,
			ask: `Insert ${value}: where does it go first?`,
			line: 'append',
			vars: { value, i: String(values.length) },
		},
		...siftSteps(appended, result, type, true, { value }),
	]
	return { frames, result, code: heapCode('insert', type) }
}

/**
 * Remove the value at `i` (the root: extract-min / extract-max): the last value takes its place and
 * sifts down, or up if it now beats its new parent.
 */
export function removeSteps(values: readonly string[], i: number, type: HeapType): HeapSteps {
	const result = heapRemoveAt(values, i, type)
	const last = values.length - 1
	const moved = values.slice(0, -1)
	if (i < moved.length) moved[i] = values[last]
	const root = i === 0
	// extractMin's min (or max), returned at the end.
	const vars: Record<string, string> = root ? { [type]: values[0] } : {}
	const frames: Frame[] = [
		{
			flash: { [i]: 'red' },
			caption: root ? `Extract the ${type}, ${values[0]}` : `Remove ${values[i]} (index ${i})`,
			ask: false,
			line: root ? 'take' : 'call',
			vars,
		},
		...(i < last
			? [
					{
						props: { values: moved },
						flash: { [i]: 'orange' as const },
						caption: `Move the last value, ${values[last]}, into index ${i}`,
						ask: `${values[i]} is going: what fills its place?`,
						askFocus: [String(i)],
						line: 'move',
						vars,
					},
				]
			: []),
		// heapRemoveAt sifts the moved value up only if it now beats its parent, which means a swap.
		...siftSteps(moved, result, type, result.swaps.length > 0 && result.swaps[0][1] < result.swaps[0][0], vars),
	]
	return { frames, result, code: heapCode(root ? 'extract' : 'remove', type) }
}

/**
 * One step per swap of a sift that moves a value `up` or down from `start` (the two values arc
 * between their nodes), then one showing where it came to rest and why: the loop's test failing.
 */
function siftSteps(start: readonly string[], sift: Sift, type: HeapType, up: boolean, vars: Record<string, string>): Frame[] {
	const values = [...start]
	// In a min heap smaller values go up; in a max heap larger ones.
	const [beats, yields, holds, child] = type === 'min' ? ['<', '≥', '≤', 'smaller'] : ['>', '≤', '≥', 'larger']
	// Predict mode asks the same at every step, swap or stop: compare with the parent (up), or the
	// children (down). With nothing to compare (the root, a leaf) there is nothing to guess.
	const ask = (i: number): Pick<Frame, 'ask' | 'askFocus'> => {
		if (up) return i === 0 ? { ask: false } : { ask: `${values[i]} vs its parent ${values[parentIndex(i)]}: swap or stop?`, askFocus: [String(i), String(parentIndex(i))] }
		const kids = childIndices(i).filter((c) => c < values.length)
		return kids.length
			? { ask: `${values[i]} vs its children (${kids.map((c) => values[c]).join(', ')}): swap with one, or stop?`, askFocus: [i, ...kids].map(String) }
			: { ask: false }
	}
	const frames: Frame[] = sift.swaps.map(([a, b]) => {
		const caption = up ? `${values[a]} ${beats} ${values[b]}, its parent: swap them` : `${values[b]} ${beats} ${values[a]}: ${values[b]} is the ${child} child, so swap them`
		const question = ask(a)
		;[values[a], values[b]] = [values[b], values[a]]
		return {
			props: { values: [...values] },
			swaps: [[String(a), String(b)]],
			flash: { [a]: 'orange', [b]: 'orange' },
			caption,
			...question,
			line: up ? 'swap-up' : 'swap-down',
			vars: { ...vars, i: String(b) },
		}
	})
	const at = sift.at
	if (at < 0) return frames
	const v = values[at]
	const kids = childIndices(at).filter((c) => c < values.length)
	const caption = up
		? at === 0
			? `${v} is at the root: done`
			: `${v} ${yields} ${values[parentIndex(at)]}, its parent: done`
		: kids.length
			? `${v} ${holds} its children (${kids.map((c) => values[c]).join(', ')}): done`
			: `${v} has no children: done`
	// Stopping down: the best of it and its children is itself (smallest == i).
	const best = up ? {} : { [type === 'min' ? 'smallest' : 'largest']: String(at) }
	return [...frames, { props: { values: [...values] }, flash: { [at]: 'green' }, caption, ...ask(at), line: up ? 'up' : 'down', vars: { ...vars, i: String(at), ...best } }]
}
