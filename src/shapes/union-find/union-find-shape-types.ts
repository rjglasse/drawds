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
import { pointersValidator, type Pointer } from '../../pointers/pointers'
import type { UnionBy } from './union-find'

export const UNION_FIND_SHAPE_TYPE = 'union-find'

/** How union picks which root goes under which: by size, by rank, or naively (first under second). */
export const UnionByStyle = StyleProp.defineEnum('drawds:uf-union', {
	defaultValue: 'size' as UnionBy,
	values: ['size', 'rank', 'naive'] as const,
})

export type Compression = 'on' | 'off'

/** Whether find re-points the nodes on its way straight at the root (path compression). */
export const CompressionStyle = StyleProp.defineEnum('drawds:uf-compress', {
	defaultValue: 'on' as Compression,
	values: ['on', 'off'] as const,
})

export interface UnionFindShapeProps {
	/** Element names, shown in the nodes (0, 1, 2... to start with). */
	labels: string[]
	/** parent[i]: i's parent; a root is its own parent. */
	parent: number[]
	/** Set sizes (meaningful at roots), for union by size. */
	sizes: number[]
	/** Ranks (meaningful at roots), for union by rank. */
	ranks: number[]
	unionBy: UnionBy
	compression: Compression
	/** For random unions. */
	seed: number
	/** Highlight colours keyed by element, and `edge:e<i>` for i's parent pointer. */
	marks: Marks
	/** Named pointers on elements (`<i>`) or parent cells (`p<i>`). */
	pointers: Pointer[]
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[UNION_FIND_SHAPE_TYPE]: UnionFindShapeProps
	}
}

export type UnionFindShape = TLShape<typeof UNION_FIND_SHAPE_TYPE>

export const unionFindShapeProps: RecordProps<UnionFindShape> = {
	labels: T.arrayOf(T.string),
	parent: T.arrayOf(T.number),
	sizes: T.arrayOf(T.number),
	ranks: T.arrayOf(T.number),
	unionBy: UnionByStyle,
	compression: CompressionStyle,
	seed: T.number,
	marks: marksValidator,
	pointers: pointersValidator,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Union-find shapes are persisted in the browser, so every props change needs a step here. */
export const unionFindShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
