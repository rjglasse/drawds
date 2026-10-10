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

/**
 * How a key becomes a number (lecture 7): its character codes added; the first three letters with
 * A = 1, added (the class exercise: KIM = 33); Java's String.hashCode (h = 31·h + c); or direct
 * addressing, the key itself as the index (integer keys only, no compression).
 */
export const HashCodeStyle = StyleProp.defineEnum('drawds:hash-code', {
	defaultValue: 'sum' as const,
	values: ['sum', 'letters', 'java', 'direct'] as const,
})
export type HashCode = T.TypeOf<typeof HashCodeStyle>

/** How a hash code comes down to a bucket: mod m, or MAD (multiply, add, divide: a more even spread). */
export const HashCompressionStyle = StyleProp.defineEnum('drawds:hash-compress', {
	defaultValue: 'mod' as const,
	values: ['mod', 'mad'] as const,
})
export type HashCompression = T.TypeOf<typeof HashCompressionStyle>

/** Most buckets the sketch and growing make. */
export const MAX_BUCKETS = 31

export interface HashShapeProps {
	/**
	 * The table, bucket by bucket: each bucket's chain of entries in order (chaining), or at most one
	 * entry per slot (probing, where TOMBSTONE marks a deleted one). An entry is a key, or `key:value`.
	 */
	buckets: string[][]
	strategy: HashStrategy
	/** How keys become numbers, and how those come down to buckets (see `hashOf`). */
	code: HashCode
	compress: HashCompression
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
	code: HashCodeStyle,
	compress: HashCompressionStyle,
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

const versions = createShapePropsMigrationIds(HASH_SHAPE_TYPE, {
	AddHashFunctions: 1,
})

/** Hash tables are persisted in the browser, so every props change needs a step here. */
export const hashShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			// Tables saved before the hash code and compression could be chosen used these.
			id: versions.AddHashFunctions,
			up(props) {
				props.code = 'sum'
				props.compress = 'mod'
			},
			down(props) {
				delete props.code
				delete props.compress
			},
		},
	],
})
