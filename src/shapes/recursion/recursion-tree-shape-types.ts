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
import type { Call } from './calls'

export const RECURSION_TREE_TYPE = 'recursion-tree'

export interface RecursionTreeShapeProps {
	/** The structure the operation ran on: the tree follows its steps, and goes when it is deleted. */
	structureId: string
	/** The operation, as its heading says ("sum by halves"). */
	title: string
	/** Every call the run made, in order: the tree as the run leaves it. */
	calls: Call[]
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[RECURSION_TREE_TYPE]: RecursionTreeShapeProps
	}
}

export type RecursionTreeShape = TLShape<typeof RECURSION_TREE_TYPE>

export const recursionTreeShapeProps: RecordProps<RecursionTreeShape> = {
	structureId: T.string,
	title: T.string,
	calls: T.arrayOf(T.object({ label: T.string, parent: T.number, result: T.string.optional() })),
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Recursion trees are persisted in the browser, so every props change needs a step here. */
export const recursionTreeShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
