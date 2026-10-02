import type { Editor, TLShape } from 'tldraw'
import { CellShapeUtil } from './CellShapeUtil'
import { toggleMark, type MarkColor } from './marks'

export interface MarkTarget {
	shape: TLShape
	util: CellShapeUtil<TLShape>
	/** The cell or node under the pointer; undefined when the pointer is on the shape but not on one. */
	key?: string
}

/** The shape with cells under the pointer, and the cell or node the pointer is on, if any. */
export function markTargetUnderPointer(editor: Editor): MarkTarget | undefined {
	const point = editor.inputs.getCurrentPagePoint()
	const shape = editor.getShapeAtPoint(point, { hitInside: true })
	if (!shape) return undefined
	const util = editor.getShapeUtil(shape)
	if (!(util instanceof CellShapeUtil)) return undefined
	const key = util.cells.cellAt(shape, editor.getPointInShapeSpace(shape, point))
	return { shape, util: util as CellShapeUtil<TLShape>, key }
}

/** Set (or, with the same colour or null, clear) the mark on the target element. One undo step. */
export function markElement(editor: Editor, target: MarkTarget | undefined, color: MarkColor | null) {
	const shape = target && editor.getShape(target.shape.id)
	if (!target || !shape || target.key === undefined) return
	editor.markHistoryStoppingPoint('mark element')
	editor.updateShape(target.util.withMarks(shape, toggleMark(target.util.getMarks(shape), target.key, color)))
}

export function clearMarks(editor: Editor, target: MarkTarget | undefined) {
	const shape = target && editor.getShape(target.shape.id)
	if (!target || !shape || !Object.keys(target.util.getMarks(shape)).length) return
	editor.markHistoryStoppingPoint('clear marks')
	editor.updateShape(target.util.withMarks(shape, {}))
}
