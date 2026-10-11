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

export const RING_TYPE = 'ring-view'

export interface RingShapeProps {
	/** The fixed-capacity queue (a circular buffer) drawn as a ring: redrawn as it changes, gone when it is deleted. */
	structureId: string
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[RING_TYPE]: RingShapeProps
	}
}

export type RingShape = TLShape<typeof RING_TYPE>

export const ringShapeProps: RecordProps<RingShape> = {
	structureId: T.string,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Ring views are persisted in the browser, so every props change needs a step here. */
export const ringShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
