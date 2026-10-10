import { createDragTool } from '../../sketch/LineSketchTool'
import { INITIAL_GRAPH_SKETCH, generateGraph, nextGraphSketch, type GraphSketch } from './generate'
import { GRAPH_SHAPE_TYPE, type GraphShape } from './graph-shape-types'
import { getGraphMetrics } from './layout'

/**
 * Press and drag a free path: a node drops every few cells along it, and its edges to nearby
 * earlier nodes appear as it lands (see `generateGraph`), so the graph grows under the pointer.
 */
export const GraphShapeTool = createDragTool<GraphShape, GraphSketch>({
	type: GRAPH_SHAPE_TYPE,
	initial: INITIAL_GRAPH_SKETCH,
	next(shape, offset, previous) {
		const { cell } = getGraphMetrics(shape.props.size)
		return nextGraphSketch(previous, { x: offset.x / cell, y: offset.y / cell })
	},
	same: (a, b) => a.points.length === b.points.length,
	layout(shape, origin, { points }) {
		const { seed, labels, size, density, parts, order } = shape.props
		const { cell } = getGraphMetrics(size)
		const { nodes, edges } = generateGraph(points, seed, labels, { density, parts, order })
		// Shape space starts at the nodes' top-left corner; the first node stays under the press (a
		// complete graph's are round a circle, not along the drag).
		const left = Math.min(...nodes.map((p) => p.x)) - 0.5
		const top = Math.min(...nodes.map((p) => p.y)) - 0.5
		return {
			x: origin.x + left * cell,
			y: origin.y + top * cell,
			props: { nodes: nodes.map((n) => ({ ...n, x: n.x - left, y: n.y - top })), edges },
		}
	},
})
