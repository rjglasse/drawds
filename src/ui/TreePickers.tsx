import {
	StylePanelButtonPicker,
	StylePanelSection,
	useEditor,
	useStylePanelContext,
	type StyleValuesForUi,
} from 'tldraw'
import {
	NullsStyle,
	TREE_SHAPE_TYPE,
	TreeKindStyle,
	type NullsMode,
	type TreeKind,
} from '../shapes/tree/tree-shape-types'
import type { TreeShapeUtil } from '../shapes/tree/TreeShapeUtil'
import { svgIcon } from './icons'
import { InvariantPicker } from './InvariantPicker'

const NODE = '<circle cx="15" cy="7" r="4"/><path d="M12.5 10.5L8 18M17.5 10.5L22 18"/>'
const TREE = `${NODE}<circle cx="7" cy="21" r="3"/><circle cx="23" cy="21" r="3"/>`

const NULLS_ITEMS: StyleValuesForUi<NullsMode> = [
	{ value: 'hide', icon: svgIcon(NODE) },
	{ value: 'show', icon: svgIcon(`${NODE}<path d="M4 21h8M18 21h8" stroke-width="2.5"/><path d="M6 25h4M20 25h4"/>`) },
]

const KIND_ITEMS: StyleValuesForUi<TreeKind> = [
	{ value: 'tree', icon: svgIcon(TREE) },
	{
		value: 'bst',
		icon: svgIcon(
			'<text x="15" y="20" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="11" fill="black" stroke="none">BST</text>'
		),
	},
]

export const treePickerTranslations: Record<string, string> = {
	'nulls-style.hide': 'Hide null children',
	'nulls-style.show': 'Show null children',
	'tree-kind-style.tree': 'Binary tree',
	'tree-kind-style.bst': 'Binary search tree',
}

/** Tree options in the style panel: plain tree or BST, and whether to draw null children. */
export function TreePickers() {
	const editor = useEditor()
	const { styles, onValueChange } = useStylePanelContext()
	const kind = styles.get(TreeKindStyle)
	const nulls = styles.get(NullsStyle)
	if (kind === undefined && nulls === undefined) return null
	return (
		<StylePanelSection>
			{kind !== undefined && (
				<StylePanelButtonPicker
					title="Tree kind"
					uiType="tree-kind"
					style={TreeKindStyle}
					items={KIND_ITEMS}
					value={kind}
					onValueChange={(style, value) => {
						onValueChange(style, value)
						// Turning a tree into a BST keeps its keys and sorts them into in-order positions.
						if (value !== 'bst') return
						const util = editor.getShapeUtil(TREE_SHAPE_TYPE) as TreeShapeUtil
						const updates = editor
							.getSelectedShapes()
							.flatMap((shape) => (editor.isShapeOfType(shape, TREE_SHAPE_TYPE) ? [util.arrangeAsBst(shape)] : []))
						if (updates.length) editor.updateShapes(updates)
					}}
				/>
			)}
			{nulls !== undefined && (
				<StylePanelButtonPicker title="Null children" uiType="nulls" style={NullsStyle} items={NULLS_ITEMS} value={nulls} />
			)}
			{/* Only a BST has an order to check. */}
			{kind?.type === 'shared' && kind.value === 'bst' && <InvariantPicker />}
		</StylePanelSection>
	)
}
