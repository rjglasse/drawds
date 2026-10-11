import type { Editor, TLShape } from 'tldraw'
import { putBeside } from '../../cells/beside'
import { followersOf } from '../../cells/followers'
import { newSeed } from '../../data/random'
import { MEMORY_TYPE, type MemoryShape } from './memory-shape-types'

/** The memory views following a structure. */
export const memoryViewsOf = (editor: Editor, structure: TLShape) =>
	followersOf(editor, structure.id).filter((s): s is MemoryShape => s.type === MEMORY_TYPE)

/** Show the structure in memory beside it, or take its memory away. One undo step either way. */
export function toggleMemoryView(editor: Editor, structure: TLShape) {
	const views = memoryViewsOf(editor, structure)
	if (views.length) {
		editor.markHistoryStoppingPoint('hide it in memory')
		editor.deleteShapes(views.map((v) => v.id))
		return
	}
	if (!editor.getShapePageBounds(structure)) return
	const { color, size } = structure.props as Pick<MemoryShape['props'], 'color' | 'size'>
	editor.markHistoryStoppingPoint('show it in memory')
	// Addresses read best in a monospaced font.
	putBeside<MemoryShape>(editor, structure, {
		type: MEMORY_TYPE,
		props: { structureId: structure.id, seed: newSeed(), color, size, font: 'mono' },
	})
}
