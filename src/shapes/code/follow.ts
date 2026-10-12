import type { Editor, TLShape, TLShapeId } from 'tldraw'
import { putBeside } from '../../cells/beside'
import { keepOnScreen } from '../../controls/onscreen'
import { followersOf } from '../../cells/followers'
import { algorithmCode } from './algorithms'
import { CODE_TYPE, type CodeShape } from './code-shape-types'
import { codeLanguage } from '../../transcript/mode'

// A code box can follow a structure (`structureId`), like a graph's views: while an operation with
// code plays on it (`playOperation`'s `code`), the box shows that algorithm's code, the line each
// step is on lit with a pc arrow beside it. The play bar's code button opens one or takes it away.

/** The code boxes following a structure that show what plays on it (not the code beside it, its transcript). */
export const codeBoxesOf = (editor: Editor, structureId: TLShapeId) =>
	followersOf(editor, structureId).filter((s): s is CodeShape => s.type === CODE_TYPE && !(s as CodeShape).props.transcript)


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

/**
 * A code box following `structure`, to its right past anything else following it, top-aligned; further
 * right or under it if something else is in the way there (an array being merged in: `putBeside`), the
 * camera moved if that is off the screen.
 */
function createCodeBox(editor: Editor, structure: TLShape, algorithm: string) {
	const code = algorithmCode(algorithm, codeLanguage(editor))!
	const { size } = structure.props as { size?: CodeShape['props']['size'] }
	const id = putBeside<CodeShape>(editor, structure, {
		type: CODE_TYPE,
		props: { structureId: structure.id, algorithm, code: code.text, language: code.language, ...(size ? { size } : {}) },
	})
	// Past whatever is in the way it can run off the screen (under the style panel): the camera pans to
	// it, never zooming out (code is read from the back of the room).
	if (id) keepOnScreen(editor, [id], { zoom: false })
}

/** The code boxes following a structure go, as one undo step. */
export function hideCodeOf(editor: Editor, structureId: TLShapeId) {
	const boxes = codeBoxesOf(editor, structureId)
	if (!boxes.length) return
	editor.markHistoryStoppingPoint('hide the code')
	editor.deleteShapes(boxes.map((b) => b.id))
}
