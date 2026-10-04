import {
	DefaultColorStyle,
	DefaultFontStyle,
	DefaultSizeStyle,
	T,
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
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Matrices are persisted in the browser, so every props change needs a step here. */
export const matrixShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
