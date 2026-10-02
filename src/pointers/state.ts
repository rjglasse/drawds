import { atom, type Atom, type Editor, type TLShapeId, type VecLike } from 'tldraw'

/** The pointer picked up by clicking it: arrow keys step it, Delete removes it, Enter renames it. */
export interface PointerFocus {
	shapeId: TLShapeId
	pointerId: string
}

/** A pointer being dragged to another element. */
export interface PointerDrag {
	shapeId: TLShapeId
	pointerId: string
	/** The pointer's position, in shape space. */
	at: VecLike
	/** The element it would land on. */
	target?: string
}

/** The name prompt: for a new pointer at an element, or to rename one. */
export interface PointerPrompt {
	shapeId: TLShapeId
	at: string
	pointerId?: string
}

interface PointerState {
	focus: Atom<PointerFocus | null>
	drag: Atom<PointerDrag | null>
	prompt: Atom<PointerPrompt | null>
}

const states = new WeakMap<Editor, PointerState>()

export function pointerState(editor: Editor): PointerState {
	let state = states.get(editor)
	if (!state) {
		state = { focus: atom('pointer focus', null), drag: atom('pointer drag', null), prompt: atom('pointer prompt', null) }
		states.set(editor, state)
	}
	return state
}
