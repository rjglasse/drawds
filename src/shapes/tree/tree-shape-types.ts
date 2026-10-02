import {
	DefaultColorStyle,
	DefaultFontStyle,
	DefaultSizeStyle,
	StyleProp,
	T,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLDefaultColorStyle,
	type TLDefaultFontStyle,
	type TLDefaultSizeStyle,
	type TLShape,
} from 'tldraw'
import { marksValidator, type Marks } from '../../cells/marks'
import type { FillMode } from '../../data/fill'
import { FillStyle } from '../../data/fill-style'

export const TREE_SHAPE_TYPE = 'binary-tree'

export interface TreeNode {
	/** Stable id: the node's cell key and handle id. */
	id: string
	value: string
	/** Child ids by slot ([left, right] for binary trees); null is an empty slot. */
	children: (string | null)[]
	/** Offset from the automatic layout, set by dragging the node. */
	dx: number
	dy: number
}

/** Whether empty child slots are drawn as null markers (for teaching base cases and pointers). */
export const NullsStyle = StyleProp.defineEnum('drawds:nulls', {
	defaultValue: 'hide' as const,
	values: ['hide', 'show'] as const,
})
export type NullsMode = T.TypeOf<typeof NullsStyle>

/**
 * A plain binary tree, or a binary search tree: keys sorted in in-order, inserted and deleted by
 * the BST algorithms rather than placed by hand.
 */
export const TreeKindStyle = StyleProp.defineEnum('drawds:tree-kind', {
	defaultValue: 'tree' as const,
	values: ['tree', 'bst'] as const,
})
export type TreeKind = T.TypeOf<typeof TreeKindStyle>

export interface TreeShapeProps {
	/** All nodes; the first is the root. */
	nodes: TreeNode[]
	kind: TreeKind
	nulls: NullsMode
	fill: FillMode
	seed: number
	/** Highlight colours on nodes, keyed by node id. */
	marks: Marks
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[TREE_SHAPE_TYPE]: TreeShapeProps
	}
}

export type TreeShape = TLShape<typeof TREE_SHAPE_TYPE>

export const treeShapeProps: RecordProps<TreeShape> = {
	nodes: T.arrayOf(
		T.object({
			id: T.string,
			value: T.string,
			children: T.arrayOf(T.nullable(T.string)),
			dx: T.number,
			dy: T.number,
		})
	),
	kind: TreeKindStyle,
	nulls: NullsStyle,
	fill: FillStyle,
	seed: T.number,
	marks: marksValidator,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

const versions = createShapePropsMigrationIds(TREE_SHAPE_TYPE, {
	AddMarks: 1,
	AddKind: 2,
})

/** Trees are persisted in the browser, so every props change needs a step here. */
export const treeShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: versions.AddMarks,
			up(props) {
				props.marks = {}
			},
			down(props) {
				delete props.marks
			},
		},
		{
			id: versions.AddKind,
			up(props) {
				props.kind = 'tree'
			},
			down(props) {
				delete props.kind
			},
		},
	],
})
