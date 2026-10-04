import { StylePanelButtonPicker, useStylePanelContext, type StyleValuesForUi } from 'tldraw'
import { InvariantStyle, type InvariantMode } from '../cells/invariant-style'
import { svgIcon } from './icons'

// A node with a dashed warning ring round it; a plain node.
const ITEMS: StyleValuesForUi<InvariantMode> = [
	{ value: 'check', icon: svgIcon('<circle cx="15" cy="15" r="6"/><circle cx="15" cy="15" r="11" stroke-dasharray="3 2.5"/>') },
	{ value: 'off', icon: svgIcon('<circle cx="15" cy="15" r="6"/>') },
]

export const invariantPickerTranslations: Record<string, string> = {
	'invariant-style.check': 'Ring the elements that break the order (BST) or the heap property',
	'invariant-style.off': 'Ring nothing (for "what is wrong with this one?" exercises)',
}

/** Whether a BST or heap rings the elements that break its invariant. Inside a StylePanelSection. */
export function InvariantPicker() {
	const { styles } = useStylePanelContext()
	const value = styles.get(InvariantStyle)
	if (value === undefined) return null
	return <StylePanelButtonPicker title="Check" uiType="invariant" style={InvariantStyle} items={ITEMS} value={value} />
}
