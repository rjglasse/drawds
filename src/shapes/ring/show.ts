import type { Editor, TLShape } from 'tldraw'
import { putBeside } from '../../cells/beside'
import { followersOf } from '../../cells/followers'
import { RING_TYPE, type RingShape } from './ring-shape-types'

/** The ring views following a structure. */
export const ringViewsOf = (editor: Editor, structure: TLShape) =>
	followersOf(editor, structure.id).filter((s): s is RingShape => s.type === RING_TYPE)

/** Show a circular buffer as a ring beside it, or take the ring away. One undo step either way. */
export function toggleRingView(editor: Editor, structure: TLShape) {
	const views = ringViewsOf(editor, structure)
	if (views.length) {
		editor.markHistoryStoppingPoint('hide the ring')
		editor.deleteShapes(views.map((v) => v.id))
		return
	}
	if (!editor.getShapePageBounds(structure)) return
	const { color, size, font } = structure.props as Pick<RingShape['props'], 'color' | 'size' | 'font'>
	editor.markHistoryStoppingPoint('show it as a ring')
	putBeside<RingShape>(editor, structure, { type: RING_TYPE, props: { structureId: structure.id, color, size, font } })
}
