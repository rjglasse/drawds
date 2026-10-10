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
import type { ShuffleKind } from '../array/shuffles'
import type { OutcomesMode } from './outcomes'

export const OUTCOMES_TYPE = 'shuffle-outcomes'

export interface OutcomesShapeProps {
	/** The array the shuffle ran on: the view follows its steps, and goes when it is deleted. */
	structureId: string
	kind: ShuffleKind
	/** Every run as a tree, or many runs tallied. */
	mode: OutcomesMode
	/** The array's values as the shuffle starts. */
	values: string[]
	/** Where the many runs' picks come from. */
	seed: number
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[OUTCOMES_TYPE]: OutcomesShapeProps
	}
}

export type OutcomesShape = TLShape<typeof OUTCOMES_TYPE>

export const outcomesShapeProps: RecordProps<OutcomesShape> = {
	structureId: T.string,
	kind: T.literalEnum('unfair', 'fisher-yates'),
	mode: T.literalEnum('tree', 'tally'),
	values: T.arrayOf(T.string),
	seed: T.number,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Outcome views are persisted in the browser, so every props change needs a step here. */
export const outcomesShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
