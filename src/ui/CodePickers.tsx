import { StylePanelButtonPicker, StylePanelSection, useStylePanelContext, type StyleValuesForUi } from 'tldraw'
import { CodeLanguageStyle } from '../shapes/code/code-shape-types'
import type { CodeLanguage } from '../shapes/code/highlight'
import { svgIcon } from './icons'

const label = (text: string, size = 12.5) =>
	svgIcon(
		`<text x="15" y="20" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="${size}" fill="black" stroke="none">${text}</text>`
	)

const LANGUAGE_ITEMS: StyleValuesForUi<CodeLanguage> = [
	{ value: 'c', icon: label('C', 15) },
	{ value: 'java', icon: label('Java', 10.5) },
	{ value: 'python', icon: label('Py', 13) },
]

export const codePickerTranslations: Record<string, string> = {
	'code-language-style.c': 'C',
	'code-language-style.java': 'Java',
	'code-language-style.python': 'Python',
}

/** The language a code box is highlighted as. */
export function CodePickers() {
	const { styles, onValueChange } = useStylePanelContext()
	const language = styles.get(CodeLanguageStyle)
	if (language === undefined) return null
	return (
		<StylePanelSection>
			<StylePanelButtonPicker title="Language" uiType="code-language" style={CodeLanguageStyle} items={LANGUAGE_ITEMS} value={language} onValueChange={onValueChange} />
		</StylePanelSection>
	)
}
