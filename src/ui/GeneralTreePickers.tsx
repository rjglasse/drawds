import {
	StylePanelButtonPicker,
	StylePanelSection,
	useEditor,
	useStylePanelContext,
	type StyleValuesForUi,
} from 'tldraw'
import {
	ArityStyle,
	GENERAL_TREE_SHAPE_TYPE,
	type Arity,
	type GeneralTreeShape,
} from '../shapes/general-tree/general-tree-shape-types'
import type { GeneralTreeShapeUtil } from '../shapes/general-tree/GeneralTreeShapeUtil'
import { svgIcon } from './icons'

/** A node and its k children, spread under it. */
function arityIcon(k: number) {
	const step = 22 / (k - 1)
	const r = Math.min(3, step / 2 - 0.6)
	const kids = Array.from({ length: k }, (_, i) => 4 + i * step)
	const lines = kids.map((x) => `M15 10.5L${x.toFixed(1)} ${(23 - r).toFixed(1)}`).join('')
	const dots = kids.map((x) => `<circle cx="${x.toFixed(1)}" cy="24" r="${r.toFixed(1)}"/>`).join('')
	return svgIcon(`<circle cx="15" cy="7" r="3.5"/><path d="${lines}" stroke-width="1.5"/>${dots}`)
}

const ARITY_ITEMS: StyleValuesForUi<Arity> = (['3', '4', '5', '6'] as const).map((value) => ({ value, icon: arityIcon(Number(value)) }))

export const generalTreePickerTranslations: Record<string, string> = Object.fromEntries(
	ARITY_ITEMS.map(({ value }) => [`tree-arity-style.${value}`, `Up to ${value} children a node`])
)

/**
 * A general tree's children per node: the most a node gets when it is sketched. Picked with trees
 * selected, they are sketched again with it (values typed in stay).
 */
export function GeneralTreePickers() {
	const editor = useEditor()
	const { styles, onValueChange } = useStylePanelContext()
	const arity = styles.get(ArityStyle)
	if (arity === undefined) return null
	return (
		<StylePanelSection>
			<StylePanelButtonPicker
				title="Children per node"
				uiType="tree-arity"
				style={ArityStyle}
				items={ARITY_ITEMS}
				value={arity}
				onValueChange={(style, value) => {
					// Worked out from the trees as they were sketched, before the style changes them.
					const util = editor.getShapeUtil(GENERAL_TREE_SHAPE_TYPE) as GeneralTreeShapeUtil
					const updates = editor
						.getSelectedShapes()
						.flatMap((shape) =>
							editor.isShapeOfType(shape, GENERAL_TREE_SHAPE_TYPE) && shape.props.arity !== value
								? [util.withArity(shape as GeneralTreeShape, value)]
								: []
						)
					onValueChange(style, value)
					if (updates.length) editor.updateShapes(updates)
				}}
			/>
		</StylePanelSection>
	)
}
