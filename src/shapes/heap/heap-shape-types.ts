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
import type { FillMode, FillRange } from '../../data/fill'
import { FillRangeStyle, FillStyle } from '../../data/fill-style'
import { InvariantStyle, type InvariantMode } from '../../cells/invariant-style'
import type { HeapType } from './heap'

export const HEAP_SHAPE_TYPE = 'heap'

/** Min heap (smallest at the root) or max heap. */
export const HeapTypeStyle = StyleProp.defineEnum('drawds:heap-type', {
	defaultValue: 'min' as HeapType,
	values: ['min', 'max'] as const,
})

export interface HeapShapeProps {
	/** The heap in array order: index i's children are 2i+1 and 2i+2. */
	values: string[]
	heapType: HeapType
	/** Flag values that break the heap property (dashed red rings). */
	invariant: InvariantMode
	fill: FillMode
	/** The numbers random fills draw from. */
	range: FillRange
	seed: number
	/** Highlight colours keyed by index; they travel with values as they sift. */
	marks: Marks
	/** Named pointers (i, parent...) on tree nodes (`i`) or array cells (`a<i>`); they stay at indices. */
	pointers: Pointer[]
	/** Lecture 8a's terms beside the tree view: root, internal and leaf tinted, depths, heights. */
	terms: boolean
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[HEAP_SHAPE_TYPE]: HeapShapeProps
	}
}

export type HeapShape = TLShape<typeof HEAP_SHAPE_TYPE>

export const heapShapeProps: RecordProps<HeapShape> = {
	values: T.arrayOf(T.string),
	heapType: HeapTypeStyle,
	invariant: InvariantStyle,
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

const versions = createShapePropsMigrationIds(HEAP_SHAPE_TYPE, {
	AddPointers: 1,
	AddInvariant: 2,
	AddRange: 3,
	AddTerms: 4,
})

/** Heaps are persisted in the browser, so every props change needs a step here. */
export const heapShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
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
			id: versions.AddInvariant,
			up(props) {
				props.invariant = 'check'
			},
			down(props) {
				delete props.invariant
			},
		},
		{
			id: versions.AddRange,
			up(props) {
				props.range = 'medium'
			},
			down(props) {
				delete props.range
			},
		},
		{
			id: versions.AddTerms,
			up(props) {
				props.terms = false
			},
			down(props) {
				delete props.terms
			},
		},
	],
})
