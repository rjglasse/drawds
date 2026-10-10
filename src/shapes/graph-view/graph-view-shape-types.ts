import {
	DefaultColorStyle,
	DefaultFontStyle,
	DefaultSizeStyle,
	StyleProp,
	T,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLDefaultColorStyle,
	type TLDefaultFontStyle,
	type TLDefaultSizeStyle,
	type TLShape,
} from 'tldraw'

export const GRAPH_VIEW_TYPE = 'graph-view'

/** How a graph view shows its graph: an adjacency matrix, adjacency lists, Kruskal's union-find or an edge list. */
export const GraphViewKindStyle = StyleProp.defineEnum('drawds:graph-view', {
	defaultValue: 'matrix' as const,
	values: ['matrix', 'lists', 'union-find', 'edges'] as const,
})
export type GraphViewKind = T.TypeOf<typeof GraphViewKindStyle>

export interface GraphViewShapeProps {
	/** The graph shown: the view redraws as it changes, and goes when it is deleted. */
	graphId: string
	view: GraphViewKind
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[GRAPH_VIEW_TYPE]: GraphViewShapeProps
	}
}

export type GraphViewShape = TLShape<typeof GRAPH_VIEW_TYPE>

export const graphViewShapeProps: RecordProps<GraphViewShape> = {
	graphId: T.string,
	view: GraphViewKindStyle,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

/** Graph views are persisted in the browser, so every props change needs a step here. */
export const graphViewShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })
