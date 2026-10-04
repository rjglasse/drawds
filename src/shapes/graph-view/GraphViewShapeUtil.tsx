import {
	Rectangle2d,
	SVGContainer,
	ShapeUtil,
	type Editor,
	type SvgExportContext,
	type TLFontFace,
	type TLShapeId,
	type TLThemeColors,
} from 'tldraw'
import type { Marks } from '../../cells/marks'
import { playbackFor } from '../../nodelink/playback'
import { SceneSvg } from '../../nodelink/SceneSvg'
import { GRAPH_SHAPE_TYPE, type GraphShape } from '../graph/graph-shape-types'
import { getMatrixLayout, getMatrixMetrics } from '../matrix/layout'
import { MatrixSvg } from '../matrix/MatrixShapeUtil'
import { GRAPH_VIEW_TYPE, graphViewShapeMigrations, graphViewShapeProps, type GraphViewShape } from './graph-view-shape-types'
import { adjacencyMatrix, adjacencyScene, viewHighlights } from './model'

/**
 * A view of a graph beside it: its adjacency matrix or its adjacency lists, redrawn whenever the
 * graph changes (it reads the graph as it renders). The graph's marks show on it, and so do an
 * operation's steps: a BFS lights each node's list as it scans it.
 */
export class GraphViewShapeUtil extends ShapeUtil<GraphViewShape> {
	static override type = GRAPH_VIEW_TYPE
	static override props = graphViewShapeProps
	static override migrations = graphViewShapeMigrations

	getDefaultProps(): GraphViewShape['props'] {
		return { graphId: '', view: 'matrix', color: 'black', size: 'm', font: 'mono' }
	}

	private graph(shape: GraphViewShape): GraphShape | undefined {
		const graph = this.editor.getShape(shape.props.graphId as TLShapeId)
		return graph && this.editor.isShapeOfType(graph, GRAPH_SHAPE_TYPE) ? graph : undefined
	}

	/** What the view draws for the graph as it is now: the matrix's values and labels, or the lists' scene. */
	private content(shape: GraphViewShape) {
		const graph = this.graph(shape)
		if (!graph) return undefined
		if (shape.props.view === 'matrix') {
			const { labels, values } = adjacencyMatrix(graph.props)
			const layout = getMatrixLayout(values.length, values.length, getMatrixMetrics(shape.props.size))
			return { kind: 'matrix' as const, graph, labels, values, box: layout.box }
		}
		// The lists start at the origin: head cells at x = 0, the first row at the top.
		const scene = adjacencyScene(graph.props, shape.props.size)
		const box = scene.nodes.reduce(
			(b, n) => ({ w: Math.max(b.w, n.x + n.w / 2), h: Math.max(b.h, n.y + n.h / 2) }),
			{ w: 1, h: 1 }
		)
		return { kind: 'lists' as const, graph, scene, box: { x: 0, y: 0, ...box } }
	}

	getGeometry(shape: GraphViewShape) {
		const box = this.content(shape)?.box ?? { x: 0, y: 0, w: 160, h: 40 }
		return new Rectangle2d({ x: 0, y: 0, width: Math.max(1, box.w), height: Math.max(1, box.h), isFilled: true })
	}

	override canEdit() {
		return false
	}

	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	component(shape: GraphViewShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		return <SVGContainer>{this.draw(shape, colors, true)}</SVGContainer>
	}

	override toSvg(shape: GraphViewShape, ctx: SvgExportContext) {
		return this.draw(shape, this.editor.getCurrentTheme().colors[ctx.colorMode], false)
	}

	private draw(shape: GraphViewShape, colors: TLThemeColors, live: boolean) {
		const content = this.content(shape)
		const fontFamily = this.editor.getCurrentTheme().fonts[shape.props.font].fontFamily
		if (!content) {
			return (
				<text x={0} y={20} fontFamily={fontFamily} fontSize={14} fill={colors.text} opacity={0.6}>
					(the graph is gone)
				</text>
			)
		}
		const { graph } = content
		const marks = viewHighlights(graph.props, shape.props.view, graph.props.marks)
		const playing = live ? playbackFor(this.editor, graph.id) : undefined
		const flash = playing && { marks: viewHighlights(graph.props, shape.props.view, playing.flash), fading: playing.fading, id: playing.id }
		if (content.kind === 'matrix') {
			return (
				<MatrixSvg
					values={content.values}
					rowLabels={content.labels}
					colLabels={content.labels}
					marks={marks}
					color={shape.props.color}
					metrics={getMatrixMetrics(shape.props.size)}
					colors={colors}
					fontFamily={fontFamily}
					flash={flash}
				/>
			)
		}
		return <SceneSvg scene={content.scene} colors={colors} color={shape.props.color} fontFamily={fontFamily} marks={marks as Marks} flash={flash} />
	}

	getIndicatorPath(shape: GraphViewShape) {
		const box = this.content(shape)?.box ?? { x: 0, y: 0, w: 160, h: 40 }
		const path = new Path2D()
		path.rect(0, 0, box.w, box.h)
		return path
	}

	override getFontFaces(shape: GraphViewShape): TLFontFace[] {
		return this.editor.getCurrentTheme().fonts[shape.props.font].faces ?? []
	}
}

/** Put a view of `graph` (matrix or lists) to its right, one undo step. */
export function showGraphView(editor: Editor, graph: GraphShape, view: GraphViewShape['props']['view']) {
	const bounds = editor.getShapePageBounds(graph)
	if (!bounds) return
	editor.markHistoryStoppingPoint(`show adjacency ${view}`)
	editor.createShape<GraphViewShape>({
		type: GRAPH_VIEW_TYPE,
		x: bounds.maxX + 60,
		y: bounds.minY,
		props: { graphId: graph.id, view, color: graph.props.color, size: graph.props.size, font: graph.props.font },
	})
}

/** A graph's views go with it. */
export function deleteViewsWithTheirGraph(editor: Editor) {
	return editor.sideEffects.registerAfterDeleteHandler('shape', (deleted) => {
		if (deleted.type !== GRAPH_SHAPE_TYPE) return
		const views = editor
			.getCurrentPageShapes()
			.filter((s) => s.type === GRAPH_VIEW_TYPE && (s as GraphViewShape).props.graphId === deleted.id)
		if (views.length) editor.deleteShapes(views.map((s) => s.id))
	})
}
