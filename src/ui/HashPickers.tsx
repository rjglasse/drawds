import {
	StylePanelButtonPicker,
	StylePanelSection,
	useEditor,
	useStylePanelContext,
	type StyleValuesForUi,
} from 'tldraw'
import {
	HASH_SHAPE_TYPE,
	HashCodeStyle,
	HashCompressionStyle,
	HashStrategyStyle,
	type HashCode,
	type HashCompression,
	type HashStrategy,
} from '../shapes/hash/hash-shape-types'
import type { HashScheme } from '../shapes/hash/hash'
import type { HashShapeUtil } from '../shapes/hash/HashShapeUtil'
import { svgIcon } from './icons'
import { InvariantPicker } from './InvariantPicker'

// Buckets with a chain hanging off one; a column of slots, one key moved on to the next slot.
const STRATEGY_ITEMS: StyleValuesForUi<HashStrategy> = [
	{
		value: 'chaining',
		icon: svgIcon('<rect x="3" y="5" width="6" height="20"/><path d="M3 12h6M3 18h6M9 15h4"/><rect x="13" y="12" width="6" height="6"/><path d="M19 15h3"/><rect x="22" y="12" width="6" height="6"/>'),
	},
	{
		value: 'probing',
		icon: svgIcon('<rect x="9" y="3" width="12" height="24"/><path d="M9 9h12M9 15h12M9 21h12"/><path d="M24 6C28 8 28 10 24 12"/><path d="M24.5 12L22.5 11L23.5 13.5Z" fill="black"/>'),
	},
]

const label = (text: string, size: number) =>
	svgIcon(
		`<text x="15" y="19.5" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="${size}" fill="black" stroke="none">${text}</text>`
	)

// Lecture 7: how a key becomes a number, then how that number becomes a bucket.
const CODE_ITEMS: StyleValuesForUi<HashCode> = [
	{ value: 'sum', icon: label('Σc', 12) },
	{ value: 'letters', icon: label('A=1', 10) },
	{ value: 'java', icon: label('31h', 11) },
	{ value: 'direct', icon: label('k', 15) },
]

const COMPRESSION_ITEMS: StyleValuesForUi<HashCompression> = [
	{ value: 'mod', icon: label('mod', 10) },
	{ value: 'mad', icon: label('MAD', 10) },
]

export const hashPickerTranslations: Record<string, string> = {
	'hash-strategy-style.chaining': 'Separate chaining: a linked list per bucket',
	'hash-strategy-style.probing': 'Linear probing: on to the next free slot',
	'hash-code-style.sum': 'Hash code: the character codes added',
	'hash-code-style.letters': 'Hash code: the first three letters, A = 1, added (KIM = 33)',
	'hash-code-style.java': "Hash code: Java's String.hashCode, h = 31·h + c",
	'hash-code-style.direct': 'Direct addressing: the key is the index (whole numbers only)',
	'hash-compress-style.mod': 'Compression: h mod m',
	'hash-compress-style.mad': 'Compression: MAD, ((a·h + b) mod p) mod m',
}

/** Collision handling for hash tables (switching re-inserts the keys), and the misplaced-key check. */
export function HashPickers() {
	const editor = useEditor()
	const { styles, onValueChange } = useStylePanelContext()
	const strategy = styles.get(HashStrategyStyle)
	const code = styles.get(HashCodeStyle)
	const compress = styles.get(HashCompressionStyle)
	if (strategy === undefined) return null
	// A selected table takes the change too: its keys go in again where the new scheme puts them.
	const rebuild = (change: Partial<HashScheme>) => {
		const util = editor.getShapeUtil(HASH_SHAPE_TYPE) as HashShapeUtil
		const updates = editor.getSelectedShapes().flatMap((shape) => (editor.isShapeOfType(shape, HASH_SHAPE_TYPE) ? [util.withScheme(shape, change)] : []))
		if (updates.length) editor.updateShapes(updates)
	}
	return (
		<StylePanelSection>
			<StylePanelButtonPicker
				title="Collisions"
				uiType="hash-strategy"
				style={HashStrategyStyle}
				items={STRATEGY_ITEMS}
				value={strategy}
				onValueChange={(style, value) => {
					onValueChange(style, value)
					rebuild({ strategy: value })
				}}
			/>
			{code !== undefined && (
				<StylePanelButtonPicker
					title="Hash code"
					uiType="hash-code"
					style={HashCodeStyle}
					items={CODE_ITEMS}
					value={code}
					onValueChange={(style, value) => {
						onValueChange(style, value)
						rebuild({ code: value })
					}}
				/>
			)}
			{compress !== undefined && !(code?.type === 'shared' && code.value === 'direct') && (
				<StylePanelButtonPicker
					title="Compression"
					uiType="hash-compress"
					style={HashCompressionStyle}
					items={COMPRESSION_ITEMS}
					value={compress}
					onValueChange={(style, value) => {
						onValueChange(style, value)
						rebuild({ compress: value })
					}}
				/>
			)}
			<InvariantPicker />
		</StylePanelSection>
	)
}
