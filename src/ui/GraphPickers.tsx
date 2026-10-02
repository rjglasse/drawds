import {
	StylePanelButtonPicker,
	StylePanelSection,
	useEditor,
	useStylePanelContext,
	type Editor,
	type StyleValuesForUi,
	type TLShapePartial,
} from 'tldraw'
import {
	GRAPH_SHAPE_TYPE,
	GraphDirectionStyle,
	GraphLabelsStyle,
	GraphWeightsStyle,
	type GraphDirection,
	type GraphLabelsMode,
	type GraphShape,
	type GraphWeightsMode,
} from '../shapes/graph/graph-shape-types'
import type { GraphShapeUtil } from '../shapes/graph/GraphShapeUtil'
import { svgIcon } from './icons'

const text = (label: string, size: number) =>
	svgIcon(
		`<text x="15" y="20.5" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="${size}" fill="black" stroke="none">${label}</text>`
	)
const DOTS = '<circle cx="6" cy="21" r="3"/><circle cx="24" cy="9" r="3"/>'

const DIRECTION_ITEMS: StyleValuesForUi<GraphDirection> = [
	{ value: 'undirected', icon: svgIcon(`${DOTS}<path d="M8.5 19.3L21.5 10.7"/>`) },
	{ value: 'directed', icon: svgIcon(`${DOTS}<path d="M8.5 19.3L18 13"/><path d="M21.4 10.8L14.7 12.1L18.6 16.6Z" fill="black"/>`) },
]

const WEIGHT_ITEMS: StyleValuesForUi<GraphWeightsMode> = [
	{ value: 'unweighted', icon: svgIcon('<path d="M4 15H26"/>') },
	{
		value: 'weighted',
		icon: svgIcon(
			'<path d="M3 15H9.5M20.5 15H27"/><text x="15" y="20.5" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="15" fill="black" stroke="none">5</text>'
		),
	},
]

const LABEL_ITEMS: StyleValuesForUi<GraphLabelsMode> = [
	{ value: 'letters', icon: text('AB', 15) },
	{ value: 'numbers', icon: text('01', 15) },
]

export const graphPickerTranslations: Record<string, string> = {
	'graph-direction-style.undirected': 'Undirected',
	'graph-direction-style.directed': 'Directed',
	'graph-weights-style.unweighted': 'Unweighted',
	'graph-weights-style.weighted': 'Weighted',
	'graph-labels-style.letters': 'Label nodes A, B, C...',
	'graph-labels-style.numbers': 'Label nodes 0, 1, 2...',
}

/** Apply a graph option to the selected graphs, in the same undo step as the style change. */
function updateSelectedGraphs(editor: Editor, f: (util: GraphShapeUtil, shape: GraphShape) => TLShapePartial<GraphShape>) {
	const util = editor.getShapeUtil(GRAPH_SHAPE_TYPE) as GraphShapeUtil
	const updates = editor
		.getSelectedShapes()
		.flatMap((shape) => (editor.isShapeOfType(shape, GRAPH_SHAPE_TYPE) ? [f(util, shape)] : []))
	if (updates.length) editor.updateShapes(updates)
}

/**
 * Graph options: directed or not (back to undirected merges u->v / v->u twins), weights shown or
 * not, and node labels as letters or numbers (relabels the selected graph).
 */
export function GraphPickers() {
	const editor = useEditor()
	const { styles, onValueChange } = useStylePanelContext()
	const direction = styles.get(GraphDirectionStyle)
	const weights = styles.get(GraphWeightsStyle)
	const labels = styles.get(GraphLabelsStyle)
	if (direction === undefined && weights === undefined && labels === undefined) return null
	return (
		<StylePanelSection>
			{direction !== undefined && (
				<StylePanelButtonPicker
					title="Edges"
					uiType="graph-direction"
					style={GraphDirectionStyle}
					items={DIRECTION_ITEMS}
					value={direction}
					onValueChange={(style, value) => {
						onValueChange(style, value)
						updateSelectedGraphs(editor, (util, shape) => util.withDirection(shape, value))
					}}
				/>
			)}
			{weights !== undefined && (
				<StylePanelButtonPicker title="Weights" uiType="graph-weights" style={GraphWeightsStyle} items={WEIGHT_ITEMS} value={weights} />
			)}
			{labels !== undefined && (
				<StylePanelButtonPicker
					title="Labels"
					uiType="graph-labels"
					style={GraphLabelsStyle}
					items={LABEL_ITEMS}
					value={labels}
					onValueChange={(style, value) => {
						onValueChange(style, value)
						updateSelectedGraphs(editor, (util, shape) => util.withLabels(shape, value))
					}}
				/>
			)}
		</StylePanelSection>
	)
}
