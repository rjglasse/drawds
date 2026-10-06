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
	GraphDensityStyle,
	GraphDirectionStyle,
	GraphLabelsStyle,
	GraphOrderStyle,
	GraphPartsStyle,
	GraphWeightsStyle,
	type GraphDensity,
	type GraphDirection,
	type GraphLabelsMode,
	type GraphOrder,
	type GraphParts,
	type GraphShape,
	type GraphWeightsMode,
} from '../shapes/graph/graph-shape-types'
import type { GraphShapeUtil } from '../shapes/graph/GraphShapeUtil'
import { GraphViewKindStyle, type GraphViewKind } from '../shapes/graph-view/graph-view-shape-types'
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

// Four nodes: a path, a path and a diagonal, every pair joined.
const FOUR = '<circle cx="6" cy="6" r="2.5"/><circle cx="24" cy="6" r="2.5"/><circle cx="6" cy="24" r="2.5"/><circle cx="24" cy="24" r="2.5"/>'
const DENSITY_ITEMS: StyleValuesForUi<GraphDensity> = [
	{ value: 'sparse', icon: svgIcon(`${FOUR}<path d="M8.5 6H21.5M24 8.5V21.5M21.5 24H8.5"/>`) },
	{ value: 'medium', icon: svgIcon(`${FOUR}<path d="M8.5 6H21.5M24 8.5V21.5M21.5 24H8.5M8 22L22 8"/>`) },
	{ value: 'dense', icon: svgIcon(`${FOUR}<path d="M8.5 6H21.5M24 8.5V21.5M21.5 24H8.5M6 8.5V21.5M8 22L22 8M8 8L22 22"/>`) },
]

// One piece of four nodes; two pieces of two.
const PARTS_ITEMS: StyleValuesForUi<GraphParts> = [
	{ value: 'connected', icon: svgIcon(`${FOUR}<path d="M8.5 6H21.5M24 8.5V21.5M21.5 24H8.5"/>`) },
	{ value: 'components', icon: svgIcon(`${FOUR}<path d="M8.5 6H21.5M8.5 24H21.5"/>`) },
]

// Arrows any way round, with a cycle; arrows all left to right.
const ORDER_ITEMS: StyleValuesForUi<GraphOrder> = [
	{
		value: 'any',
		icon: svgIcon(
			'<circle cx="5" cy="22" r="2.5"/><circle cx="15" cy="6" r="2.5"/><circle cx="25" cy="22" r="2.5"/><path d="M6.5 19.5L12.5 9M17.5 9L23.5 19.5M22.5 22H7.5"/><path d="M10 22L7.5 22L10 20Z" fill="black"/>'
		),
	},
	{
		value: 'dag',
		icon: svgIcon(
			'<circle cx="5" cy="22" r="2.5"/><circle cx="15" cy="6" r="2.5"/><circle cx="25" cy="22" r="2.5"/><path d="M6.5 19.5L12.5 9M17.5 9L23.5 19.5M7.5 22H22.5"/><path d="M20 22L22.5 22L20 20Z" fill="black"/>'
		),
	},
]

