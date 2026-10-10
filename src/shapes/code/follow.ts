import type { Editor, TLShape, TLShapeId } from 'tldraw'
import { followersOf } from '../../cells/followers'
import { algorithmCode } from './algorithms'
import { CODE_TYPE, CodeLanguageStyle, type CodeShape } from './code-shape-types'

// A code box can follow a structure (`structureId`), like a graph's views: while an operation with
// code plays on it (`playOperation`'s `code`), the box shows that algorithm's code, the line each
// step is on lit with a pc arrow beside it. The play bar's code button opens one or takes it away.

/** The code boxes following a structure. */
export const codeBoxesOf = (editor: Editor, structureId: TLShapeId) =>
	followersOf(editor, structureId).filter((s): s is CodeShape => s.type === CODE_TYPE)

/** Space between the structure and a new code box (its pc arrow has room of its own on top). */
const GAP = 16

/**
 * Show `algorithm`'s code beside a structure: in the code boxes following it (any other code there
 * replaced, marks and pointers with it), or, with `open`, in a new one to its right if none follows
 * it. One undo step; returns what puts things back as they were, if anything changed (cancelling an
 * operation leaves the board as it found it).
 */
export function showCodeOf(editor: Editor, structureId: TLShapeId, algorithm: string, { open }: { open: boolean }) {
	const structure = editor.getShape(structureId)
	if (!structure || !algorithmCode(algorithm, 'java')) return undefined
	const boxes = codeBoxesOf(editor, structureId)
	const stale = boxes.filter((b) => b.props.algorithm !== algorithm)
	if (boxes.length ? !stale.length : !open) return undefined
	const mark = editor.markHistoryStoppingPoint('show the code')
	if (boxes.length) {
		editor.updateShapes(
			stale.map((box) => {
				const code = algorithmCode(algorithm, box.props.language)!
				return { id: box.id, type: CODE_TYPE, props: { algorithm, code: code.text, language: code.language, marks: {}, pointers: [] } }
			})
		)
	} else {
		createCodeBox(editor, structure, algorithm)
	}
	return () => void editor.bailToMark(mark)
}

/** A code box following `structure`, to its right past anything else following it, top-aligned. */
function createCodeBox(editor: Editor, structure: TLShape, algorithm: string) {
	const bounds = editor.getShapePageBounds(structure)
	if (!bounds) return
	const right = Math.max(bounds.maxX, ...followersOf(editor, structure.id).map((f) => editor.getShapePageBounds(f)?.maxX ?? -Infinity))
	const code = algorithmCode(algorithm, editor.getStyleForNextShape(CodeLanguageStyle))!
	const { size } = structure.props as { size?: CodeShape['props']['size'] }
	editor.createShape<CodeShape>({
		type: CODE_TYPE,
		x: right + GAP,
		y: bounds.minY,
		props: { structureId: structure.id, algorithm, code: code.text, language: code.language, ...(size ? { size } : {}) },
	})
}

/** The code boxes following a structure go, as one undo step. */
export function hideCodeOf(editor: Editor, structureId: TLShapeId) {
	const boxes = codeBoxesOf(editor, structureId)
	if (!boxes.length) return
	editor.markHistoryStoppingPoint('hide the code')
	editor.deleteShapes(boxes.map((b) => b.id))
}
