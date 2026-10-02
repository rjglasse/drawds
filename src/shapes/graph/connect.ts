import { atom, type Atom, type Editor, type TLShapeId, type VecLike } from 'tldraw'
import type { Scene } from '../../nodelink/scene'

/** Handle id of a node's connect grip: drag it to another node, or to empty space. */
const PREFIX = 'connect:'
export const connectHandleId = (nodeId: string) => PREFIX + nodeId
export function nodeOfConnectHandle(id: string): string | undefined {
	return id.startsWith(PREFIX) ? id.slice(PREFIX.length) : undefined
}

/** Where a connect drag would end: on another node, or a new node at the pointer. */
export type ConnectTarget = { kind: 'node'; id: string } | { kind: 'new' }

/** A connect grip being dragged: drawn as a dashed edge from `from` to the pointer. */
export interface ConnectDrag {
	shapeId: TLShapeId
	from: string
	/** Pointer, in shape space. */
	at: VecLike
	target: ConnectTarget | undefined
}

const states = new WeakMap<Editor, Atom<ConnectDrag | null>>()

export function connectState(editor: Editor): Atom<ConnectDrag | null> {
	let state = states.get(editor)
	if (!state) {
		state = atom('graph connect drag', null)
		states.set(editor, state)
	}
	return state
}

/**
 * What dropping a connect drag from `from` at `at` would do: connect to the node under the pointer
 * (a little outside its rim counts), or make a new node there if it has room. Nothing over the
 * source node, or too close to a node to fit a new one.
 */
export function connectTarget(scene: Scene, from: string, at: VecLike): ConnectTarget | undefined {
	let nearest: { id: string; d: number; r: number } | undefined
	for (const n of scene.nodes) {
		const d = Math.hypot(at.x - n.x, at.y - n.y)
		if (!nearest || d - n.w / 2 < nearest.d - nearest.r) nearest = { id: n.key, d, r: n.w / 2 }
	}
	if (!nearest) return { kind: 'new' }
	if (nearest.d <= nearest.r * 1.25) return nearest.id === from ? undefined : { kind: 'node', id: nearest.id }
	// A new node is a cell across: keep it clear of the others.
	return nearest.d >= nearest.r * 2.4 ? { kind: 'new' } : undefined
}
