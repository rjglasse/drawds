import type { Editor, TLShape, TLShapeId } from 'tldraw'
import { followersOf } from '../cells/followers'
import type { CodeLanguage } from '../shapes/code/highlight'
import { CODE_TYPE, CodeLanguageStyle, type CodeShape } from '../shapes/code/code-shape-types'
import { logOrStart } from './log'
import type { ArrayMove } from './array-moves'
import type { ListMove } from './list-moves'
import { renderArrayLog, renderGraphLog, renderListLog, renderTreeLog } from './render'
import type { GraphMove } from './graph-moves'
import type { TreeMove } from './tree-moves'

// The code beside a structure: a code box following it (`structureId`) with `transcript` on, whose
// text is the structure's log written out in the box's language, worked out as it is drawn (so an
// undo, a board loaded or a change of language shows at once, with nothing to keep in step).

/** A structure's moves written out in `language`. */
export function transcriptOf(editor: Editor, structure: TLShape, language: CodeLanguage): string {
	const log = logOrStart(editor, structure)
	if (structure.type === 'linked-list') return renderListLog(log as ListMove[], language)
	// A BST's nodes hold keys, as its code calls them.
	if (structure.type === 'binary-tree') return renderTreeLog(log as TreeMove[], language, (structure.props as { kind?: string }).kind === 'bst' ? 'key' : 'value')
	if (structure.type === 'graph') {
		// Directed or not, weights written or not: as the graph is drawn now.
		const { direction, weights } = structure.props as { direction?: string; weights?: string }
		return renderGraphLog(log as GraphMove[], language, { directed: direction === 'directed', weighted: weights === 'weighted' })
	}
	return renderArrayLog(log as ArrayMove[], language)
}

/** The transcript boxes following a structure. */
export const transcriptsOf = (editor: Editor, id: TLShapeId) =>
	followersOf(editor, id).filter((s): s is CodeShape => s.type === CODE_TYPE && (s as CodeShape).props.transcript)

/** Space between a structure and its transcript (a code box's pc room is on its left). */
const GAP = 16

/**
 * Show the code beside a structure, or take it away: a transcript box to its right, past anything
 * already following it, top-aligned; or every transcript it has gone. One undo step either way.
 */
export function toggleTranscript(editor: Editor, structure: TLShape) {
	const boxes = transcriptsOf(editor, structure.id)
	if (boxes.length) {
		editor.markHistoryStoppingPoint('hide the code beside it')
		editor.deleteShapes(boxes.map((b) => b.id))
		return
	}
	const bounds = editor.getShapePageBounds(structure)
	if (!bounds) return
	const right = Math.max(bounds.maxX, ...followersOf(editor, structure.id).map((f) => editor.getShapePageBounds(f)?.maxX ?? -Infinity))
	const { size } = structure.props as { size?: CodeShape['props']['size'] }
	editor.markHistoryStoppingPoint('show the code beside it')
	editor.createShape<CodeShape>({
		type: CODE_TYPE,
		x: right + GAP,
		y: bounds.minY,
		props: { structureId: structure.id, transcript: true, language: editor.getStyleForNextShape(CodeLanguageStyle), ...(size ? { size } : {}) },
	})
}
