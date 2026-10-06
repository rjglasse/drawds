import { StylePanelButtonPicker, StylePanelSection, useStylePanelContext, type StyleValuesForUi } from 'tldraw'
import type { UnionBy } from '../shapes/union-find/union-find'
import { CompressionStyle, UnionByStyle, type Compression } from '../shapes/union-find/union-find-shape-types'
import { svgIcon } from './icons'

const label = (text: string) =>
	svgIcon(
		`<text x="15" y="20" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="12.5" fill="black" stroke="none">${text}</text>`
	)

const UNION_ITEMS: StyleValuesForUi<UnionBy> = [
	{ value: 'size', icon: label('size') },
	{ value: 'rank', icon: label('rank') },
	{ value: 'naive', icon: label('any') },
]

const COMPRESSION_ITEMS: StyleValuesForUi<Compression> = [
	{ value: 'on', icon: label('on') },
	{ value: 'off', icon: label('off') },
]

export const unionFindPickerTranslations: Record<string, string> = {
	'uf-union-style.size': 'Union by size: the smaller tree goes under the bigger root',
	'uf-union-style.rank': 'Union by rank: the lower-ranked root goes under the higher',
	'uf-union-style.naive': "Naive union: a's root goes under b's, whatever their sizes",
	'uf-compress-style.on': 'Path compression on: find points the nodes on its way straight at the root',
	'uf-compress-style.off': 'Path compression off',
}

/** How a union-find links roots, and whether find compresses paths: for the next operations. */
export function UnionFindPickers() {
	const { styles, onValueChange } = useStylePanelContext()
	const unionBy = styles.get(UnionByStyle)
	const compression = styles.get(CompressionStyle)
	if (unionBy === undefined || compression === undefined) return null
	return (
		<StylePanelSection>
			<StylePanelButtonPicker title="Union by" uiType="uf-union" style={UnionByStyle} items={UNION_ITEMS} value={unionBy} onValueChange={onValueChange} />
			<StylePanelButtonPicker
				title="Path compression"
				uiType="uf-compress"
				style={CompressionStyle}
				items={COMPRESSION_ITEMS}
				value={compression}
				onValueChange={onValueChange}
			/>
		</StylePanelSection>
	)
}
