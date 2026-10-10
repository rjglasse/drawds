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
import { showsColourCues } from '../../cells/cues'
import { exportingStep } from '../../export/exporting'
import type { Marks } from '../../cells/marks'
import { playbackFor } from '../../nodelink/playback'
import { SceneSvg } from '../../nodelink/SceneSvg'
import { GRAPH_SHAPE_TYPE, type GraphShape } from '../graph/graph-shape-types'
import { getMatrixLayout, getMatrixMetrics } from '../matrix/layout'
import { MatrixSvg } from '../matrix/MatrixShapeUtil'
import { GRAPH_VIEW_TYPE, graphViewShapeMigrations, graphViewShapeProps, type GraphViewShape } from './graph-view-shape-types'
import { CHAR_WIDTH } from '../recursion/calls'
import { CELL_SIZES } from '../sizes'
import { adjacencyMatrix, adjacencyScene, edgeList, setsHighlights, setsLevels, unionFindView, viewHighlights, viewTitle } from './model'

/**
 * A view of a graph beside it: its adjacency matrix, its adjacency lists, or Kruskal's union-find,
 * redrawn whenever the graph changes (it reads the graph as it renders). The graph's marks show on
 * it, and so do an operation's steps: a BFS lights each node's list as it scans it, Kruskal's steps
 * find roots and union sets on the union-find.
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

	/**
	 * What the view draws for the graph as it is now: the matrix's values and labels, or the lists' or
	 * the union-find's scene. `live`: the step an operation shows (the canvas), not just the graph (exports).
	 */
	private content(shape: GraphViewShape, live = true) {
		const graph = this.graph(shape)
		if (!graph) return undefined
		if (shape.props.view === 'union-find') {
			// While Kruskal plays, its step's sets, with room for its deepest step so the array holds still.
			const playing = live ? playbackFor(this.editor, graph.id) : undefined
			const steps = playing?.frames.flatMap((f) => (f.sets ? [f.sets] : [])) ?? []
			const sets = playing?.frame?.sets
			const { scene, box } = unionFindView(graph.props, shape.props.size, sets, Math.max(1, ...steps.map(setsLevels)))
			return { kind: 'union-find' as const, graph, scene, box, sets }
		}
		// The graph as the step on screen has it (adding or removing a vertex, say), else as it is.
		const frame = live ? playbackFor(this.editor, graph.id)?.frame : undefined
		const shown = frame?.props ? { ...graph.props, ...(frame.props as Partial<GraphShape['props']>) } : graph.props
		// Under a heading saying what the view costs.
		const title = viewTitle(shown, shape.props.view)
		const fontSize = Math.round(CELL_SIZES[shape.props.size] * 0.3)
		const heading = { text: title, fontSize, h: fontSize * 2, w: title.length * fontSize * CHAR_WIDTH[shape.props.font] }
		const below = (box: { w: number; h: number }) => ({ x: 0, y: 0, w: Math.max(box.w, heading.w), h: box.h + heading.h })
		if (shape.props.view === 'matrix' || shape.props.view === 'edges') {
			const { labels, values, cols } =
				shape.props.view === 'matrix'
					? { ...adjacencyMatrix(shown), cols: undefined }
					: { ...edgeList(shown), labels: undefined }
			const layout = getMatrixLayout(values.length, cols?.length ?? values.length, getMatrixMetrics(shape.props.size), { rows: labels, cols: cols ?? labels })
			return { kind: shape.props.view, graph, shown, labels, cols, values, heading, box: below(layout.box) }
		}
		// The lists start at the origin: head cells at x = 0, the first row at the top.
		const scene = adjacencyScene(shown, shape.props.size)
		const box = scene.nodes.reduce(
			(b, n) => ({ w: Math.max(b.w, n.x + n.w / 2), h: Math.max(b.h, n.y + n.h / 2) }),
			{ w: 1, h: 1 }
		)
		return { kind: 'lists' as const, graph, shown, scene, heading, box: below(box) }
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
		// Exporting its graph's steps: the step, as on the canvas.
		const live = !!exportingStep(this.editor, shape.props.graphId as TLShapeId)
		return this.draw(shape, this.editor.getCurrentTheme().colors[ctx.colorMode], live)
	}

	private draw(shape: GraphViewShape, colors: TLThemeColors, live: boolean) {
		const content = this.content(shape, live)
		const fontFamily = this.editor.getCurrentTheme().fonts[shape.props.font].fontFamily
		if (!content) {
			return (
				<text x={0} y={20} fontFamily={fontFamily} fontSize={14} fill={colors.text} opacity={0.6}>
					(the graph is gone)
				</text>
			)
		}
		const { graph } = content
		const playing = live ? playbackFor(this.editor, graph.id) : undefined
		if (content.kind === 'union-find') {
			return (
				<SceneSvg
					scene={content.scene}
					colors={colors}
					color={shape.props.color}
					fontFamily={fontFamily}
					marks={setsHighlights(graph.props, graph.props.marks)}
					flash={playing && content.sets?.flash && { marks: setsHighlights(graph.props, content.sets.flash), fading: playing.fading, id: playing.id }}
					cues={showsColourCues()}
				/>
			)
		}
		const view = content.kind
		const { shown } = content
		const marks = viewHighlights(shown, view, graph.props.marks)
		// The step's highlights on the graph, mapped here, and its own for this view (what it costs).
		const own = playing?.frame?.views?.[view]
		const flash = playing && { marks: { ...viewHighlights(shown, view, playing.flash), ...own }, fading: playing.fading, id: playing.id }
		const { heading } = content
		return (
			<>
				<text
					data-testid="graph-view-title"
					x={0}
					y={heading.fontSize * 0.8}
					fontFamily={fontFamily}
					fontSize={heading.fontSize}
					fill={colors.text}
					opacity={0.75}
					dominantBaseline="central"
				>
					{heading.text}
				</text>
				<g transform={`translate(0, ${heading.h})`}>
					{content.kind === 'lists' ? (
						<SceneSvg
							scene={content.scene}
							colors={colors}
							color={shape.props.color}
							fontFamily={fontFamily}
							marks={marks as Marks}
							flash={flash}
							cues={showsColourCues()}
						/>
					) : (
						<MatrixSvg
							values={content.values}
							rowLabels={content.labels}
							colLabels={content.cols ?? content.labels}
							marks={marks}
							color={shape.props.color}
							metrics={getMatrixMetrics(shape.props.size)}
							colors={colors}
							fontFamily={fontFamily}
							flash={flash}
							cues={showsColourCues()}
						/>
					)}
				</g>
			</>
		)
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

/** The views following `graph`. */
export const viewsOf = (editor: Editor, graph: GraphShape) =>
	editor.getCurrentPageShapes().filter((s): s is GraphViewShape => s.type === GRAPH_VIEW_TYPE && (s as GraphViewShape).props.graphId === graph.id)

/** Put a view of `graph` to its right (past any views it has already), one undo step. Returns its history mark. */
export function showGraphView(editor: Editor, graph: GraphShape, view: GraphViewShape['props']['view']) {
	const bounds = editor.getShapePageBounds(graph)
	if (!bounds) return undefined
	const right = Math.max(bounds.maxX, ...viewsOf(editor, graph).map((v) => editor.getShapePageBounds(v)?.maxX ?? -Infinity))
	const mark = editor.markHistoryStoppingPoint(`show ${{ 'union-find': 'union-find', edges: 'edge list', matrix: 'adjacency matrix', lists: 'adjacency lists' }[view]}`)
	editor.createShape<GraphViewShape>({
		type: GRAPH_VIEW_TYPE,
		x: right + 60,
		y: bounds.minY,
		props: { graphId: graph.id, view, color: graph.props.color, size: graph.props.size, font: graph.props.font },
	})
	return mark
}
