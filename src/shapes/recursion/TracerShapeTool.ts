import { createDragTool } from '../../sketch/LineSketchTool'
import { CELL_SIZES } from '../sizes'
import { TRACER_TYPE, type TracerShape } from './tracer-shape-types'

/**
 * Click to place a tracer: main's frame at the press point (its left end), the call stack above it
 * and the code below. The Function picker (while the tool is active) chooses what it runs.
 */
export const TracerShapeTool = createDragTool<TracerShape, Record<string, never>>({
	type: TRACER_TYPE,
	initial: {},
	next: () => ({}),
	same: () => true,
	layout(shape, origin) {
		// Main's frame is 2.2 font sizes tall (tracerLayout); its middle goes at the press.
		return { x: origin.x, y: origin.y - CELL_SIZES[shape.props.size] * 0.3 * 1.1, props: {} }
	},
})
