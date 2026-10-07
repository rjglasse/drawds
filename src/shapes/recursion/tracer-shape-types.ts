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
import { TRACED, type Traced } from './tracer'

export const TRACER_TYPE = 'recursion-tracer'

/** The function a tracer runs; picking one types its example call (gcd(60, 24), fib(5)...). */
export const TracedStyle = StyleProp.defineEnum('drawds:recursion-fn', { defaultValue: 'gcd' as Traced, values: [...TRACED] })

export interface TracerShapeProps {
	fn: Traced
	/** The call main makes, as typed: gcd(60, 24). Another function's name switches `fn`. */
	call: string
	/** Unused: the sketch tools give every shape a seed. */
	seed: number
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[TRACER_TYPE]: TracerShapeProps
	}
}

export type TracerShape = TLShape<typeof TRACER_TYPE>

export const tracerShapeProps: RecordProps<TracerShape> = {
	fn: TracedStyle,
	call: T.string,
	seed: T.number,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Tracers are persisted in the browser, so every props change needs a step here. */
export const tracerShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
