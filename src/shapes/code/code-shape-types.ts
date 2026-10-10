import {
	DefaultColorStyle,
	DefaultSizeStyle,
	StyleProp,
	T,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLDefaultColorStyle,
	type TLDefaultSizeStyle,
	type TLShape,
} from 'tldraw'
import { marksValidator, type Marks } from '../../cells/marks'
import { pointersValidator, type Pointer } from '../../pointers/pointers'
import { CODE_LANGUAGES, type CodeLanguage } from './highlight'

export const CODE_TYPE = 'code'

/** The language a code box is highlighted as (the style panel's C / Java / Python). */
export const CodeLanguageStyle = StyleProp.defineEnum('drawds:code-language', {
	defaultValue: 'java' as CodeLanguage,
	values: [...CODE_LANGUAGES],
})

export interface CodeShapeProps {
	/** The code as typed (tabs become spaces). */
	code: string
	language: CodeLanguage
	/** Line numbers in a gutter on the left. */
	lineNumbers: boolean
	/** Highlight colours keyed by line, `L<i>`. */
	marks: Marks
	/** Named pointers at lines (`L<i>`). */
	pointers: Pointer[]
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[CODE_TYPE]: CodeShapeProps
	}
}

export type CodeShape = TLShape<typeof CODE_TYPE>

export const codeShapeProps: RecordProps<CodeShape> = {
	code: T.string,
	language: CodeLanguageStyle,
	lineNumbers: T.boolean,
	marks: marksValidator,
	pointers: pointersValidator,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
}

/** Code boxes are persisted in the browser, so every props change needs a step here. */
export const codeShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
