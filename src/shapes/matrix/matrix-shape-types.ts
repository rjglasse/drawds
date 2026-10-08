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
import type { FillMode, FillRange } from '../../data/fill'
import { FillRangeStyle, FillStyle } from '../../data/fill-style'
import { pointersValidator, type Pointer } from '../../pointers/pointers'

export const MATRIX_SHAPE_TYPE = 'matrix'

/** Largest matrix the sketch and the grow grips make, either way. */
export const MAX_MATRIX = 16

export interface MatrixShapeProps {
	/** The cells, row by row (every row as long as the first). */
	values: string[][]
	fill: FillMode
	/** The numbers random fills draw from. */
	range: FillRange
	seed: number
	/** Highlight colours keyed by cell, `r,c`. */
	marks: Marks
	/** Named pointers at cells (`r,c`). */
	pointers: Pointer[]
	/** Labels in place of the row indices (left) and column indices (above), e.g. addresses; '' shows the index. */
	rowLabels: string[]
	colLabels: string[]
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[MATRIX_SHAPE_TYPE]: MatrixShapeProps
	}
}

export type MatrixShape = TLShape<typeof MATRIX_SHAPE_TYPE>

export const matrixShapeProps: RecordProps<MatrixShape> = {
	values: T.arrayOf(T.arrayOf(T.string)),
	fill: FillStyle,
	range: FillRangeStyle,
	seed: T.number,
	marks: marksValidator,
	pointers: pointersValidator,
	rowLabels: T.arrayOf(T.string),
	colLabels: T.arrayOf(T.string),
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

const versions = createShapePropsMigrationIds(MATRIX_SHAPE_TYPE, {
	AddLabels: 1,
})

/** Matrices are persisted in the browser, so every props change needs a step here. */
export const matrixShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: versions.AddLabels,
			up(props) {
				props.rowLabels = []
				props.colLabels = []
			},
			down(props) {
				delete props.rowLabels
				delete props.colLabels
			},
		},
	],
})
