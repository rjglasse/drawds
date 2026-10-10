import {
	DefaultColorStyle,
	DefaultSizeStyle,
	StyleProp,
	T,
	createShapePropsMigrationIds,
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
	/**
	 * The structure it follows ('' for none): while an operation with code plays on it, the box shows
	 * that code, the step's line lit (`src/shapes/code/follow.ts`). It goes when the structure does.
	 */
	structureId: string
	/** The algorithm whose code it shows ('' for code of its own), so its lines can be found. */
	algorithm: string
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
	structureId: T.string,
	algorithm: T.string,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
}

const versions = createShapePropsMigrationIds(CODE_TYPE, {
	AddFollowing: 1,
})

/** Code boxes are persisted in the browser, so every props change needs a step here. */
export const codeShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: versions.AddFollowing,
			up(props) {
				props.structureId = ''
				props.algorithm = ''
			},
			down(props) {
				delete props.structureId
				delete props.algorithm
			},
		},
	],
})
