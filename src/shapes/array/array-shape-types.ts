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

export interface ArrayShapeProps {
	/** Cell contents in index order. An empty string is an empty cell. */
	values: string[]
	direction: ArrayDirection
	showIndices: boolean
	fill: FillMode
	/** Seed the values were generated from; changing the fill mode regenerates from it. */
	seed: number
	/** Highlight colours on cells, keyed by index; they travel with values that move. */
	marks: Marks
	/** Named pointers (i, j, lo...) at indices, -1 and the length included (one past either end). */
	pointers: Pointer[]
	sizing: ArraySizing
	/** Fixed capacity: how many cells, from the start, are in use, its size (the rest are blank). */
	used: number
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
	seed: T.number,
	marks: marksValidator,
	pointers: pointersValidator,
	sizing: ArraySizingStyle,
	used: T.positiveInteger,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

const versions = createShapePropsMigrationIds(ARRAY_SHAPE_TYPE, {
	AddFillAndSeed: 1,
	AddMarks: 2,
	AddPointers: 3,
	AddSizing: 4,
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
	],
})

/** How many cells are in use: all of them, unless the capacity is fixed. */
export function usedCount({ sizing, used, values }: Pick<ArrayShapeProps, 'sizing' | 'used' | 'values'>) {
	return sizing === 'fixed' ? Math.min(used, values.length) : values.length
}
