import { fillValues } from '../../data/fill'
import { createLineSketchTool } from '../../sketch/LineSketchTool'
import { ARRAY_SHAPE_TYPE, type ArrayShape } from './array-shape-types'
import { getArrayMetrics, getSketchPosition } from './layout'

/** Press and drag: the array grows by one cell every cell-width the pointer travels. */
export const ArrayShapeTool = createLineSketchTool<ArrayShape>({
	type: ARRAY_SHAPE_TYPE,
	step: (shape) => getArrayMetrics(shape.props).cell,
	layout(shape, origin, sketch) {
		const { fill, seed } = shape.props
		return {
			...getSketchPosition(origin, sketch, getArrayMetrics(shape.props)),
			props: {
				direction: sketch.direction,
				// Index 0 is the left/top cell, so a sketch drawn leftwards or upwards is reversed.
				values: fillValues(fill, seed, sketch.count, { reversed: sketch.sign < 0 }),
				// Every sketched cell is in use (fixed capacity: the grow grip adds spare slots).
				used: sketch.count,
			},
		}
	},
})
