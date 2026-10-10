import { atom, type Atom, type Editor, type TLShape, type TLShapeId, type TLShapePartial, type VecLike } from 'tldraw'

/**
 * Identifies one editable cell within a shape: an index for arrays, and later "r,c" for matrices,
 * a node id for trees and graphs, and so on.
 */
export type CellKey = string

/** `next`/`prev` follow reading order; the arrows are spatial and may have no neighbour. */
export type CellDirection = 'next' | 'prev' | 'left' | 'right' | 'up' | 'down'

export interface CellBox {
	x: number
	y: number
	w: number
	h: number
	/** Draw the inline editor as a circle (circle nodes). */
	round?: boolean
}

/**
 * What a data-structure shape implements to get in-place cell editing. Points and boxes are in
 * shape space.
 */
export interface EditableCells<S extends TLShape> {
	cellAt(shape: S, point: VecLike): CellKey | undefined
	/** Cell to edit when editing starts without the pointer over a cell, e.g. by pressing Enter. */
	firstCell(shape: S): CellKey | undefined
	cellBox(shape: S, key: CellKey): CellBox
	getValue(shape: S, key: CellKey): string
	setValue(shape: S, key: CellKey, value: string): TLShapePartial<S>
	neighbor(shape: S, key: CellKey, direction: CellDirection): CellKey | undefined
}

export interface EditingCell {
	shapeId: TLShapeId
	key: CellKey
	/** History mark taken when this cell's edit began, so Esc can revert just this cell. */
	markId: string
}

const editingCells = new WeakMap<Editor, Atom<EditingCell | null>>()

function editingCellAtom(editor: Editor) {
	let cell = editingCells.get(editor)
	if (!cell) {
		cell = atom<EditingCell | null>('editing cell', null)
		editingCells.set(editor, cell)
	}
	return cell
}

/** The cell currently being edited, if any. Reactive. */
export function getEditingCell(editor: Editor): EditingCell | null {
	return editingCellAtom(editor).get()
}

/**
 * Start editing a cell. Each cell edit is its own undo step, unless it goes on from `markId` (a shape
 * created to be typed into: one undo takes both back).
 */
export function beginCellEdit(editor: Editor, shapeId: TLShapeId, key: CellKey, markId = editor.markHistoryStoppingPoint('edit cell')) {
	editingCellAtom(editor).set({ shapeId, key, markId })
}

export function endCellEdit(editor: Editor, shapeId: TLShapeId) {
	const cell = editingCellAtom(editor)
	if (cell.get()?.shapeId === shapeId) cell.set(null)
}
