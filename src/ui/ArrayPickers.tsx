import { StylePanelButtonPicker, StylePanelSection, useStylePanelContext, type StyleValuesForUi } from 'tldraw'
import { ArrayKindStyle, ArraySizingStyle, type ArrayKind, type ArraySizing } from '../shapes/array/array-shape-types'
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

// A row of cells; an upright stack with an arrow at its top; a row with arrows in and out.
const KIND_ITEMS: StyleValuesForUi<ArrayKind> = [
	{ value: 'array', icon: svgIcon('<rect x="3" y="10" width="24" height="10"/><path d="M11 10V20M19 10V20"/>') },
	{ value: 'stack', icon: svgIcon('<rect x="9" y="8" width="12" height="20"/><path d="M9 18H21"/><path d="M15 2V6M12.5 4.5L15 2L17.5 4.5"/>') },
	{
		value: 'queue',
		icon: svgIcon('<rect x="7" y="10" width="16" height="10"/><path d="M15 10V20"/><path d="M1 15H5M3.5 13L5 15L3.5 17M25 15H29M27.5 13L29 15L27.5 17"/>'),
	},
]

export const arrayPickerTranslations: Record<string, string> = {
	'array-kind-style.array': 'Array',
	'array-kind-style.stack': 'Stack: upright, with a top',
	'array-kind-style.queue': 'Queue: front and rear (a circular buffer when its capacity is fixed)',
	'array-sizing-style.grows': 'Grows as values come and go (a Python list)',
	'array-sizing-style.fixed': 'Fixed capacity, with a size (a C or Java array)',
}

/**
 * What the selected arrays are (a plain array, a stack, a queue), and whether they grow or have a
 * fixed capacity with spare slots past their size.
 */
export function ArrayPickers() {
	const { styles } = useStylePanelContext()
	const sizing = styles.get(ArraySizingStyle)
	const kind = styles.get(ArrayKindStyle)
	if (sizing === undefined && kind === undefined) return null
	return (
		<StylePanelSection>
			{kind !== undefined && <StylePanelButtonPicker title="Kind" uiType="array-kind" style={ArrayKindStyle} items={KIND_ITEMS} value={kind} />}
			{sizing !== undefined && (
				<StylePanelButtonPicker title="Length" uiType="array-sizing" style={ArraySizingStyle} items={SIZING_ITEMS} value={sizing} />
			)}
		</StylePanelSection>
	)
}
