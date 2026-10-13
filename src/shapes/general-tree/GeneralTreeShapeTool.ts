import { createDragTool } from '../../sketch/LineSketchTool'
import { getTreeMetrics } from '../tree/layout'
import { generateGeneralTree, maxDepth } from './generate'
import { GENERAL_TREE_SHAPE_TYPE, type GeneralTreeShape } from './general-tree-shape-types'
import { generalTreeRootCentre } from './layout'

interface TreeGesture {
	depth: number
	fullness: number
}

/**
 * The binary tree's gesture: press to place the root; drag down and a level appears every
 * level-height; lean right for a fuller tree (every node with the style's most children at the far
 * right), left for a sparser one (a bare stick at the far left).
 */
export const GeneralTreeShapeTool = createDragTool<GeneralTreeShape, TreeGesture>({
	type: GENERAL_TREE_SHAPE_TYPE,
	initial: { depth: 0, fullness: 0 },
	next(shape, offset) {
		const { levelH, cell } = getTreeMetrics(shape.props.size)
		const depth = Math.min(maxDepth(Number(shape.props.arity)), Math.max(1, Math.floor(offset.y / levelH + 1.5)))
		// Quantised so small wobbles don't keep rebuilding the tree.
		const fullness = Math.min(1, Math.max(0, Math.round((0.5 + offset.x / (4 * cell)) * 20) / 20))
		return { depth, fullness }
	},
	same: (a, b) => a.depth === b.depth && a.fullness === b.fullness,
	layout(shape, origin, { depth, fullness }) {
		const { seed, fill, size, range, arity } = shape.props
		const nodes = generateGeneralTree(seed, depth, fullness, Number(arity), fill, range)
		const root = generalTreeRootCentre({ nodes, size })
		return { x: origin.x - root.x, y: origin.y - root.y, props: { nodes, depth, fullness } }
	},
})
