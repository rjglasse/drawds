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

export const MEMORY_TYPE = 'memory-view'

/** How much other data memory holds: none, a cell a row, or crowded (two a row: an array may find no room). */
export const MemoryBusyStyle = StyleProp.defineEnum('drawds:memory-busy', {
	defaultValue: 'some' as const,
	values: ['free', 'some', 'crowded'] as const,
})

export interface MemoryShapeProps {
	/** The array or linked list shown in memory: the view redraws as it changes, and goes when it is deleted. */
	structureId: string
	busy: T.TypeOf<typeof MemoryBusyStyle>
	/** Where things go: the other data, the array's block, each node. */
	seed: number
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[MEMORY_TYPE]: MemoryShapeProps
	}
}

export type MemoryShape = TLShape<typeof MEMORY_TYPE>

export const memoryShapeProps: RecordProps<MemoryShape> = {
	structureId: T.string,
	busy: MemoryBusyStyle,
	seed: T.number,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Memory views are persisted in the browser, so every props change needs a step here. */
export const memoryShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
