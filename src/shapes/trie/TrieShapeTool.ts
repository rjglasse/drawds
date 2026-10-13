import { createDragTool } from '../../sketch/LineSketchTool'
import { getTreeMetrics } from '../tree/layout'
import { trieRootCentre } from './layout'
import { MAX_SKETCH_WORDS, sketchWords, trieOf } from './trie'
import { TRIE_SHAPE_TYPE, type TrieShape } from './trie-shape-types'

/**
 * Press to place the root, drag right: a word goes in every cell-width, from a seeded run of words
 * that share their beginnings, so the trie branches where they part. Going on only adds words.
 */
export const TrieShapeTool = createDragTool<TrieShape, { count: number }>({
	type: TRIE_SHAPE_TYPE,
	initial: { count: 0 },
	next(shape, offset) {
		const { cell } = getTreeMetrics(shape.props.size)
		return { count: Math.min(MAX_SKETCH_WORDS, Math.max(1, Math.round(offset.x / cell) + 1)) }
	},
	same: (a, b) => a.count === b.count,
	layout(shape, origin, { count }) {
		const { seed, size } = shape.props
		const nodes = trieOf(sketchWords(seed, count))
		const root = trieRootCentre({ nodes, size })
		return { x: origin.x - root.x, y: origin.y - root.y, props: { nodes } }
	},
})
