import {
	SVGContainer,
	Vec,
	getIndices,
	type TLHandle,
	type TLHandleDragInfo,
	type TLShapePartial,
	type TLThemeColors,
	type VecLike,
} from 'tldraw'
import { pruneMarks } from '../../cells/marks'
import { GROW_HANDLE_ID } from '../../controls/grow'
import { GrowGrip } from '../../controls/GrowGrip'
import { showsStructureControls } from '../../controls/visibility'
import { arrowHead, routeEdge } from '../../nodelink/geometry'
import type { PlaybackLayout, PointerDirection } from '../../cells/CellShapeUtil'
import { spatialNeighbor } from '../../nodelink/geometry'
import { NodeLinkShapeUtil, type NodeOperation } from '../../nodelink/NodeLinkShapeUtil'
import { prunePointers } from '../../pointers/pointers'
import { isBusy, playOperation, playbackFor, type Frame } from '../../nodelink/playback'
import { edgeCellKey, type Scene, type SceneNode } from '../../nodelink/scene'
import {
	connectHandleId,
	connectState,
	connectTarget,
	nodeOfConnectHandle,
	type ConnectDrag,
	type ConnectTarget,
} from './connect'
import {
	GRAPH_SHAPE_TYPE,
	graphShapeMigrations,
	graphShapeProps,
	type GraphDirection,
	type GraphLabelsMode,
	type GraphShape,
} from './graph-shape-types'
import type { GraphViewShape } from '../graph-view/graph-view-shape-types'
import { showGraphView, viewsOf } from '../graph-view/GraphViewShapeUtil'
import { generateGraph } from './generate'
import { getGraphMetrics, graphCorner, graphScene, toUnits } from './layout'
import { components, dijkstra, kruskal, prim, topologicalSort } from './algorithms'
import { bfs, dfs } from './traverse'
import {
	addEdge,
	addNode,
	markKeys,
	mergeTwins,
	nextLabel,
	nextNodeId,
	relabel,
	removeEdge,
	removeNode,
	type GraphModel,
} from './model'

/**
 * A graph: nodes where the teacher put them, edges between them. Live moves on the selected graph:
 * drag a node's connect grip to another node (new edge) or to empty space (new connected node),
 * drag the + grip to place a lone node, x on a node or an edge to delete it, double-click a label
 * or weight to change it, and 1-4 on nodes and edges to mark them.
 */
export class GraphShapeUtil extends NodeLinkShapeUtil<GraphShape> {
	static override type = GRAPH_SHAPE_TYPE
	static override props = graphShapeProps
	static override migrations = graphShapeMigrations

	override readonly markableEdges = true

