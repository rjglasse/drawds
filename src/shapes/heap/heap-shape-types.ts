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
import type { FillMode } from '../../data/fill'
import { FillStyle } from '../../data/fill-style'
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
	fill: FillMode
	seed: number
	/** Highlight colours keyed by index; they travel with values as they sift. */
	marks: Marks
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
	fill: FillStyle,
	seed: T.number,
	marks: marksValidator,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Heaps are persisted in the browser, so every props change needs a step here. */
export const heapShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
