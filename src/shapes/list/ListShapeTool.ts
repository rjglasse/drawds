import { fillValues } from '../../data/fill'
import { createLineSketchTool } from '../../sketch/LineSketchTool'
import { getListMetrics, listHeadCentre, sketchDirection } from './layout'
import { LIST_SHAPE_TYPE, type ListShape } from './list-shape-types'

/** Press and drag: a new node appears every node + arrow length the pointer travels. */
export const ListShapeTool = createLineSketchTool<ListShape>({
	type: LIST_SHAPE_TYPE,
	step: (shape) => getListMetrics(shape.props.size, shape.props.links === 'doubly').step,
	layout(shape, origin, sketch) {
		const { fill, seed, range } = shape.props
		const direction = sketchDirection(sketch)
		// List order is drag order: the head is where the drag started.
		const nodes = fillValues(fill, seed, sketch.count, { range }).map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 }))
		const head = listHeadCentre({ ...shape.props, nodes, direction })
		return { x: origin.x - head.x, y: origin.y - head.y, props: { direction, nodes } }
	},
})
