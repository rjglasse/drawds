import type { Editor, TLShape, TLShapeId } from 'tldraw'
import { putBeside } from '../cells/beside'
import { followersOf } from '../cells/followers'
import type { CodeLanguage } from '../shapes/code/highlight'
import { CODE_TYPE, CodeLanguageStyle, type CodeShape } from '../shapes/code/code-shape-types'
import { algorithmCode } from '../shapes/code/algorithms'
import { playbackFor } from '../nodelink/playback'
import { isLogged, isSketching, logOrStart, type Move } from './log'
import { codeLanguage, codeMode, setCodeMode } from './mode'
import type { ArrayMove } from './array-moves'
import type { ListMove } from './list-moves'
import { renderArrayLog, renderGraphLog, renderHashLog, renderGeneralTreeLog, renderHeapLog, renderTrieLog, renderListLog, renderMatrixLog, renderTreeLog, renderUnionFindLog, type HashClassOf } from './render'
import type { GraphMove } from './graph-moves'
import type { HeapMove } from './heap-moves'
import type { HashMove } from './hash-moves'
import type { MatrixMove } from './matrix-moves'
import type { UnionFindMove } from './union-find-moves'
import type { TreeMove } from './tree-moves'
import type { GeneralTreeMove } from './general-tree-moves'
import type { TrieMove } from './trie-moves'

// The code beside a structure: a code box following it (`structureId`) with `transcript` on, whose
// text is the structure's log written out in the box's language, worked out as it is drawn (so an
// undo, a board loaded or a change of language shows at once, with nothing to keep in step).

/** A structure's moves written out in `language`. */
export function transcriptOf(editor: Editor, structure: TLShape, language: CodeLanguage): string {
	return renderLog(structure, logOrStart(editor, structure), language)
}

/** A structure's log written out in `language`, as its kind writes it (`hashClass`: a whole board's script names each scheme's class). */
export function renderLog(structure: TLShape, log: readonly Move[], language: CodeLanguage, hashClass?: HashClassOf): string {
	if (structure.type === 'linked-list') return renderListLog(log as ListMove[], language)
	// A BST's nodes hold keys, as its code calls them.
	if (structure.type === 'binary-tree') return renderTreeLog(log as TreeMove[], language, (structure.props as { kind?: string }).kind === 'bst' ? 'key' : 'value')
	if (structure.type === 'general-tree') return renderGeneralTreeLog(log as GeneralTreeMove[], language)
	if (structure.type === 'trie') return renderTrieLog(log as TrieMove[], language)
	if (structure.type === 'heap') return renderHeapLog(log as HeapMove[], language)
	if (structure.type === 'hash-table') return renderHashLog(log as HashMove[], language, hashClass)
	if (structure.type === 'matrix') return renderMatrixLog(log as MatrixMove[], language)
	if (structure.type === 'union-find') return renderUnionFindLog(log as UnionFindMove[], language)
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

/** Every shape on the board, page by page. */
const everyShape = (editor: Editor): TLShape[] =>
	editor.getPages().flatMap((page) => [...editor.getPageShapeIds(page.id)].flatMap((id) => editor.getShape(id) ?? []))

const isTranscript = (s: TLShape): s is CodeShape => s.type === CODE_TYPE && (s as CodeShape).props.transcript

/** A transcript box beside a structure (`putBeside`), its size the structure's. */
function addTranscript(editor: Editor, structure: TLShape) {
	const { size } = structure.props as { size?: CodeShape['props']['size'] }
	putBeside<CodeShape>(editor, structure, {
		type: CODE_TYPE,
		props: { structureId: structure.id, transcript: true, language: codeLanguage(editor), ...(size ? { size } : {}) },
	})
}

/** Show the code beside a structure, or take it away (every transcript it has). One undo step either way. */
export function toggleTranscript(editor: Editor, structure: TLShape) {
	const boxes = transcriptsOf(editor, structure.id)
	if (boxes.length) {
		editor.markHistoryStoppingPoint('hide the code beside it')
		editor.deleteShapes(boxes.map((b) => b.id))
		return
	}
	if (!editor.getShapePageBounds(structure)) return
	editor.markHistoryStoppingPoint('show the code beside it')
	addTranscript(editor, structure)
}

/**
 * Track with code on: the code beside every structure on the board that has none (one undo step);
 * off: every structure's code taken away. The setting itself stays out of undo (`setCodeMode`).
 */
export function trackWithCode(editor: Editor, on: boolean) {
	setCodeMode(editor, { on })
	const shapes = everyShape(editor)
	if (on) {
		const shown = new Set(shapes.filter(isTranscript).map((b) => b.props.structureId))
		const bare = shapes.filter((s) => isLogged(s) && !shown.has(s.id))
		if (!bare.length) return
		editor.markHistoryStoppingPoint('show the code beside every structure')
		bare.forEach((s) => addTranscript(editor, s))
		return
	}
	const boxes = shapes.filter(isTranscript)
	if (!boxes.length) return
	editor.markHistoryStoppingPoint('hide the code beside every structure')
	editor.deleteShapes(boxes.map((b) => b.id))
}

/**
 * The board's code in `language` from now on: the code beside every structure switches to it, and
 * the algorithms shown beside them (as drawds wrote them: one typed into stays as it is), one undo
 * step; new code boxes start in it.
 */
export function codeIn(editor: Editor, language: CodeLanguage) {
	setCodeMode(editor, { language })
	editor.setStyleForNextShapes(CodeLanguageStyle, language)
	const switched = everyShape(editor).filter((s): s is CodeShape => {
		if (s.type !== CODE_TYPE) return false
		const { transcript, structureId, algorithm, code, language: was } = (s as CodeShape).props
		if (was === language) return false
		if (transcript) return true
		// CodeShapeUtil.onBeforeUpdate swaps the code for this language's.
		return !!structureId && !!algorithm && algorithmCode(algorithm, language)?.language === language && algorithmCode(algorithm, was)?.text === code
	})
	if (!switched.length) return
	editor.markHistoryStoppingPoint(`code in ${language}`)
	editor.updateShapes(switched.map((b) => ({ id: b.id, type: CODE_TYPE, props: { language } })))
}

/**
 * While tracking with code, a new structure gets the code beside it once it is drawn (where its
 * drag ends), in the undo step that made it. Not one an undo brings back (its own box, if it had
 * one, comes back with it; adding one would cost the redo), nor one a lesson replay puts back (an
 * operation open on it), nor a board loaded (no side effects). Returns the cleanup.
 */
export function startTrackingWithCode(editor: Editor) {
	const pending = new Set<TLShapeId>()
	const created = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (source === 'user' && isLogged(shape) && codeMode(editor).on) pending.add(shape.id)
	})
	const tick = () => {
		for (const id of pending) {
			const shape = editor.getShape(id)
			if (shape && isSketching(editor, shape)) continue
			pending.delete(id)
			if (shape && !editor.getCanRedo() && !playbackFor(editor, id) && !transcriptsOf(editor, id).length) addTranscript(editor, shape)
		}
	}
	editor.on('tick', tick)
	return () => {
		created()
		editor.off('tick', tick)
	}
}
