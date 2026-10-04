import {
	StylePanelButtonPicker,
	StylePanelSection,
	useEditor,
	useStylePanelContext,
	type StyleValuesForUi,
} from 'tldraw'
import { HASH_SHAPE_TYPE, HashStrategyStyle, type HashStrategy } from '../shapes/hash/hash-shape-types'
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

export const hashPickerTranslations: Record<string, string> = {
	'hash-strategy-style.chaining': 'Separate chaining: a linked list per bucket',
	'hash-strategy-style.probing': 'Linear probing: on to the next free slot',
}

/** Collision handling for hash tables (switching re-inserts the keys), and the misplaced-key check. */
export function HashPickers() {
	const editor = useEditor()
	const { styles, onValueChange } = useStylePanelContext()
	const strategy = styles.get(HashStrategyStyle)
	if (strategy === undefined) return null
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
					const util = editor.getShapeUtil(HASH_SHAPE_TYPE) as HashShapeUtil
					const updates = editor
						.getSelectedShapes()
						.flatMap((shape) => (editor.isShapeOfType(shape, HASH_SHAPE_TYPE) ? [util.withStrategy(shape, value)] : []))
					if (updates.length) editor.updateShapes(updates)
				}}
			/>
			<InvariantPicker />
		</StylePanelSection>
	)
}
