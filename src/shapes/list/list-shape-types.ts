import {
	DefaultColorStyle,
	DefaultFontStyle,
	DefaultSizeStyle,
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

export const LIST_SHAPE_TYPE = 'linked-list'

/** The way the list runs from head to tail. */
export type ListDirection = 'right' | 'left' | 'down' | 'up'

export interface ListNode {
	/** Stable id: the node's cell key and handle id. */
	id: string
	value: string
	/** Offset from the automatic layout, set by dragging the node. */
	dx: number
	dy: number
}

export interface ListShapeProps {
	/** Nodes in list order, head first. */
	nodes: ListNode[]
	direction: ListDirection
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
		[LIST_SHAPE_TYPE]: ListShapeProps
	}
}

export type ListShape = TLShape<typeof LIST_SHAPE_TYPE>

export const listShapeProps: RecordProps<ListShape> = {
	nodes: T.arrayOf(T.object({ id: T.string, value: T.string, dx: T.number, dy: T.number })),
	direction: T.literalEnum('right', 'left', 'down', 'up'),
	fill: FillStyle,
	seed: T.number,
	marks: marksValidator,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

const versions = createShapePropsMigrationIds(LIST_SHAPE_TYPE, {
	AddMarks: 1,
})

/** Lists are persisted in the browser, so every props change needs a step here. */
export const listShapeMigrations = createShapePropsMigrationSequence({
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
	],
})
