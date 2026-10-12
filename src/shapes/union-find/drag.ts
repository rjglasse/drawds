import { atom, type Atom, type Editor, type TLShapeId, type VecLike } from 'tldraw'
import { hoveredNode } from '../../nodelink/hover'
import type { Scene } from '../../nodelink/scene'
import { elementOfKey } from './layout'

// Union by a gesture (dds-55z.34.2): each element has a grip on its right rim (a 'create' handle,
// drawn on hover as a graph's connect grip is); dragged onto another element, or its cell in the
// parent array, it plays union(a, b) step by step.

const PREFIX = 'union:'
export const unionHandleId = (i: number) => `${PREFIX}${i}`
export function elementOfUnionHandle(id: string): number | undefined {
	return id.startsWith(PREFIX) ? Number(id.slice(PREFIX.length)) : undefined
}

/** A union grip being dragged: a dashed line from `from` to the pointer, ringing the element it would union with. */
export interface UnionDrag {
	shapeId: TLShapeId
	from: number
	/** Pointer, in shape space. */
	at: VecLike
	target?: number
}

const states = new WeakMap<Editor, Atom<UnionDrag | null>>()

export function unionDragState(editor: Editor): Atom<UnionDrag | null> {
	let state = states.get(editor)
	if (!state) states.set(editor, (state = atom('union-find drag', null)))
	return state
}

/** The element a drop at `at` would union with: under the pointer, as a node or its parent cell; not `from` itself. */
export function unionTarget(scene: Scene, from: number, at: VecLike): number | undefined {
	const key = hoveredNode(
		scene.nodes.filter((n) => elementOfKey(n.key) !== undefined && (n.kind === 'circle' || n.kind === 'box')),
		at,
		4
	)
	const j = key === undefined ? undefined : elementOfKey(key)
	return j === from ? undefined : j
}