	getDefaultProps(): GraphShape['props'] {
		return {
			nodes: [{ id: 'v0', value: 'A', x: 0.5, y: 0.5 }],
			edges: [],
			direction: 'undirected',
			weights: 'unweighted',
			labels: 'letters',
			density: 'medium',
			parts: 'connected',
			order: 'any',
			seed: 0,
			marks: {},
			pointers: [],
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	buildScene(shape: GraphShape) {
		return graphScene(shape.props)
	}

	setNodeValue(shape: GraphShape, key: string, value: string) {
		return this.update(shape, { nodes: shape.props.nodes.map((n) => (n.id === key ? { ...n, value } : n)) })
	}

	setEdgeLabel(shape: GraphShape, key: string, weight: string) {
		return this.update(shape, { edges: shape.props.edges.map((e) => (e.id === key ? { ...e, weight } : e)) })
	}

	moveNode(shape: GraphShape, key: string, to: VecLike): TLShapePartial<GraphShape> {
		const { x, y } = toUnits(to, shape.props.size)
		return this.update(shape, { nodes: shape.props.nodes.map((n) => (n.id === key ? { ...n, x, y } : n)) })
	}

	/** Nodes sit where the teacher put them: there is no automatic layout to go back to. */
	resetLayout(shape: GraphShape): TLShapePartial<GraphShape> {
		return { id: shape.id, type: GRAPH_SHAPE_TYPE }
	}

	hasManualLayout() {
		return false
	}

	// Deleting: x on a node (its edges go with it) or on an edge. A graph keeps at least one node.

	canRemoveNode(shape: GraphShape) {
		return shape.props.nodes.length > 1
	}

	removeNode(shape: GraphShape, key: string) {
		return this.withModel(shape, removeNode(shape.props, key))
	}

	removeEdge(shape: GraphShape, key: string) {
		return this.withModel(shape, removeEdge(shape.props, key))
	}

	// A lone node: drag the + grip off the graph's lower right; the new node follows the pointer.

	getGrowGrips(shape: GraphShape) {
		// Out of the way while a connect drag might drop a new node there.
		if (connectState(this.editor).get()?.shapeId === shape.id) return []
		const corner = graphCorner(shape.props)
		const { cell } = getGraphMetrics(shape.props.size)
		return [{ id: GROW_HANDLE_ID, at: { x: corner.x + cell * 0.4, y: corner.y + cell * 0.4 } }]
	}

	growTo(shape: GraphShape, initial: GraphShape, _gripId: string, to: VecLike): TLShapePartial<GraphShape> {
		const { props } = initial
		const { nodes } = addNode(props, toUnits(to, props.size), props.labels)
		return this.update(shape, { nodes, edges: props.edges })
	}

	// Connecting: each node has a connect grip on its right rim (a 'create' handle, so tldraw only
	// draws it on hover; the shape draws a + there on the hovered node).

	override getHandles(shape: GraphShape): TLHandle[] {
		if (isBusy(playbackFor(this.editor, shape.id))) return []
		const handles: Omit<TLHandle, 'index'>[] = [
			...super
				.getHandles(shape)
				.map((h) => (h.id === GROW_HANDLE_ID ? { ...h, label: 'Drag to place a new node' } : h)),
			...this.getScene(shape).nodes.map((n) => ({
				...connectGripAt(n),
				id: connectHandleId(n.key),
				type: 'create' as const,
				label: `Drag to connect ${n.value} to another node`,
			})),
		]
		const indices = getIndices(handles.length)
		return handles.map((h, i) => ({ ...h, index: indices[i] }))
	}

	override onHandleDragStart(shape: GraphShape, { handle }: TLHandleDragInfo<GraphShape>) {
		const from = nodeOfConnectHandle(handle.id)
		if (from !== undefined) connectState(this.editor).set({ shapeId: shape.id, from, at: handle, target: undefined })
	}

	override onHandleDrag(shape: GraphShape, info: TLHandleDragInfo<GraphShape>) {
		const from = nodeOfConnectHandle(info.handle.id)
		if (from === undefined) return super.onHandleDrag(shape, info)
		const at = { x: info.handle.x, y: info.handle.y }
		connectState(this.editor).set({ shapeId: shape.id, from, at, target: connectTarget(this.getScene(shape), from, at) })
		return undefined
	}

	/**
	 * A connect drag ends in a new edge (and maybe a new node); the new node, or a new edge's weight
	 * on a weighted graph, opens for typing. A lone node placed with the + grip opens too.
	 */
	override onHandleDragEnd(shape: GraphShape, { handle, initial = shape }: TLHandleDragInfo<GraphShape>) {
		if (handle.id === GROW_HANDLE_ID) {
			const id = nextNodeId(initial.props.nodes)
			if (shape.props.nodes.some((n) => n.id === id)) this.editAfterDrag(shape, id)
			return
		}
		const state = connectState(this.editor)
		const drag = state.get()
		state.set(null)
		if (!drag || drag.shapeId !== shape.id || !drag.target) return
		// The drop point is in shape space; the model wants layout coordinates.
		const result = this.connect(shape, drag.from, drag.target, Vec.Sub(drag.at, this.layoutOffset(shape)))
		if (!result) return
		if (result.edit) this.editAfterDrag(shape, result.edit)
		return result.update
	}

	override onHandleDragCancel() {
		connectState(this.editor).set(null)
	}

	/** The graph with an edge from `from` to the target node, or to a new node at `at` (layout coordinates). */
	connect(shape: GraphShape, from: string, target: ConnectTarget, at: VecLike) {
		const { props } = shape
		let model: GraphModel = props
		let to: string
		if (target.kind === 'new') {
			const added = addNode(props, toUnits(at, props.size), props.labels)
			model = { nodes: added.nodes, edges: props.edges }
			to = added.id
		} else {
			to = target.id
		}
		const edge = addEdge(model, from, to, props.direction === 'directed', props.seed)
		if (!edge) return undefined
		const edit = target.kind === 'new' ? to : props.weights === 'weighted' ? edgeCellKey(edge.id) : undefined
		return { update: this.update(shape, { nodes: model.nodes, edges: edge.edges }), edit }
	}

	/** Start editing once the handle drag has finished (it returns the select tool to idle). */
	private editAfterDrag(shape: GraphShape, key: string) {
		this.editor.timers.setTimeout(() => {
			const current = this.editor.getShape(shape.id) as GraphShape | undefined
			if (current) this.editCell(current, key)
		}, 0)
	}

	// Traversals, from a node's context menu: they play step by step (see the play bar). Shift at the
	// end keeps the visited nodes and the tree edges as marks.

	nodeOperations(shape: GraphShape, key: string): NodeOperation[] {
		const node = shape.props.nodes.find((n) => n.id === key)
		if (!node) return []
		const directed = shape.props.direction === 'directed'
		const algorithm = { group: 'algorithms' }
		return [
			{ group: 'traverse', id: 'graph-bfs', label: `Breadth-first search from ${node.value}`, run: () => this.traverse(shape.id, key, 'bfs') },
			{ group: 'traverse', id: 'graph-dfs', label: `Depth-first search from ${node.value}`, run: () => this.traverse(shape.id, key, 'dfs') },
			{
				...algorithm,
				id: 'graph-dijkstra',
				label: `Shortest paths from ${node.value} (Dijkstra)`,
				run: () => this.runAlgorithm(shape.id, 'shortest paths', (s) => dijkstra(s.props, key, this.algorithmOptions(s)).frames),
			},
			// A spanning tree is about undirected graphs.
			...(directed
				? []
				: [
						{
							...algorithm,
							id: 'graph-prim',
							label: `Minimum spanning tree from ${node.value} (Prim)`,
							run: () => this.runAlgorithm(shape.id, 'minimum spanning tree', (s) => prim(s.props, key, this.algorithmOptions(s)).frames),
						},
					]),
		]
	}

	/** Algorithms on the whole graph: Kruskal's spanning tree (undirected), topological sort (directed). */
	override shapeOperations(shape: GraphShape): NodeOperation[] {
		// Views beside the graph that follow it as it changes.
		const show = { section: 'show' } as const
		const views: NodeOperation[] = [
			{ ...show, id: 'graph-show-matrix', label: 'Adjacency matrix beside it', run: () => this.showView(shape.id, 'matrix') },
			{ ...show, id: 'graph-show-lists', label: 'Adjacency lists beside it', run: () => this.showView(shape.id, 'lists') },
			// Kruskal's sets: spanning trees are about undirected graphs.
			...(shape.props.direction === 'directed'
				? []
				: [{ ...show, id: 'graph-show-union-find', label: "Union-find beside it (Kruskal's sets)", run: () => this.showView(shape.id, 'union-find') }]),
		]
		return [...views, ...this.algorithmOperations(shape)]
	}

	private showView(id: GraphShape['id'], view: GraphViewShape['props']['view']) {
		const shape = this.editor.getShape(id) as GraphShape | undefined
		if (shape) showGraphView(this.editor, shape, view)
	}

	private algorithmOperations(shape: GraphShape): NodeOperation[] {
		const algorithms = { group: 'algorithms' }
		const pieces: NodeOperation = {
			...algorithms,
			id: 'graph-components',
			label: 'Count connected components',
			run: () => this.runAlgorithm(shape.id, 'connected components', (s) => components(s.props, this.algorithmOptions(s)).frames),
		}
		return [pieces, ...this.directedOrNot(shape, algorithms)]
	}

	private directedOrNot(shape: GraphShape, algorithms: { group: string }): NodeOperation[] {
		return shape.props.direction === 'directed'
			? [
					{
						...algorithms,
						id: 'graph-topological-sort',
						label: 'Topological sort',
						run: () => this.runAlgorithm(shape.id, 'topological sort', (s) => topologicalSort(s.props).frames),
					},
				]
			: [
					{
						...algorithms,
						id: 'graph-kruskal',
						label: 'Minimum spanning tree (Kruskal)',
						run: () => this.kruskal(shape.id),
					},
				]
	}

	override menuName() {
		return 'Graph'
	}

	override readonly menuId = 'graph'

	override moves() {
		return [
			'Double-click a node or a weight to type',
			"Drag from the dot on a node's right edge to another node to join them, or into space for a new node",
			'Hover a node or an edge for x (remove); drag the dot under a node to move it',
			"Right-click a node: Step by step has BFS, DFS, Dijkstra, Prim, Kruskal (with its union-find beside the graph) and connected components; Show puts its adjacency matrix, lists or union-find beside it",
			'Style panel: Edges (directed or not), Weights, Labels, and Density, Pieces, Order for a new sketch',
		]
	}

	/**
	 * The strips and play bar go under the graph and under any view beside it (overlapping its height:
	 * a union-find or a matrix taller than the graph), so they never cover a view while it follows the steps.
	 */
	override playbackLayout(shape: GraphShape, frame: Frame | undefined): PlaybackLayout {
		const layout = super.playbackLayout(shape, frame)
		const graph = this.editor.getShapePageBounds(shape)
		if (!graph) return layout
		const beside = viewsOf(this.editor, shape).flatMap((v) => {
			const b = this.editor.getShapePageBounds(v)
			return b && b.minY < graph.maxY && b.maxY > graph.minY ? [this.editor.getPointInShapeSpace(shape, { x: b.minX, y: b.maxY }).y] : []
		})
		return { ...layout, bottom: Math.max(layout.bottom, ...beside) }
	}

	private algorithmOptions(shape: GraphShape) {
		return { directed: shape.props.direction === 'directed', weighted: shape.props.weights === 'weighted' }
	}

	private traverse(id: GraphShape['id'], start: string, kind: 'bfs' | 'dfs') {
		this.runAlgorithm(id, kind === 'bfs' ? 'breadth-first search' : 'depth-first search', (shape) =>
			(kind === 'bfs' ? bfs : dfs)(shape.props, start, shape.props.direction === 'directed').frames
		)
	}

	/** Play an algorithm's steps on the graph as it is now; nothing changes (Shift at the end keeps the highlights as marks). */
	/**
	 * Kruskal, with its union-find beside the graph: opened for it if the graph has none (Esc, before
	 * the result is in, takes it away again, so cancelling changes nothing).
	 */
	private kruskal(id: GraphShape['id']) {
		const shape = this.editor.getShape(id) as GraphShape | undefined
		if (!shape) return
		const shown = viewsOf(this.editor, shape).some((v) => v.props.view === 'union-find')
		const mark = shown ? undefined : showGraphView(this.editor, shape, 'union-find')
		const takeBack = mark === undefined ? undefined : () => void this.editor.bailToMark(mark)
		this.runAlgorithm(id, 'minimum spanning tree', (s) => kruskal(s.props, this.algorithmOptions(s)).frames, takeBack)
	}

	private runAlgorithm(id: GraphShape['id'], label: string, steps: (shape: GraphShape) => Frame[], onCancel?: () => void) {
		const shape = this.editor.getShape(id) as GraphShape | undefined
		if (!shape) return
		const frames = steps(shape)
		playOperation(this.editor, {
			shapeId: id,
			label,
			frames,
			onCancel,
			withMarks: (_update, highlights) => {
				const current = (this.editor.getShape(id) as GraphShape | undefined) ?? shape
				return this.withModel(current, current.props, { ...current.props.marks, ...highlights })
			},
		})
	}

	// Pointers (s, u, v...) sit above nodes; arrow keys step to the adjacent node in that direction
	// (any node in that direction if no neighbour lies that way).

	override pointerStep(shape: GraphShape, key: string, direction: PointerDirection): string | undefined {
		const nodes = this.getScene(shape).nodes
		const from = nodes.find((n) => n.key === key)
		if (!from) return undefined
		const adjacent = new Set(shape.props.edges.flatMap((e) => (e.from === key ? [e.to] : e.to === key ? [e.from] : [])))
		const near = spatialNeighbor(
			from,
			nodes.filter((n) => adjacent.has(n.key)),
			direction
		)
		return (near ?? spatialNeighbor(from, nodes.filter((n) => n !== from), direction))?.key
	}

	pointerNames() {
		return ['s', 't', 'u', 'v', 'curr']
	}

	// Options from the style panel, applied to the selected graph.

	/** Undirected: one edge per pair of nodes, so u->v and v->u twins merge. */
	withDirection(shape: GraphShape, direction: GraphDirection): TLShapePartial<GraphShape> {
		if (direction === 'directed') return { id: shape.id, type: GRAPH_SHAPE_TYPE }
		return this.withModel(shape, { nodes: shape.props.nodes, edges: mergeTwins(shape.props.edges) })
	}

	/**
	 * Rewire a selected graph for a new sketch option: with a new density or pieces its nodes stay
	 * where they are and, in their order, get new edges as the sketch would have made them; asking
	 * for a DAG just points every edge from the earlier node to the later.
	 */
	withSketchOptions(
		shape: GraphShape,
		change: Partial<Pick<GraphShape['props'], 'density' | 'parts' | 'order'>>
	): TLShapePartial<GraphShape> {
		const { nodes, seed, labels } = shape.props
		const options = { density: shape.props.density, parts: shape.props.parts, order: shape.props.order, ...change }
		const order = new Map(nodes.map((n, i) => [n.id, i]))
		let edges = shape.props.edges
		if (change.density || change.parts) {
			const ids = nodes.map((n) => n.id)
			edges = generateGraph(nodes, seed, labels, options).edges.map((e) => ({
				...e,
				from: ids[Number(e.from.slice(1))],
				to: ids[Number(e.to.slice(1))],
			}))
		} else if (change.order === 'dag') {
			edges = mergeTwins(edges.map((e) => (order.get(e.from)! > order.get(e.to)! ? { ...e, from: e.to, to: e.from } : e)))
		} else {
			return this.update(shape, options)
		}
		const update = this.withModel(shape, { nodes, edges })
		return { ...update, props: { ...update.props, ...options } }
	}

	withLabels(shape: GraphShape, labels: GraphLabelsMode): TLShapePartial<GraphShape> {
		return this.update(shape, { nodes: relabel(shape.props.nodes, labels) })
	}

	override component(shape: GraphShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		const drag = connectState(this.editor).get()
		const dragging = drag?.shapeId === shape.id ? drag : undefined
		const scene = this.getScene(shape)
		// Connect grips on the node under the pointer (all nodes on touch screens), as for its x.
		let grips: SceneNode[] = []
		const busy = isBusy(playbackFor(this.editor, shape.id))
		if (!dragging && !busy && showsStructureControls(this.editor, shape) && this.editor.isIn('select.idle')) {
			const { showNode } = this.controlTargets(shape)
			grips = scene.nodes.filter((n) => showNode(n.key))
		}
		const zoom = this.editor.getZoomLevel()
		return (
			<>
				{super.component(shape)}
				<SVGContainer>
					{grips.map((n) => (
						<GrowGrip key={n.key} at={connectGripAt(n)} zoom={zoom} colors={colors} />
					))}
					{dragging && (
						<ConnectPreview
							scene={scene}
							drag={dragging}
							directed={shape.props.direction === 'directed'}
							nextLabel={nextLabel(shape.props.nodes, shape.props.labels)}
							fontFamily={this.getFontFamily(shape)}
							zoom={zoom}
							colors={colors}
						/>
					)}
				</SVGContainer>
			</>
		)
	}

	/** New nodes and edges; marks and pointers on anything removed go with it. */
	private withModel(shape: GraphShape, model: GraphModel, marks = shape.props.marks): TLShapePartial<GraphShape> {
		return this.update(shape, {
			...model,
			marks: pruneMarks(marks, markKeys(model)),
			pointers: prunePointers(
				shape.props.pointers,
				model.nodes.map((n) => n.id)
			),
		})
	}

	private update(shape: GraphShape, props: Partial<GraphShape['props']>): TLShapePartial<GraphShape> {
		return { id: shape.id, type: GRAPH_SHAPE_TYPE, props }
	}
}

/** A node's connect grip: on its right rim. */
const connectGripAt = (n: SceneNode) => ({ x: n.x + n.w / 2, y: n.y })

/**
 * A connect drag in progress: a dashed edge from the source to the pointer, ending on the ringed
 * target node, or on a ghost of the node a drop would create.
 */
function ConnectPreview({
	scene,
	drag,
	directed,
	nextLabel,
	fontFamily,
	zoom,
	colors,
}: {
	scene: Scene
	drag: ConnectDrag
	directed: boolean
	nextLabel: string
	fontFamily: string
	zoom: number
	colors: TLThemeColors
}) {
	const from = scene.nodes.find((n) => n.key === drag.from)
	if (!from) return null
	const to = drag.target
	const target = to?.kind === 'node' ? scene.nodes.find((n) => n.key === to.id) : undefined
	const ghost = to?.kind === 'new'
	const end: SceneNode = target ?? { ...from, key: '#pointer', ...drag.at, w: ghost ? from.w : 0, h: ghost ? from.h : 0 }
	const route = routeEdge(from, end)
	const width = scene.metrics.strokeWidth
	const stroke = colors.selectionStroke
	const dash = `${6 / zoom} ${4 / zoom}`
	return (
		<g pointerEvents="none">
			<path d={route.d} fill="none" stroke={stroke} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
			{directed && <polygon points={arrowHead(route.tip, route.angle, width * 3 + 6)} fill={stroke} />}
			{target && <circle cx={target.x} cy={target.y} r={target.w / 2 + 4 / zoom} fill="none" stroke={stroke} strokeWidth={2 / zoom} />}
			{ghost && (
				<>
					<circle cx={end.x} cy={end.y} r={end.w / 2} fill="none" stroke={stroke} strokeWidth={width} strokeDasharray={dash} />
					<text
						x={end.x}
						y={end.y}
						fontFamily={fontFamily}
						fontSize={scene.metrics.fontSize}
						fill={stroke}
						textAnchor="middle"
						dominantBaseline="central"
						opacity={0.7}
					>
						{nextLabel}
					</text>
				</>
			)}
		</g>
	)
}
