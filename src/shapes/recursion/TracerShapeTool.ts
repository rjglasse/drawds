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
	// Its call stack is above where it was placed: placed near the top of the screen, it moves down so the
	// stack (and sayHello's overflow, its point) shows; near the bottom, up so the code does, the top first.
	settle(editor, id) {
		const [shape, bounds] = [editor.getShape(id), editor.getShapePageBounds(id)]
		if (!shape || !bounds) return
		const view = editor.getViewportPageBounds()
		const zoom = editor.getZoomLevel()
		const [top, bottom] = [view.minY + MARGIN.top / zoom, view.maxY - MARGIN.bottom / zoom]
		const dy = bounds.minY < top ? top - bounds.minY : bounds.maxY > bottom ? Math.max(top - bounds.minY, bottom - bounds.maxY) : 0
		if (dy) editor.updateShape<TracerShape>({ id, type: TRACER_TYPE, y: shape.y + dy })
	},
})

/** Room kept clear on screen (px): the menus above, the toolbar below. */
const MARGIN = { top: 64, bottom: 96 }
