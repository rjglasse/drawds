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
import { pointersValidator, type Pointer } from '../../pointers/pointers'

export const ARRAY_SHAPE_TYPE = 'array'

export type ArrayDirection = 'horizontal' | 'vertical'

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
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

const versions = createShapePropsMigrationIds(ARRAY_SHAPE_TYPE, {
	AddFillAndSeed: 1,
	AddMarks: 2,
	AddPointers: 3,
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
	],
})
