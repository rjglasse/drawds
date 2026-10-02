import {
	StylePanelDropdownPicker,
	StylePanelSection,
	useEditor,
	useStylePanelContext,
	type StyleValuesForUi,
} from 'tldraw'
import type { FillMode } from '../data/fill'
import { FillStyle, refillSelectedShapes } from '../data/fill-style'
import { svgIcon } from './icons'

const bars = (heights: number[]) =>
	heights
		.map((h, i) => `<rect x="${4 + i * 6}" y="${25 - h}" width="4" height="${h}" fill="black" stroke="none"/>`)
		.join('')

const FILL_ITEMS: StyleValuesForUi<FillMode> = [
	{
		value: 'random',
		icon: svgIcon(
			'<rect x="5" y="5" width="20" height="20" rx="4"/><circle cx="10.5" cy="10.5" r="2" fill="black" stroke="none"/><circle cx="15" cy="15" r="2" fill="black" stroke="none"/><circle cx="19.5" cy="19.5" r="2" fill="black" stroke="none"/>'
		),
	},
	{
		value: 'repeats',
		icon: svgIcon(
			'<rect x="2" y="9" width="12" height="12" rx="3"/><rect x="16" y="9" width="12" height="12" rx="3"/><circle cx="8" cy="15" r="1.8" fill="black" stroke="none"/><circle cx="22" cy="15" r="1.8" fill="black" stroke="none"/>'
		),
	},
	{ value: 'empty', icon: svgIcon('<rect x="3" y="10" width="24" height="10" rx="1"/><path d="M11 10v10M19 10v10"/>') },
	{ value: 'ascending', icon: svgIcon(bars([5, 10, 15, 20])) },
	{ value: 'descending', icon: svgIcon(bars([20, 15, 10, 5])) },
	{ value: 'nearly-sorted', icon: svgIcon(bars([5, 15, 10, 20])) },
	{
		value: 'letters',
		icon: svgIcon(
			'<text x="15" y="22" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="20" fill="black" stroke="none">A</text>'
		),
	},
]

/** UI strings for the picker, merged into tldraw's translations. */
export const fillPickerTranslations: Record<string, string> = {
	'style-panel.fill-mode': 'Fill',
	'fill-mode-style.random': 'Random (distinct)',
	'fill-mode-style.repeats': 'Random (repeats allowed)',
	'fill-mode-style.empty': 'Empty',
	'fill-mode-style.ascending': 'Ascending',
	'fill-mode-style.descending': 'Descending',
	'fill-mode-style.nearly-sorted': 'Nearly sorted',
	'fill-mode-style.letters': 'Letters',
}

/**
 * Fill mode in the style panel. Picking a mode sets it for the next shape and, for selected
 * shapes, regenerates their values from their seed (so "ascending" sorts the same numbers).
 */
export function FillPicker() {
	const editor = useEditor()
	const { styles, onValueChange } = useStylePanelContext()
	const fill = styles.get(FillStyle)
	if (fill === undefined) return null
	return (
		<StylePanelSection>
			<StylePanelDropdownPicker
				id="fill-mode"
				label="style-panel.fill-mode"
				uiType="fill-mode"
				stylePanelType="fill-mode"
				testIdType="fill-mode"
				type="menu"
				style={FillStyle}
				items={FILL_ITEMS}
				value={fill}
				onValueChange={(style, value) => {
					onValueChange(style, value)
					refillSelectedShapes(editor)
				}}
			/>
		</StylePanelSection>
	)
}
