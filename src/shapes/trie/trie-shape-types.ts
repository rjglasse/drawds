import {
	DefaultColorStyle,
	DefaultFontStyle,
	DefaultSizeStyle,
	T,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLDefaultColorStyle,
	type TLDefaultFontStyle,
	type TLDefaultSizeStyle,
	type TLShape,
} from 'tldraw'
import { marksValidator, type Marks } from '../../cells/marks'
import { pointersValidator, type Pointer } from '../../pointers/pointers'
import type { TreeNode } from '../tree/tree-shape-types'

export const TRIE_SHAPE_TYPE = 'trie'

export interface TrieShapeProps {
	/**
	 * All nodes, the root (`^`) first: a node's id is `^` and the prefix it stands for, its value the
	 * word that ends at it ('' if none), its children in letter order (`src/shapes/trie/trie.ts`).
	 */
	nodes: TreeNode[]
	seed: number
	/** Highlight colours on nodes (and on the edges down to them), keyed by node id. */
	marks: Marks
	/** Named pointers (root, node...) at node ids. */
	pointers: Pointer[]
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[TRIE_SHAPE_TYPE]: TrieShapeProps
	}
}

export type TrieShape = TLShape<typeof TRIE_SHAPE_TYPE>

export const trieShapeProps: RecordProps<TrieShape> = {
	nodes: T.arrayOf(
		T.object({
			id: T.string,
			value: T.string,
			children: T.arrayOf(T.nullable(T.string)),
			dx: T.number,
			dy: T.number,
		})
	),
	seed: T.number,
	marks: marksValidator,
	pointers: pointersValidator,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Tries are persisted in the browser, so every props change needs a step here. */
export const trieShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
