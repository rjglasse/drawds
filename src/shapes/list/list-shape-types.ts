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
import { pointersValidator, type Pointer } from '../../pointers/pointers'
import type { FillMode } from '../../data/fill'
import { FillStyle } from '../../data/fill-style'

export const LIST_SHAPE_TYPE = 'linked-list'

/** The way the list runs from head to tail. */
export type ListDirection = 'right' | 'left' | 'down' | 'up'

// Variants, each a toggle in the style panel, combinable: doubly linked, a tail pointer, circular
// (the last node points back to the first), a sentinel (dummy) node in front.

export const ListLinksStyle = StyleProp.defineEnum('drawds:list-links', {
	defaultValue: 'singly' as const,
	values: ['singly', 'doubly'] as const,
})
export const ListTailStyle = StyleProp.defineEnum('drawds:list-tail', {
	defaultValue: 'none' as const,
	values: ['none', 'tail'] as const,
})
export const ListEndsStyle = StyleProp.defineEnum('drawds:list-ends', {
	defaultValue: 'null' as const,
	values: ['null', 'circular'] as const,
})
export const ListSentinelStyle = StyleProp.defineEnum('drawds:list-sentinel', {
	defaultValue: 'none' as const,
	values: ['none', 'sentinel'] as const,
})

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
	/** Named pointers (curr, prev...) at node ids, or at the null after the tail. */
	pointers: Pointer[]
	links: T.TypeOf<typeof ListLinksStyle>
	tail: T.TypeOf<typeof ListTailStyle>
	ends: T.TypeOf<typeof ListEndsStyle>
	sentinel: T.TypeOf<typeof ListSentinelStyle>
	/** A cycle: the last node's next points at this node instead of null ('' for none). */
	cycleTo: string
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
	pointers: pointersValidator,
	links: ListLinksStyle,
	tail: ListTailStyle,
	ends: ListEndsStyle,
	sentinel: ListSentinelStyle,
	cycleTo: T.string,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

const versions = createShapePropsMigrationIds(LIST_SHAPE_TYPE, {
	AddMarks: 1,
	AddPointers: 2,
	AddVariants: 3,
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
		{
			id: versions.AddPointers,
			up(props) {
				props.pointers = []
			},
			down(props) {
				delete props.pointers
			},
		},
		{
			id: versions.AddVariants,
			up(props) {
				props.links = 'singly'
				props.tail = 'none'
				props.ends = 'null'
				props.sentinel = 'none'
				props.cycleTo = ''
			},
			down(props) {
				for (const key of ['links', 'tail', 'ends', 'sentinel', 'cycleTo']) delete props[key]
			},
		},
	],
})