export const graphPickerTranslations: Record<string, string> = {
	'graph-density-style.sparse': 'Sketch sparse graphs: just a spanning tree, no cycles',
	'graph-density-style.medium': 'Sketch graphs of medium density',
	'graph-density-style.dense': 'Sketch dense graphs: many edges between near nodes',
	'graph-parts-style.connected': 'Sketch connected graphs: one piece',
	'graph-parts-style.components': 'Sketch graphs in several pieces (components)',
	'graph-order-style.any': 'Edges point either way (cycles possible)',
	'graph-order-style.dag': 'Edges point along the drag: no cycles (a DAG, for topological sort)',
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
 * not, node labels as letters or numbers (relabels the selected graph), and how sketches come out:
 * density, one piece or several, and (directed) a DAG; those rewire the selected graph.
 */
export function GraphPickers() {
	const editor = useEditor()
	const { styles, onValueChange } = useStylePanelContext()
	const direction = styles.get(GraphDirectionStyle)
	const weights = styles.get(GraphWeightsStyle)
	const labels = styles.get(GraphLabelsStyle)
	const density = styles.get(GraphDensityStyle)
	const parts = styles.get(GraphPartsStyle)
	const order = styles.get(GraphOrderStyle)
	if (direction === undefined && weights === undefined && labels === undefined) return null
	// A new sketch option rewires the selected graphs too (as Fill regenerates values).
	const rewire = (change: Partial<Pick<GraphShape['props'], 'density' | 'parts' | 'order'>>) =>
		updateSelectedGraphs(editor, (util, shape) => util.withSketchOptions(shape, change))
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
			{density !== undefined && (
				<StylePanelButtonPicker
					title="Density"
					uiType="graph-density"
					style={GraphDensityStyle}
					items={DENSITY_ITEMS}
					value={density}
					onValueChange={(style, value) => {
						onValueChange(style, value)
						rewire({ density: value })
					}}
				/>
			)}
			{parts !== undefined && (
				<StylePanelButtonPicker
					title="Pieces"
					uiType="graph-parts"
					style={GraphPartsStyle}
					items={PARTS_ITEMS}
					value={parts}
					onValueChange={(style, value) => {
						onValueChange(style, value)
						rewire({ parts: value })
					}}
				/>
			)}
			{/* Only directed edges can form a DAG. */}
			{order !== undefined && direction?.type === 'shared' && direction.value === 'directed' && (
				<StylePanelButtonPicker
					title="Order"
					uiType="graph-order"
					style={GraphOrderStyle}
					items={ORDER_ITEMS}
					value={order}
					onValueChange={(style, value) => {
						onValueChange(style, value)
						rewire({ order: value })
					}}
				/>
			)}
		</StylePanelSection>
	)
}

// A grid; rows of a head cell with a chain.
const VIEW_ITEMS: StyleValuesForUi<GraphViewKind> = [
	{ value: 'matrix', icon: svgIcon('<rect x="5" y="5" width="20" height="20"/><path d="M11.7 5v20M18.3 5v20M5 11.7h20M5 18.3h20"/>') },
	{
		value: 'lists',
		icon: svgIcon('<rect x="3" y="5" width="6" height="6"/><rect x="13" y="5" width="6" height="6"/><path d="M9 8h4"/><rect x="3" y="19" width="6" height="6"/><rect x="13" y="19" width="6" height="6"/><rect x="23" y="19" width="5" height="6"/><path d="M9 22h4M19 22h4"/>'),
	},
	{
		value: 'union-find',
		// Two small trees, children pointing up at their roots, over the parent array.
		icon: svgIcon('<circle cx="8" cy="5" r="2.5"/><circle cx="4" cy="13" r="2.5"/><circle cx="12" cy="13" r="2.5"/><circle cx="22" cy="9" r="2.5"/><path d="M5.2 10.8L7 7.3M10.8 10.8L9 7.3"/><rect x="3" y="20" width="24" height="6"/><path d="M11 20v6M19 20v6"/>'),
	},
]

export const graphViewPickerTranslations: Record<string, string> = {
	'graph-view-style.matrix': 'Adjacency matrix',
	'graph-view-style.lists': 'Adjacency lists',
	'graph-view-style.union-find': "Union-find (Kruskal's sets)",
}

/** A graph view shows its graph as an adjacency matrix, as adjacency lists, or as Kruskal's union-find. */
export function GraphViewPickers() {
	const { styles } = useStylePanelContext()
	const view = styles.get(GraphViewKindStyle)
	if (view === undefined) return null
	return (
		<StylePanelSection>
			<StylePanelButtonPicker title="View" uiType="graph-view" style={GraphViewKindStyle} items={VIEW_ITEMS} value={view} />
		</StylePanelSection>
	)
}
