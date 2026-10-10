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
import { COUNTED_SORTS, type CountedSort } from '../array/sort-counts'

export const GROWTH_TYPE = 'sort-growth'

export interface GrowthShapeProps {
	/** The array it was opened from: the table follows its steps, and goes when it is deleted. */
	structureId: string
	/** The sort counted. */
	sort: CountedSort
	/** Where the random inputs (and a random pivot's picks) come from. */
	seed: number
	/** A cut-off's length, for quicksort with a cut-off. */
	cutoff: number
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[GROWTH_TYPE]: GrowthShapeProps
	}
}

export type GrowthShape = TLShape<typeof GROWTH_TYPE>

export const growthShapeProps: RecordProps<GrowthShape> = {
	structureId: T.string,
	sort: T.literalEnum(...COUNTED_SORTS),
	seed: T.number,
	cutoff: T.number,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Counts tables are persisted in the browser, so every props change needs a step here. */
export const growthShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
