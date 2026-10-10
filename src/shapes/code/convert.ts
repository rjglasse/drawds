import { createShapeId, renderPlaintextFromRichText, type Editor, type TLTextShape } from 'tldraw'
import { CODE_TYPE, CodeLanguageStyle, type CodeShape } from './code-shape-types'
import type { CodeLanguage } from './highlight'
import { INDENT } from './layout'

/** Telltale signs of each language, as a teacher would write them on the board. */
const SIGNS: Record<CodeLanguage, RegExp[]> = {
	python: [/^\s*def \w+\s*\(.*\)\s*:/m, /^\s*(elif|except|with)\b.*:\s*$/m, /^\s*(from \w+ )?import \w+\s*$/m, /\b(True|False|None|self)\b/, /^\s*(for|while|if)\b[^{;]*:\s*$/m, /\bprint\([^;]*\)\s*$/m],
	java: [/\b(public|private|protected)\s/, /\bclass\s+[A-Z]/, /System\.out\./, /\bnew\s+[A-Z]\w*/, /\b(String|boolean|Integer)\b/, /@Override\b/],
	c: [/^\s*#\s*(include|define)\b/m, /\b(printf|scanf|malloc|free|sizeof)\s*\(/, /->/, /\bstruct\s+\w+/, /\bNULL\b/, /\bint\s+main\s*\(\s*(void)?\s*\)/],
}

/** The language some code looks like (the most signs), or `fallback` when nothing tells. */
export function guessLanguage(code: string, fallback: CodeLanguage): CodeLanguage {
	let best = fallback
	let most = 0
	for (const language of Object.keys(SIGNS) as CodeLanguage[]) {
		const signs = SIGNS[language].filter((sign) => sign.test(code)).length
		if (signs > most) [best, most] = [language, signs]
	}
	return best
}

/**
 * A text box made a code box, where it was: its text as the code (tabs as spaces, no trailing
 * blank lines), the language guessed from it (else the style panel's). One undo step.
 */
export function makeCodeBox(editor: Editor, text: TLTextShape) {
	const code = renderPlaintextFromRichText(editor, text.props.richText).replace(/\t/g, INDENT).replace(/\s+$/, '')
	const language = guessLanguage(code, editor.getStyleForNextShape(CodeLanguageStyle))
	const id = createShapeId()
	editor.markHistoryStoppingPoint('make a code box')
	editor.createShape<CodeShape>({
		id,
		type: CODE_TYPE,
		parentId: text.parentId,
		x: text.x,
		y: text.y,
		props: { code, language, size: text.props.size, color: text.props.color },
	})
	editor.deleteShapes([text.id])
	editor.select(id)
}
