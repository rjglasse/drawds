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

/** The latest swap, so the two values can animate into their new cells once. */
export interface LastSwap {
	shapeId: TLShapeId
	a: number
	b: number
	id: number
}

interface SwapState {
	drag: Atom<SwapDrag | null>
	last: Atom<LastSwap | null>
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
