import { fillValues } from '../../data/fill'
import { createDragTool } from '../../sketch/LineSketchTool'
import { buildTable } from './hash'
import { HASH_SHAPE_TYPE, MAX_BUCKETS, type HashShape } from './hash-shape-types'
import { getHashMetrics } from './layout'

/** Fewest buckets a sketch makes: a table needs a few for collisions to show. */
const MIN_BUCKETS = 3

/**
 * Press and drag down: a bucket appears for every cell the pointer travels, and the table fills to
 * a load of about 0.6 with keys put in one by one, so collisions happen as they would.
 */
export const HashShapeTool = createDragTool<HashShape, { buckets: number }>({
	type: HASH_SHAPE_TYPE,
	initial: { buckets: MIN_BUCKETS },
	next(shape, offset) {
		const { cell } = getHashMetrics(shape.props.size)
		return { buckets: Math.min(MAX_BUCKETS, Math.max(MIN_BUCKETS, 1 + Math.floor(Math.abs(offset.y) / cell))) }
	},
	same: (a, b) => a.buckets === b.buckets,
	layout(shape, origin, { buckets }) {
		const { fill, seed, range, strategy, size } = shape.props
		const m = getHashMetrics(size)
		const keys = fillValues(fill, seed, Math.round(buckets * 0.6), { range })
		// The first bucket's row is under the press point.
		return {
			x: origin.x - m.indexW - m.pointerW / 2,
			y: origin.y - m.cell / 2,
			props: { buckets: buildTable(keys, buckets, strategy) },
		}
	},
})
