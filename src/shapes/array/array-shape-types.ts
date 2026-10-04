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
import type { FillMode, FillRange } from '../../data/fill'
import { FillRangeStyle, FillStyle } from '../../data/fill-style'
import { pointersValidator, type Pointer } from '../../pointers/pointers'

export const ARRAY_SHAPE_TYPE = 'array'

export type ArrayDirection = 'horizontal' | 'vertical'

/**
 * Whether an array grows and shrinks as values come and go (a Python list, and arrays until now),
 * or has a fixed capacity, as in C and Java: its cells are the capacity, `size` counts the used
 * ones from the start, and the rest are blank spare slots.
 */
export const ArraySizingStyle = StyleProp.defineEnum('drawds:array-sizing', {
	defaultValue: 'grows' as const,
	values: ['grows', 'fixed'] as const,
})
export type ArraySizing = T.TypeOf<typeof ArraySizingStyle>

/** A plain array, a stack (upright, with a top) or a queue (front and rear; a circular buffer when fixed). */
export const ArrayKindStyle = StyleProp.defineEnum('drawds:array-kind', {
	defaultValue: 'array' as const,
	values: ['array', 'stack', 'queue'] as const,
})
export type ArrayKind = T.TypeOf<typeof ArrayKindStyle>

export interface ArrayShapeProps {
	/** Cell contents in index order. An empty string is an empty cell. */
	values: string[]
	direction: ArrayDirection
	showIndices: boolean
	fill: FillMode
	/** The numbers random fills draw from. */
	range: FillRange
	/** Seed the values were generated from; changing the fill mode regenerates from it. */
	seed: number
	/** Highlight colours on cells, keyed by index; they travel with values that move. */
	marks: Marks
	/** Named pointers (i, j, lo...) at indices, -1 and the length included (one past either end). */
	pointers: Pointer[]
	sizing: ArraySizing
	/** Fixed capacity: how many cells, from the start, are in use, its size (the rest are blank). */
	used: number
	kind: ArrayKind
	/** A queue with a fixed capacity (a circular buffer): the index of its front value. */
	front: number
	color: TLDefaultColorStyle
	/** Drives the cell size, so the style panel's size picker resizes the array. */
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[ARRAY_SHAPE_TYPE]: ArrayShapeProps
	}
}

export type ArrayShape = TLShape<typeof ARRAY_SHAPE_TYPE>

export const arrayShapeProps: RecordProps<ArrayShape> = {
	values: T.arrayOf(T.string),
	direction: T.literalEnum('horizontal', 'vertical'),
	showIndices: T.boolean,
	fill: FillStyle,
	range: FillRangeStyle,
	seed: T.number,
	marks: marksValidator,
	pointers: pointersValidator,
	sizing: ArraySizingStyle,
	used: T.positiveInteger,
	kind: ArrayKindStyle,
	front: T.positiveInteger,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

const versions = createShapePropsMigrationIds(ARRAY_SHAPE_TYPE, {
	AddFillAndSeed: 1,
	AddMarks: 2,
	AddPointers: 3,
	AddSizing: 4,
	AddKind: 5,
	AddRange: 6,
})

/** Arrays are persisted in the browser, so every props change needs a step here. */
export const arrayShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: versions.AddFillAndSeed,
			up(props) {
				props.fill = 'random'
				props.seed = 0
			},
			down(props) {
				delete props.fill
				delete props.seed
			},
		},
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
			id: versions.AddSizing,
			up(props) {
				props.sizing = 'grows'
				props.used = props.values.length
			},
			down(props) {
				delete props.sizing
				delete props.used
			},
		},
		{
			id: versions.AddKind,
			up(props) {
				props.kind = 'array'
				props.front = 0
			},
			down(props) {
				delete props.kind
				delete props.front
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
	],
})

/** How many cells are in use: all of them, unless the capacity is fixed. */
export function usedCount({ sizing, used, values }: { sizing: ArraySizing; used: number; values: readonly string[] }) {
	return sizing === 'fixed' ? Math.min(used, values.length) : values.length
}
