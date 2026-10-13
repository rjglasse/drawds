import { StyleProp, type Editor, type TLShape, type TLShapeId, type TLShapePartial } from 'tldraw'
import { FILL_MODES, FILL_RANGES, type FillMode, type FillRange } from './fill'
import { newSeed } from './random'

/** Fill mode as a tldraw style: shown in the style panel and remembered for the next shape. */
export const FillStyle = StyleProp.defineEnum('drawds:fill', {
	defaultValue: 'random' as FillMode,
	values: FILL_MODES,
})

/** The numbers random fills draw from: 0-2, 0-9, 0-99, 0-999 or -50..50. */
export const FillRangeStyle = StyleProp.defineEnum('drawds:fill-range', {
	defaultValue: 'medium' as FillRange,
	values: FILL_RANGES,
})

/** A shape util that can regenerate its values after its fill mode changes. */
export interface Refillable {
	refill(shape: TLShape): TLShapePartial
}

function isRefillable(util: object): util is Refillable {
	return typeof (util as Partial<Refillable>).refill === 'function'
}

/** Regenerate the values of the selected shapes from their (new) fill mode, range and seed. */
export function refillSelectedShapes(editor: Editor) {
	const updates = editor
		.getSelectedShapes()
		.flatMap((shape) => {
			const util = editor.getShapeUtil(shape)
			return isRefillable(util) ? [util.refill(shape)] : []
		})
	if (updates.length) editor.updateShapes(updates)
}

/**
 * A shape util whose random content isn't a fill (a trie's words, a graph's weights) but can be drawn
 * again from its seed: New words, New weights. Not `refill`, so a fill picked for other shapes selected
 * with it leaves it alone.
 */
export interface Redrawable {
	redraw(shape: TLShape): TLShapePartial
}

/**
 * New values (a structure's New values, New words...): the shape refilled (or redrawn) from a new seed,
 * its fill and range as they are, one undo step. A structure keeps what makes it one (a BST's order, a heap's).
 */
export function rerollShape(editor: Editor, id: TLShapeId, label = 'new values') {
	const shape = editor.getShape(id)
	const util = shape && (editor.getShapeUtil(shape) as Partial<Refillable & Redrawable>)
	const draw = util?.redraw ?? util?.refill
	if (!shape || !util || !draw) return
	const seed = newSeed()
	const refilled = draw.call(util, { ...shape, props: { ...shape.props, seed } } as TLShape)
	editor.markHistoryStoppingPoint(label)
	editor.updateShape({ ...refilled, props: { ...refilled.props, seed } } as TLShapePartial)
}
