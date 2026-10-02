import {
	DefaultColorStyle,
	DefaultFontStyle,
	DefaultSizeStyle,
	StyleProp,
	T,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLDefaultColorStyle,
	type TLDefaultFontStyle,
	type TLDefaultSizeStyle,
	type TLShape,
} from 'tldraw'
import { marksValidator, type Marks } from '../../cells/marks'
import { pointersValidator, type Pointer } from '../../pointers/pointers'

export const GRAPH_SHAPE_TYPE = 'graph'

export interface GraphNode {
	/** Stable id (`v0`, `v1`...): the node's cell key and handle id. */
	id: string
	/** The node's label, e.g. "A" or "0". */
	value: string
	/**
	 * Centre in shape space, in cell units (multiples of the size style's cell), so changing the
	 * size scales the whole drawing rather than crowding the nodes.
	 */
	x: number
	y: number
}

export interface GraphEdge {
	/** Stable id (`e0`, `e1`...); marks on the edge are keyed `edge:<id>`. */
	id: string
	from: string
	to: string
	/** Always stored, so switching to weighted and back loses nothing. */
	weight: string
}

/** Whether edges have a direction (drawn with arrowheads). */
export const GraphDirectionStyle = StyleProp.defineEnum('drawds:graph-direction', {
	defaultValue: 'undirected' as const,
	values: ['undirected', 'directed'] as const,
})
export type GraphDirection = T.TypeOf<typeof GraphDirectionStyle>

/** Whether edge weights are shown (and editable). */
export const GraphWeightsStyle = StyleProp.defineEnum('drawds:graph-weights', {
	defaultValue: 'unweighted' as const,
	values: ['unweighted', 'weighted'] as const,
})
export type GraphWeightsMode = T.TypeOf<typeof GraphWeightsStyle>

/** How nodes are labelled: A, B, C... or 0, 1, 2... (indices for dist[v], visited[v]). */
export const GraphLabelsStyle = StyleProp.defineEnum('drawds:graph-labels', {
	defaultValue: 'letters' as const,
	values: ['letters', 'numbers'] as const,
})
export type GraphLabelsMode = T.TypeOf<typeof GraphLabelsStyle>

export interface GraphShapeProps {
	/** Nodes in creation order (the order labels follow). */
	nodes: GraphNode[]
	edges: GraphEdge[]
	direction: GraphDirection
	weights: GraphWeightsMode
	labels: GraphLabelsMode
	seed: number
	/** Highlight colours, keyed by node id or `edge:<edge id>`. */
	marks: Marks
	/** Named pointers (s, u, v...) at node ids. */
	pointers: Pointer[]
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[GRAPH_SHAPE_TYPE]: GraphShapeProps
	}
}

export type GraphShape = TLShape<typeof GRAPH_SHAPE_TYPE>

export const graphShapeProps: RecordProps<GraphShape> = {
	nodes: T.arrayOf(T.object({ id: T.string, value: T.string, x: T.number, y: T.number })),
	edges: T.arrayOf(T.object({ id: T.string, from: T.string, to: T.string, weight: T.string })),
	direction: GraphDirectionStyle,
	weights: GraphWeightsStyle,
	labels: GraphLabelsStyle,
	seed: T.number,
	marks: marksValidator,
	pointers: pointersValidator,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

const versions = createShapePropsMigrationIds(GRAPH_SHAPE_TYPE, {
	AddPointers: 1,
})

/** Graphs are persisted in the browser, so every props change needs a step here. */
export const graphShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: versions.AddPointers,
			up(props) {
				props.pointers = []
			},
			down(props) {
				delete props.pointers
			},
		},
	],
})
