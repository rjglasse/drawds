import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import { otherKey } from '../../nodelink/playback'
import type { Pointer } from '../../pointers/pointers'
import { isSorted, ptr, recorder, type ArrayOperation, type ArrayState } from './operations'

// Merging two sorted arrays (dds-55z.20.10), as merge(a, b) does it: c is a new array of n + m cells,
// i walks a, j walks b, and the smaller of a[i] and b[j] is copied into c[k] (a's on a tie, so equal
// values keep their order), then whatever is left of either. Nothing in a or b changes: arrays merge by
// copying every value into new space, where linked lists re-point arrows and copy nothing.

const LOOK: MarkColor = 'orange'
const DONE: MarkColor = 'green'

/** Whether two arrays' values can be merged: both sorted, at least one value between them. */
export const canMergeValues = (a: readonly string[], b: readonly string[]) => a.length + b.length > 0 && isSorted(a) && isSorted(b)

/** Where the new array's row goes: `drop` to clear b if it is in the way, `gap` for k above its cells. */
export interface MergeRoom {
	drop: number
	gap: number
}

/**
 * Merge sorted `b` (the array shape `bId`, lit and pointed into where it is) into a new array c, drawn
 * as a second row under `a`. The operation changes nothing: `merged` is c, for a new array afterwards.
 */
export function mergeArrays(a: ArrayState, b: readonly string[], bId: string, room: MergeRoom): ArrayOperation & { merged: string[] } {
	const [n, m] = [a.values.length, b.length]
	const r = recorder(a, { comparisons: 0, copies: 0 })
	const c: string[] = Array(n + m).fill('')
	const title = `c: a new array of ${n} + ${m} = ${n + m}`
	const row = (marks: Record<number, MarkColor> = {}) => r.set({ ...r.state, aux: { title, values: [...c], marks, ...room } })
	let [i, j, k] = [0, 0, 0]
	const pointers = (): Pointer[] => [ptr('i', i), { id: '#j', name: 'j', at: otherKey(bId, String(j)) }, { id: '#k', name: 'k', at: `aux:${k}` }]
	const vars = () => {
		r.let('i', i)
		r.let('j', j)
		r.let('k', k)
	}

	row()
	r.step(`c = a new array of n + m = ${n} + ${m} = ${n + m} cells: merging copies every value into it`, { line: 'alloc', ask: false })
	vars()
	r.step('i = 0, j = 0, k = 0: the front of a, of b and of c', { pointers: pointers(), line: 'start', ask: false })
	while (i < n || j < m) {
		const both = i < n && j < m
		if (both) r.counts.comparisons++
		const fromA = both ? compareKeys(a.values[i], b[j]) <= 0 : i < n
		const [x, y] = [a.values[i], b[j]]
		const why = both
			? fromA
				? `a[${i}] = ${x} ≤ b[${j}] = ${y}: c[${k}] = a[${i}] = ${x}`
				: `b[${j}] = ${y} < a[${i}] = ${x}: c[${k}] = b[${j}] = ${y}`
			: fromA
				? `b is used up (j = ${m}): c[${k}] = a[${i}] = ${x}`
				: `a is used up (i = ${n}): c[${k}] = b[${j}] = ${y}`
		const ask = both ? { ask: `a[${i}] = ${x} vs b[${j}] = ${y}: which goes into c[${k}]?`, askFocus: [i] } : { ask: `Which value goes into c[${k}]?` }
		const from = fromA ? i : j
		c[k] = fromA ? x : y
		row({ [k]: LOOK })
		r.counts.copies++
		const to = k
		if (fromA) i++
		else j++
		k++
		vars()
		r.step(why, {
			pointers: pointers(),
			lit: fromA ? { [from]: LOOK } : {},
			others: fromA ? undefined : { [bId]: { [from]: LOOK } },
			moves: [[fromA ? from : otherKey(bId, String(from)), `aux:${to}`]],
			line: both ? (fromA ? 'left' : 'right') : fromA ? 'rest-left' : 'rest-right',
			...ask,
		})
	}
	row(Object.fromEntries(c.map((_, k) => [k, DONE])))
	r.step(
		`return c: ${n + m} values copied into new space after ${r.counts.comparisons} comparison${r.counts.comparisons === 1 ? '' : 's'}, a and b as they were. A linked list merges by re-pointing arrows instead, copying nothing`,
		{ pointers: pointers(), line: 'return', ask: false }
	)
	return { frames: r.frames, code: 'merge-arrays', merged: c }
}
