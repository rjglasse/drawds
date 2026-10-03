import { StylePanelButtonPicker, StylePanelSection, useStylePanelContext, type StyleValuesForUi } from 'tldraw'
import { ArraySizingStyle, type ArraySizing } from '../shapes/array/array-shape-types'
import { svgIcon } from './icons'

// Three cells: growing has an arrow past the end; fixed has two in use and a blank spare slot
// before a closing bar.
const SIZING_ITEMS: StyleValuesForUi<ArraySizing> = [
	{
		value: 'grows',
		icon: svgIcon(
			'<rect x="2" y="10" width="18" height="10"/><path d="M8 10V20M14 10V20"/><path d="M22 15H28M25 12L28 15L25 18"/>'
		),
	},
	{
		value: 'fixed',
		icon: svgIcon(
			'<rect x="3" y="10" width="21" height="10"/><path d="M10 10V20M17 10V20" /><rect x="3" y="10" width="14" height="10" fill="black" fill-opacity="0.25" stroke="none"/><path d="M27 7V23" stroke-width="2.5"/>'
		),
	},
]

export const arrayPickerTranslations: Record<string, string> = {
	'array-sizing-style.grows': 'Grows as values come and go (a Python list)',
	'array-sizing-style.fixed': 'Fixed capacity, with a size (a C or Java array)',
}

/** Whether the selected arrays grow, or have a fixed capacity with spare slots past their size. */
export function ArrayPickers() {
	const { styles } = useStylePanelContext()
	const sizing = styles.get(ArraySizingStyle)
	if (sizing === undefined) return null
	return (
		<StylePanelSection>
			<StylePanelButtonPicker title="Length" uiType="array-sizing" style={ArraySizingStyle} items={SIZING_ITEMS} value={sizing} />
		</StylePanelSection>
	)
}
