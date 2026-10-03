import { atom, type Atom, type Editor, type TLShapeId, type VecLike } from 'tldraw'
import { swapMarks, type Marks } from '../../cells/marks'

/** Handle id for dragging cell `i`'s value onto another cell. */
export const cellHandleId = (i: number) => `cell:${i}`
export function cellOfHandle(id: string): number | undefined {
	return id.startsWith('cell:') ? Number(id.slice(5)) : undefined
}

/** A cell being dragged onto another: drawn as a ghost value at the pointer, target highlighted. */
export interface SwapDrag {
	shapeId: TLShapeId
	from: number
	to: number | undefined
	/** Pointer position, in shape space. */
	at: VecLike
}

/**
 * Values that just moved to other cells (a swap, a sort, a shift), so they can slide there once:
 * new index -> the index its value came from.
 */
export interface Slides {
	from: Record<number, number>
	/** Changes with every move, so the animation restarts. */
	id: number
	/** How long the slide takes (shorter while an operation plays fast). */
	ms?: number
}

/** The latest swap (or rearrangement) on a shape, animated once. */
export interface LastSlides extends Slides {
	shapeId: TLShapeId
}

interface SwapState {
	drag: Atom<SwapDrag | null>
	last: Atom<LastSlides | null>
}

const states = new WeakMap<Editor, SwapState>()

export function swapState(editor: Editor): SwapState {
	let state = states.get(editor)
	if (!state) {
		state = { drag: atom('array swap drag', null), last: atom('array last swap', null) }
		states.set(editor, state)
	}
	return state
}

/** Values and marks with cells `a` and `b` exchanged (marks travel with their values). */
export function swapCells(values: readonly string[], marks: Marks, a: number, b: number) {
	const next = [...values]
	;[next[a], next[b]] = [next[b], next[a]]
	return { values: next, marks: swapMarks(marks, String(a), String(b)) }
}

/** Slides for a frame's swapped pairs and copied values (cell keys are indices). */
export function frameSlides(swaps: readonly [string, string][] = [], moves: readonly [string, string][] = []) {
	const from: Record<number, number> = {}
	for (const [a, b] of swaps) {
		from[Number(a)] = Number(b)
		from[Number(b)] = Number(a)
	}
	for (const [a, b] of moves) from[Number(b)] = Number(a)
	return from
}

/** Slides for a rearrangement: `order[i]` is the old index of the value now at i. */
export function orderSlides(order: readonly number[]) {
	const from: Record<number, number> = {}
	order.forEach((j, i) => {
		if (j !== i) from[i] = j
	})
	return from
}
