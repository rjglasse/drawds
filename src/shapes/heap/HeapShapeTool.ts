import { fillValues } from '../../data/fill'
import { createDragTool } from '../../sketch/LineSketchTool'
import { getTreeMetrics } from '../tree/layout'
import { buildByInsertion } from './heap'
import { HEAP_SHAPE_TYPE, type HeapShape } from './heap-shape-types'
import { heapRootCentre } from './layout'

/** Biggest heap the sketch gesture makes: five full levels. */
export const MAX_HEAP = 31

/**
 * Press to place the root, drag right: a value is inserted every cell-width, so the tree fills
 * level by level and the array grows underneath in step.
 */
export const HeapShapeTool = createDragTool<HeapShape, { count: number }>({
	type: HEAP_SHAPE_TYPE,
	initial: { count: 0 },
	next(shape, offset) {
		const { cell } = getTreeMetrics(shape.props.size)
		return { count: Math.min(MAX_HEAP, Math.max(1, Math.round(offset.x / cell) + 1)) }
	},
	same: (a, b) => a.count === b.count,
	layout(shape, origin, { count }) {
		const { fill, seed, heapType, size } = shape.props
		// Inserting one value at a time keeps the heap steady while it grows under the pointer.
		const values = buildByInsertion(fillValues(fill, seed, count), heapType)
		const root = heapRootCentre({ values, size })
		return { x: origin.x - root.x, y: origin.y - root.y, props: { values } }
	},
})
