import { fillValues } from '../../data/fill'
import { createLineSketchTool } from '../../sketch/LineSketchTool'
import { ARRAY_SHAPE_TYPE, type ArrayShape } from './array-shape-types'
import { getArrayMetrics, getSketchPosition } from './layout'

/** Press and drag: the array grows by one cell every cell-width the pointer travels. */
export const ArrayShapeTool = createLineSketchTool<ArrayShape>({
	type: ARRAY_SHAPE_TYPE,
	step: (shape) => getArrayMetrics(shape.props).cell,
	layout(shape, origin, sketch) {
		const { fill, seed, kind } = shape.props
		// A queue lies in a row whichever way it is drawn; a stack grows up from the press point.
		const along = kind === 'queue' && sketch.direction !== 'horizontal' ? { ...sketch, direction: 'horizontal' as const, sign: 1 as const } : sketch
		return {
			...getSketchPosition(origin, along, getArrayMetrics(shape.props)),
			props: {
				direction: along.direction,
				// Index 0 is the left/top cell, so a sketch drawn leftwards or upwards is reversed (a
				// stack's index 0 is at the bottom, where the drag starts).
				values: fillValues(fill, seed, along.count, { reversed: along.sign < 0 && kind !== 'stack', range: shape.props.range }),
				// Every sketched cell is in use (fixed capacity: the grow grip adds spare slots).
				used: sketch.count,
			},
		}
	},
})
