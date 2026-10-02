import { StylePanelButtonPicker, StylePanelSection, useStylePanelContext, type StyleValuesForUi } from 'tldraw'
import { NullsStyle, type NullsMode } from '../shapes/tree/tree-shape-types'
import { svgIcon } from './icons'

const NODE = '<circle cx="15" cy="7" r="4"/><path d="M12.5 10.5L8 18M17.5 10.5L22 18"/>'

const NULLS_ITEMS: StyleValuesForUi<NullsMode> = [
	{ value: 'hide', icon: svgIcon(NODE) },
	{
		value: 'show',
		icon: svgIcon(`${NODE}<path d="M4 21h8M18 21h8" stroke-width="2.5"/><path d="M6 25h4M20 25h4"/>`),
	},
]

export const nullsPickerTranslations: Record<string, string> = {
	'nulls-style.hide': 'Hide null children',
	'nulls-style.show': 'Show null children',
}

/** Show or hide null children on trees (style panel). */
export function NullsPicker() {
	const { styles } = useStylePanelContext()
	const nulls = styles.get(NullsStyle)
	if (nulls === undefined) return null
	return (
		<StylePanelSection>
			<StylePanelButtonPicker title="Null children" uiType="nulls" style={NullsStyle} items={NULLS_ITEMS} value={nulls} />
		</StylePanelSection>
	)
}
