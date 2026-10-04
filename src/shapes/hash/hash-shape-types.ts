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
import { InvariantStyle, type InvariantMode } from '../../cells/invariant-style'
import { marksValidator, type Marks } from '../../cells/marks'
import type { FillMode, FillRange } from '../../data/fill'
import { FillRangeStyle, FillStyle } from '../../data/fill-style'
import { pointersValidator, type Pointer } from '../../pointers/pointers'

export const HASH_SHAPE_TYPE = 'hash-table'

/** How collisions are handled: a chain (linked list) per bucket, or the next free slot (linear probing). */
export const HashStrategyStyle = StyleProp.defineEnum('drawds:hash-strategy', {
	defaultValue: 'chaining' as const,
	values: ['chaining', 'probing'] as const,
})
export type HashStrategy = T.TypeOf<typeof HashStrategyStyle>

/** Most buckets the sketch and growing make. */
export const MAX_BUCKETS = 31

export interface HashShapeProps {
	/**
	 * The table, bucket by bucket: each bucket's chain of entries in order (chaining), or at most one
	 * entry per slot (probing, where TOMBSTONE marks a deleted one). An entry is a key, or `key:value`.
	 */
	buckets: string[][]
	strategy: HashStrategy
	/** Ring the keys in the wrong place (as a teacher may type them). */
	invariant: InvariantMode
	fill: FillMode
	range: FillRange
	seed: number
	/** Highlight colours, keyed by scene node (`k:<entry>` for keys, `s<i>` for slots, `b<i>` for buckets). */
	marks: Marks
	pointers: Pointer[]
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[HASH_SHAPE_TYPE]: HashShapeProps
	}
}

export type HashShape = TLShape<typeof HASH_SHAPE_TYPE>

export const hashShapeProps: RecordProps<HashShape> = {
	buckets: T.arrayOf(T.arrayOf(T.string)),
	strategy: HashStrategyStyle,
	invariant: InvariantStyle,
	fill: FillStyle,
	range: FillRangeStyle,
	seed: T.number,
	marks: marksValidator,
	pointers: pointersValidator,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Hash tables are persisted in the browser, so every props change needs a step here. */
export const hashShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
