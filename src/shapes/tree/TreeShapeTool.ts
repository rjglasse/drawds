import { createDragTool } from '../../sketch/LineSketchTool'
import { MAX_DEPTH, generateTree } from './generate'
import { getTreeMetrics, treeRootCentre } from './layout'
import { TREE_SHAPE_TYPE, type TreeShape } from './tree-shape-types'

interface TreeGesture {
	depth: number
	fullness: number
}

/**
 * Press to place the root; drag down and a level appears every level-height; lean right for a
 * fuller tree (perfect at the far right), left for a sparser one (a bare stick at the far left).
 */
export const TreeShapeTool = createDragTool<TreeShape, TreeGesture>({
	type: TREE_SHAPE_TYPE,
	initial: { depth: 0, fullness: 0 },
	next(shape, offset) {
		const { levelH, cell } = getTreeMetrics(shape.props.size)
		const depth = Math.min(MAX_DEPTH, Math.max(1, Math.floor(offset.y / levelH + 1.5)))
		// Quantised so small wobbles don't keep rebuilding the tree.
		const fullness = Math.min(1, Math.max(0, Math.round((0.5 + offset.x / (4 * cell)) * 20) / 20))
		return { depth, fullness }
	},
	same: (a, b) => a.depth === b.depth && a.fullness === b.fullness,
	layout(shape, origin, { depth, fullness }) {
		const { seed, fill, nulls, size } = shape.props
		const nodes = generateTree(seed, depth, fullness, fill)
		const root = treeRootCentre({ nodes, nulls, size })
		return { x: origin.x - root.x, y: origin.y - root.y, props: { nodes } }
	},
})
