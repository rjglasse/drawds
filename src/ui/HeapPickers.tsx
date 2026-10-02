import {
	StylePanelButtonPicker,
	StylePanelSection,
	useEditor,
	useStylePanelContext,
	type StyleValuesForUi,
} from 'tldraw'
import type { HeapType } from '../shapes/heap/heap'
import { HEAP_SHAPE_TYPE, HeapTypeStyle } from '../shapes/heap/heap-shape-types'
import type { HeapShapeUtil } from '../shapes/heap/HeapShapeUtil'
import { svgIcon } from './icons'

const label = (text: string) =>
	svgIcon(
		`<text x="15" y="20" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="11" fill="black" stroke="none">${text}</text>`
	)

const HEAP_ITEMS: StyleValuesForUi<HeapType> = [
	{ value: 'min', icon: label('min') },
	{ value: 'max', icon: label('max') },
]

export const heapPickerTranslations: Record<string, string> = {
	'heap-type-style.min': 'Min heap',
	'heap-type-style.max': 'Max heap',
}

/** Min or max heap; switching a selected heap rebuilds it (Floyd's heapify). */
export function HeapPickers() {
	const editor = useEditor()
	const { styles, onValueChange } = useStylePanelContext()
	const heapType = styles.get(HeapTypeStyle)
	if (heapType === undefined) return null
	return (
		<StylePanelSection>
			<StylePanelButtonPicker
				title="Heap"
				uiType="heap-type"
				style={HeapTypeStyle}
				items={HEAP_ITEMS}
				value={heapType}
				onValueChange={(style, value) => {
					onValueChange(style, value)
					const util = editor.getShapeUtil(HEAP_SHAPE_TYPE) as HeapShapeUtil
					const updates = editor
						.getSelectedShapes()
						.flatMap((shape) => (editor.isShapeOfType(shape, HEAP_SHAPE_TYPE) ? [util.reheapify(shape)] : []))
					if (updates.length) editor.updateShapes(updates)
				}}
			/>
		</StylePanelSection>
	)
}
