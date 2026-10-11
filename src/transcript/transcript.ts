import { createShapeId, type Editor, type TLShape, type TLShapeId } from 'tldraw'
import { followedBy, followersOf } from '../cells/followers'
import type { CodeLanguage } from '../shapes/code/highlight'
import { CODE_TYPE, CodeLanguageStyle, type CodeShape } from '../shapes/code/code-shape-types'
import { algorithmCode } from '../shapes/code/algorithms'
import { playbackFor } from '../nodelink/playback'
import { isLogged, isSketching, logOrStart } from './log'
import { codeLanguage, codeMode, setCodeMode } from './mode'
import type { ArrayMove } from './array-moves'
import type { ListMove } from './list-moves'
import { renderArrayLog, renderGraphLog, renderHashLog, renderHeapLog, renderListLog, renderMatrixLog, renderTreeLog, renderUnionFindLog } from './render'
import type { GraphMove } from './graph-moves'
import type { HeapMove } from './heap-moves'
import type { HashMove } from './hash-moves'
import type { MatrixMove } from './matrix-moves'
import type { UnionFindMove } from './union-find-moves'
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
	if (structure.type === 'heap') return renderHeapLog(log as HeapMove[], language)
	if (structure.type === 'hash-table') return renderHashLog(log as HashMove[], language)
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

/** Space between a structure and its transcript (a code box's pc room is on its left). */
const GAP = 16

/** A grow grip's radius at 100% (`GrowGrip`): a grip outside the structure's box still needs room. */
const GRIP = 9

/** Every shape on the board, page by page. */
const everyShape = (editor: Editor): TLShape[] =>
	editor.getPages().flatMap((page) => [...editor.getPageShapeIds(page.id)].flatMap((id) => editor.getShape(id) ?? []))

const isTranscript = (s: TLShape): s is CodeShape => s.type === CODE_TYPE && (s as CodeShape).props.transcript

interface Rect {
	x: number
	y: number
	w: number
	h: number
}

/**
 * Where the code beside a structure goes (`box`: where it would go, to the structure's right; page
 * space): there if nothing else is in the way, else under the structure, past anything in the way
 * there. `gap` from the structure, half that clear of anything else. How far to move it.
 */
export function codeSpot(structure: Rect, box: Rect, others: readonly Rect[], gap = GAP): { x: number; y: number } {
	const clear = gap / 2
	const hit = (x: number, y: number) => others.find((o) => o.x < x + box.w + clear && o.x + o.w + clear > x && o.y < y + box.h + clear && o.y + o.h + clear > y)
	if (!hit(box.x, box.y)) return { x: 0, y: 0 }
	let y = structure.y + structure.h + gap
	for (let o = hit(structure.x, y); o; o = hit(structure.x, y)) y = o.y + o.h + clear
	return { x: structure.x - box.x, y: y - box.y }
}

/**
 * A transcript box to a structure's right, past its grips (a matrix's column grip sits outside its
 * box) and anything already following it, top-aligned, on its page; under it if something else is
 * in the way there (`codeSpot`).
 */
function addTranscript(editor: Editor, structure: TLShape) {
	const bounds = editor.getShapePageBounds(structure)
	const page = editor.getAncestorPageId(structure)
	if (!bounds || !page) return
	const shapes = [...editor.getPageShapeIds(page)].flatMap((id) => editor.getShape(id) ?? [])
	const transform = editor.getShapePageTransform(structure)
	const grips = (editor.getShapeHandles(structure) ?? []).map((h) => transform.applyToPoint(h).x + GRIP)
	const followers = shapes.filter((s) => followedBy(s) === structure.id)
	const right = Math.max(bounds.maxX, ...grips, ...followers.map((f) => editor.getShapePageBounds(f)?.maxX ?? -Infinity))
	const { size } = structure.props as { size?: CodeShape['props']['size'] }
	const id = createShapeId()
	const [x, y] = [right + GAP, bounds.minY]
	editor.createShape<CodeShape>({
		id,
		type: CODE_TYPE,
		parentId: page,
		x,
		y,
		props: { structureId: structure.id, transcript: true, language: codeLanguage(editor), ...(size ? { size } : {}) },
	})
	// Its size is known once it is made (its text is the structure's code).
	const box = editor.getShapePageBounds(id)
	if (!box) return
	const others = shapes.filter((s) => s.id !== structure.id).flatMap((s) => editor.getShapePageBounds(s) ?? [])
	const by = codeSpot(bounds, box, others)
	if (by.x || by.y) editor.updateShape<CodeShape>({ id, type: CODE_TYPE, x: x + by.x, y: y + by.y })
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
