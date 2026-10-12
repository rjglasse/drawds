import type { Editor, VecLike } from 'tldraw'
import { hoveredNode } from '../../nodelink/hover'
import type { NodeLinkShapeUtil } from '../../nodelink/NodeLinkShapeUtil'
import { createDragTool } from '../../sketch/LineSketchTool'
import { INITIAL_GRAPH_SKETCH, extendGraph, extendingSketch, generateGraph, nextGraphSketch, type GraphSketch } from './generate'
import { GRAPH_SHAPE_TYPE, type GraphShape } from './graph-shape-types'
import { getGraphMetrics } from './layout'

/** Pressed on a node of a graph on the page: that graph, continued from the node. */
function resumeGraph(editor: Editor, point: VecLike) {
	const shape = editor.getShapeAtPoint(point, { hitInside: true, hitLocked: false })
	if (shape?.type !== GRAPH_SHAPE_TYPE || shape.isLocked) return undefined
	const graph = shape as GraphShape
	const util = editor.getShapeUtil(graph) as unknown as NodeLinkShapeUtil<GraphShape>
	const local = editor.getPointInShapeSpace(graph, point)
	const start = hoveredNode(
		util.getScene(graph).nodes.filter((n) => n.kind !== 'label' && n.kind !== 'null'),
		local,
		0
	)
	return start === undefined ? undefined : { id: graph.id, gesture: extendingSketch(graph.props, start) }
}

/**
 * Press and drag a free path: a node drops every few cells along it, and its edges to nearby
 * earlier nodes appear as it lands (see `generateGraph`), so the graph grows under the pointer.
 * Pressed on a node of a graph, the drag continues that graph from the node (`extendGraph`).
 */
export const GraphShapeTool = createDragTool<GraphShape, GraphSketch>({
	type: GRAPH_SHAPE_TYPE,
	initial: INITIAL_GRAPH_SKETCH,
	next(shape, offset, previous) {
		const { cell } = getGraphMetrics(shape.props.size)
		return nextGraphSketch(previous, { x: offset.x / cell, y: offset.y / cell })
	},
	same: (a, b) => a.points.length === b.points.length,
	resume: resumeGraph,
	layout(shape, origin, { points, extend }) {
		const { seed, labels, size, density, parts, order } = shape.props
		// Continuing a graph: its nodes and edges, then the new ones; where it is stays put.
		if (extend) return { props: extendGraph(extend.model, extend.start, points, seed, labels, { density, order }) }
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
