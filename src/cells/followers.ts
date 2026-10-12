import type { Editor, TLShape, TLShapeId, TLShapePartial } from 'tldraw'

// Shapes that follow a structure and draw its steps too: a graph's views (`graphId`), a recursion
// tree (`structureId`). They are recorded, replayed and exported with it, the play bar goes under
// those beside it, and they go when it is deleted.

/** The structure `shape` follows, if it follows one. */
export function followedBy(shape: TLShape): string | undefined {
	const props = shape.props as { graphId?: unknown; structureId?: unknown }
	const id = props.structureId ?? props.graphId
	return typeof id === 'string' && id ? id : undefined
}

/** The shapes following `id`. */
export const followersOf = (editor: Editor, id: TLShapeId) => editor.getCurrentPageShapes().filter((s) => followedBy(s) === id)

/** A structure's followers go with it. Returns the cleanup. */
export function deleteFollowersWithTheirStructure(editor: Editor) {
	return editor.sideEffects.registerAfterDeleteHandler('shape', (deleted) => {
		const gone = followersOf(editor, deleted.id)
		if (gone.length) editor.deleteShapes(gone.map((s) => s.id))
	})
}

/** Meta key: a follower's size as last drawn (`keepFollowersMeasured`). */
const DRAWN_KEY = 'drawdsDrawn'

/**
 * A follower drawn from its structure (the code beside it, a graph's views, memory, a ring) changes
 * size while its own record stays the same, and tldraw measures a shape for hit-testing and culling
 * only when its record changes: a transcript grown long was found only where its first lines were.
 * So when a structure changes, each follower whose size changed gets it in its meta, in the same
 * change (one undo takes both back). Returns the cleanup.
 */
export function keepFollowersMeasured(editor: Editor) {
	return editor.sideEffects.registerAfterChangeHandler('shape', (_prev, next) => {
		for (const follower of followersOf(editor, next.id)) {
			const { w, h } = editor.getShapeGeometry(follower).bounds
			const drawn = { w: Math.round(w), h: Math.round(h) }
			const was = follower.meta[DRAWN_KEY] as { w?: number; h?: number } | undefined
			if (was?.w === drawn.w && was?.h === drawn.h) continue
			editor.updateShape({ id: follower.id, type: follower.type, meta: { ...follower.meta, [DRAWN_KEY]: drawn } } as TLShapePartial)
		}
	})
}

/**
 * The followers beside the structure (overlapping its height: a union-find, a tall matrix, a
 * recursion tree, a code box), as boxes in the structure's shape space. An operation's strips and
 * play bar keep clear of them, so they never cover one while it follows the steps.
 */
export function besideBoxes(editor: Editor, shape: TLShape): { x: number; y: number; w: number; h: number }[] {
	const own = editor.getShapePageBounds(shape)
	if (!own) return []
	return followersOf(editor, shape.id).flatMap((f) => {
		const b = editor.getShapePageBounds(f)
		if (!b || b.minY >= own.maxY || b.maxY <= own.minY) return []
		const at = editor.getPointInShapeSpace(shape, { x: b.minX, y: b.minY })
		return [{ x: at.x, y: at.y, w: b.w, h: b.h }]
	})
}
