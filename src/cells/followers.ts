import type { Editor, TLShape, TLShapeId } from 'tldraw'

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

/**
 * `bottom` (shape space), or lower if a follower beside the structure (overlapping its height: a
 * union-find, a tall matrix, a recursion tree) reaches further down: strips and the play bar go
 * under that, so they never cover it while it follows the steps.
 */
export function bottomBeside(editor: Editor, shape: TLShape, bottom: number): number {
	const own = editor.getShapePageBounds(shape)
	if (!own) return bottom
	const beside = followersOf(editor, shape.id).flatMap((f) => {
		const b = editor.getShapePageBounds(f)
		return b && b.minY < own.maxY && b.maxY > own.minY ? [editor.getPointInShapeSpace(shape, { x: b.minX, y: b.maxY }).y] : []
	})
	return Math.max(bottom, ...beside)
}
