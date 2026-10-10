import { StyleProp, type Editor, type TLShape, type TLShapePartial } from 'tldraw'
import { FILL_MODES, FILL_RANGES, type FillMode, type FillRange } from './fill'

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
