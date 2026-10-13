import {
	DefaultColorStyle,
	DefaultFontStyle,
	DefaultSizeStyle,
	StyleProp,
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
import type { FillMode, FillRange } from '../../data/fill'
import { FillRangeStyle, FillStyle } from '../../data/fill-style'
import type { TreeNode } from '../tree/tree-shape-types'

export const GENERAL_TREE_SHAPE_TYPE = 'general-tree'

/**
 * How many children a node may get when the tree is sketched (or sketched again, picked with the tree
 * selected). A + still adds a child to any node: a general tree has any number.
 */
export const ArityStyle = StyleProp.defineEnum('drawds:tree-arity', {
	defaultValue: '3' as const,
	values: ['3', '4', '5', '6'] as const,
})
export type Arity = T.TypeOf<typeof ArityStyle>

export interface GeneralTreeShapeProps {
	/**
	 * All nodes; the first is the root. Children are in order, left to right, with no empty slots (a
	 * binary tree's `TreeNode`, so its terms, traversals and edits work on these too).
	 */
	nodes: TreeNode[]
	/** The most children a node gets when sketched. */
	arity: Arity
	/** The sketch that made it (levels and how full), so picking another arity sketches it again. */
	depth: number
	fullness: number
	fill: FillMode
	/** The numbers random fills draw from. */
	range: FillRange
	seed: number
	/** Highlight colours on nodes (and on the edges down to them), keyed by node id. */
	marks: Marks
	/** Named pointers (root, curr...) at node ids. */
	pointers: Pointer[]
	/** Lecture 8a's terms beside the tree: root, internal and leaf tinted, depths, heights. */
	terms: boolean
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[GENERAL_TREE_SHAPE_TYPE]: GeneralTreeShapeProps
	}
}

export type GeneralTreeShape = TLShape<typeof GENERAL_TREE_SHAPE_TYPE>

export const generalTreeShapeProps: RecordProps<GeneralTreeShape> = {
	nodes: T.arrayOf(
		T.object({
			id: T.string,
			value: T.string,
			children: T.arrayOf(T.nullable(T.string)),
			dx: T.number,
			dy: T.number,
		})
	),
	arity: ArityStyle,
	depth: T.number,
	fullness: T.number,
	fill: FillStyle,
	range: FillRangeStyle,
	seed: T.number,
	marks: marksValidator,
	pointers: pointersValidator,
	terms: T.boolean,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** General trees are persisted in the browser, so every props change needs a step here. */
export const generalTreeShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
