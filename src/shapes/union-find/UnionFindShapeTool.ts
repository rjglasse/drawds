import { createDragTool } from '../../sketch/LineSketchTool'
import { getTreeMetrics } from '../tree/layout'
import { firstElementCentre } from './layout'
import { singletons } from './union-find'
import { UNION_FIND_SHAPE_TYPE, type UnionFindShape } from './union-find-shape-types'

/** Most elements the sketch gesture makes. */
export const MAX_ELEMENTS = 16

/**
 * Press to place element 0, drag right: an element per cell-width, each in a set of its own (the
 * parent array grows underneath in step).
 */
export const UnionFindShapeTool = createDragTool<UnionFindShape, { count: number }>({
	type: UNION_FIND_SHAPE_TYPE,
	initial: { count: 0 },
	next(shape, offset) {
		const { cell } = getTreeMetrics(shape.props.size)
		return { count: Math.min(MAX_ELEMENTS, Math.max(2, Math.round(offset.x / cell) + 1)) }
	},
	same: (a, b) => a.count === b.count,
	layout(shape, origin, { count }) {
		const props = { ...shape.props, ...singletons(count), labels: [...Array(count).keys()].map(String) }
		const first = firstElementCentre(props)
		return { x: origin.x - first.x, y: origin.y - first.y, props: { labels: props.labels, parent: props.parent, sizes: props.sizes, ranks: props.ranks } }
	},
})
