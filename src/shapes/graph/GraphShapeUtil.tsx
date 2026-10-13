import { toggleTranscript, transcriptsOf } from '../../transcript/transcript'
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
import { pruneMarks, type Marks } from '../../cells/marks'
import { GROW_HANDLE_ID } from '../../controls/grow'
import { GrowGrip } from '../../controls/GrowGrip'
import { showsStructureControls } from '../../controls/visibility'
import { arrowHead, routeEdge, routeScene } from '../../nodelink/geometry'
import type { PointerDirection } from '../../cells/CellShapeUtil'
import { spatialNeighbor } from '../../nodelink/geometry'
import { NodeLinkShapeUtil, type NodeOperation } from '../../nodelink/NodeLinkShapeUtil'
import { Tracked } from '../../controls/Tracked'
import { prunePointers } from '../../pointers/pointers'
import { isBusy, playOperation, playbackFor, type Frame } from '../../nodelink/playback'
import { edgeCellKey, type Scene, type SceneNode } from '../../nodelink/scene'
import { graphTestValues } from '../../nodelink/scene-tests'
import type { TestValues } from '../code/tests'
import {
	connectHandleId,
	connectState,
	connectTarget,
	edgeEndGrips,
	edgeOfRewireHandle,
	rewireHandleId,
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
import { VIEW_NAMES, showGraphView, toggleGraphView, viewsOf } from '../graph-view/GraphViewShapeUtil'
import { generateGraph } from './generate'
import { getGraphMetrics, graphCorner, graphScene, toUnits } from './layout'
import { components, dijkstra, kruskal, prim, topologicalSort } from './algorithms'
import { circleLayout, tidyLayout } from './arrange'
import { bfs, dfs } from './traverse'
import { findCycle, shortestPath } from './paths'
import { addVertexCosts, hasEdgeCosts, removeEdgeCosts, removeVertexCosts, type CostRun } from '../graph-view/costs'
import {
	addEdge,
	addNode,
	degrees,
	edgeWeight,
	markKeys,
	mergeTwins,
	neighbourMarks,
	nextLabel,
	nextNodeId,
	relabel,
	removeEdge,
	removeNode,
	reverseEdge,
	rewireEdge,
	transpose,
	type GraphModel,
} from './model'
import { InFront } from '../../controls/InFront'
import { rerollShape, type Redrawable } from '../../data/fill-style'

/**
 * A graph: nodes where the teacher put them, edges between them. Live moves on the selected graph:
 * drag a node's connect grip to another node (new edge) or to empty space (new connected node),
 * drag the + grip to place a lone node, x on a node or an edge to delete it, double-click a label
 * or weight to change it, and 1-4 on nodes and edges to mark them.
 */
export class GraphShapeUtil extends NodeLinkShapeUtil<GraphShape> implements Redrawable {
	static override type = GRAPH_SHAPE_TYPE

	/** A test reads vertices by their labels, and the strips' arrays by vertex (visited[w]). */
	override testValues(shape: GraphShape, frame: Frame): TestValues {
		return graphTestValues(this.displayScene(shape, frame), frame)
	}
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
			degrees: false,
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
			...this.rewireGrips(shape),
		]
		const indices = getIndices(handles.length)
		return handles.map((h, i) => ({ ...h, index: indices[i] }))
	}

	/**
	 * Each edge's ends can be dragged to another node to re-wire it: a 'create' handle just along it from
	 * either end (past a head's arrow), drawn only on hover as the connect grips are.
	 */
	private rewireGrips(shape: GraphShape): Omit<TLHandle, 'index'>[] {
		const scene = this.getScene(shape)
		const routes = routeScene(scene)
		const { fontSize, strokeWidth } = scene.metrics
		const directed = shape.props.direction === 'directed'
		const name = (id: string) => shape.props.nodes.find((n) => n.id === id)?.value ?? id
		return shape.props.edges.flatMap((edge) => {
			const route = routes.get(edge.id)
			const grips = route && edge.from !== edge.to ? edgeEndGrips(route.points, fontSize * 0.9, directed ? strokeWidth * 3 + 6 : 0) : undefined
			if (!grips) return []
			const pair = `${name(edge.from)}${directed ? '→' : '–'}${name(edge.to)}`
			return (['from', 'to'] as const).map((end) => ({
				...grips[end],
				id: rewireHandleId(edge.id, end),
				type: 'create' as const,
				label: `Drag to move ${pair}'s ${directed ? (end === 'to' ? 'head' : 'tail') : `end at ${name(edge[end])}`} to another node`,
			}))
		})
	}

	/** Re-wiring: the edge and the end being moved, and the node that stays. */
	private rewiring(shape: GraphShape, handleId: string) {
		const grip = edgeOfRewireHandle(handleId)
		const edge = grip && shape.props.edges.find((e) => e.id === grip.edge)
		return grip && edge ? { ...grip, stays: grip.end === 'to' ? edge.from : edge.to } : undefined
	}

	override onHandleDragStart(shape: GraphShape, { handle }: TLHandleDragInfo<GraphShape>) {
		const rewire = this.rewiring(shape, handle.id)
		if (rewire) {
			connectState(this.editor).set({ shapeId: shape.id, from: rewire.stays, rewire: { edge: rewire.edge, end: rewire.end }, at: handle, target: undefined })
			return
		}
		const from = nodeOfConnectHandle(handle.id)
		if (from !== undefined) connectState(this.editor).set({ shapeId: shape.id, from, at: handle, target: undefined })
	}

	override onHandleDrag(shape: GraphShape, info: TLHandleDragInfo<GraphShape>) {
		const at = { x: info.handle.x, y: info.handle.y }
		const rewire = this.rewiring(shape, info.handle.id)
		if (rewire) {
			// Only onto a node it can go to: no self-loop, no edge that is there already.
			const target = connectTarget(this.getScene(shape), rewire.stays, at)
			const fits = target?.kind === 'node' && rewireEdge(shape.props, rewire.edge, rewire.end, target.id, shape.props.direction === 'directed')
			connectState(this.editor).set({ shapeId: shape.id, from: rewire.stays, rewire: { edge: rewire.edge, end: rewire.end }, at, target: fits ? target : undefined })
			return undefined
		}
		const from = nodeOfConnectHandle(info.handle.id)
		if (from === undefined) return super.onHandleDrag(shape, info)
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
		// An edge's end dropped on another node: the edge goes there, its weight (and marks) with it.
		if (drag.rewire) {
			const model = drag.target.kind === 'node' ? rewireEdge(shape.props, drag.rewire.edge, drag.rewire.end, drag.target.id, shape.props.direction === 'directed') : undefined
			return model && this.withModel(shape, model)
		}
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
		// An edge: removing it, step by step, as each representation does it.
		const edge = key.startsWith('edge:') ? shape.props.edges.find((e) => `edge:${e.id}` === key) : undefined
		if (edge) {
			const name = (id: string) => shape.props.nodes.find((n) => n.id === id)?.value ?? id
			const pair = `${name(edge.from)}${shape.props.direction === 'directed' ? '→' : '–'}${name(edge.to)}`
			const reversed = shape.props.direction === 'directed' ? reverseEdge(shape.props, edge.id) : undefined
			return [
				// Instant: the arrow turned round, one undo step.
				...(reversed
					? [
							{
								section: 'actions' as const,
								id: 'graph-reverse-edge',
								label: `Reverse ${pair}: ${name(edge.to)}→${name(edge.from)}`,
								run: () => this.change(shape.id, 'reverse edge', (s) => reverseEdge(s.props, edge.id)),
							},
						]
					: []),
				{
					group: 'representations',
					id: 'graph-remove-edge-costs',
					label: `Remove edge ${pair}: each view's cost`,
					run: () => this.playCosts(shape.id, `remove edge ${pair}`, (s) => removeEdgeCosts(s.props, edge.id)),
				},
			]
		}
		const node = shape.props.nodes.find((n) => n.id === key)
		if (!node) return []
		const directed = shape.props.direction === 'directed'
		const algorithm = { group: 'algorithms' }
		return [
			{ group: 'traverse', id: 'graph-bfs', label: `Breadth-first search from ${node.value}`, run: () => this.traverse(shape.id, key, 'bfs') },
			{ group: 'traverse', id: 'graph-dfs', label: `Depth-first search from ${node.value}`, run: () => this.traverse(shape.id, key, 'dfs') },
			// Lecture 9: BFS finds the path with the fewest edges.
			{
				group: 'traverse',
				id: 'graph-path',
				label: `Path from ${node.value} to`,
				prompt: 'To which vertex?',
				run: (to) => to !== undefined && this.path(shape.id, key, to),
			},
			// Lecture 9a: what the representations cost, step by step.
			{
				group: 'representations',
				id: 'graph-has-edge-costs',
				label: `Is ${node.value} adjacent to`,
				prompt: 'To which vertex?',
				run: (to) => {
					const target = to === undefined ? undefined : this.nodeNamed(shape.id, to)
					if (target) this.playCosts(shape.id, 'is there an edge?', (s) => hasEdgeCosts(s.props, key, target))
				},
			},
			// Offered where the x is: a graph keeps at least one node.
			...(this.canRemoveNode(shape)
				? [
						{
							group: 'representations',
							id: 'graph-remove-vertex-costs',
							label: `Remove ${node.value}: each view's cost`,
							run: () => this.playCosts(shape.id, `remove ${node.value}`, (s) => removeVertexCosts(s.props, key)),
						},
					]
				: []),
			{
				...algorithm,
				id: 'graph-dijkstra',
				label: `Shortest paths from ${node.value} (Dijkstra)`,
				run: () => this.runAlgorithm(shape.id, 'shortest paths', (s) => dijkstra(s.props, key, this.algorithmOptions(s)).frames, undefined, 'graph-dijkstra'),
			},
			// A spanning tree is about undirected graphs.
			...(directed
				? []
				: [
						{
							...algorithm,
							id: 'graph-prim',
							label: `Minimum spanning tree from ${node.value} (Prim)`,
							run: () => this.runAlgorithm(shape.id, 'minimum spanning tree', (s) => prim(s.props, key, this.algorithmOptions(s)).frames, undefined, 'graph-prim'),
						},
					]),
		]
	}

	/** Algorithms on the whole graph: Kruskal's spanning tree (undirected), topological sort (directed). */
	override shapeOperations(shape: GraphShape): NodeOperation[] {
		// Views beside the graph that follow it as it changes.
		const show = { section: 'show' } as const
		// Each view toggles, as every view beside a structure does: shown, its item hides it.
		const shown = new Set(viewsOf(this.editor, shape).map((v) => v.props.view))
		const view = (kind: GraphViewShape['props']['view'], label: string): NodeOperation => ({
			...show,
			id: `graph-show-${kind}`,
			label: shown.has(kind) ? `Hide the ${VIEW_NAMES[kind]}` : label,
			run: () => this.toggleView(shape.id, kind),
		})
		const views: NodeOperation[] = [
			view('matrix', 'Adjacency matrix beside it'),
			view('lists', 'Adjacency lists beside it'),
			// Kruskal's sets: spanning trees are about undirected graphs.
			...(shape.props.direction === 'directed' ? [] : [view('union-find', "Union-find beside it (Kruskal's sets)")]),
			view('edges', 'Edge list beside it'),
			{
				...show,
				id: 'graph-degrees',
				label: shape.props.degrees ? 'Hide the degrees' : `Degrees${shape.props.direction === 'directed' ? ' (in/out)' : ''} and neighbours`,
				run: () => this.toggleDegrees(shape.id),
			},
			// Every move made on it, as code.
			{
				...show,
				id: 'graph-code-beside',
				label: transcriptsOf(this.editor, shape.id).length ? 'Hide the code beside it' : 'Code beside it: every move as code',
				run: () => toggleTranscript(this.editor, shape),
			},
		]
		// The transpose, Gᵀ: every arrow turned round (what Kosaraju's second pass searches).
		const turn: NodeOperation[] =
			shape.props.direction === 'directed' && shape.props.edges.length
				? [{ section: 'actions', id: 'graph-transpose', label: 'Reverse every edge (the transpose, Gᵀ)', run: () => this.change(shape.id, 'transpose', (s) => transpose(s.props)) }]
				: []
		// Re-laid out (one undo step): round a circle, or tidied by forces from where the nodes are.
		const arrange: NodeOperation[] =
			shape.props.nodes.length > 2
				? [
						{ section: 'actions', group: 'layout', id: 'graph-layout-circle', label: 'Lay out round a circle', run: () => this.change(shape.id, 'round a circle', (s) => ({ nodes: circleLayout(s.props.nodes), edges: s.props.edges })) },
						{ section: 'actions', group: 'layout', id: 'graph-layout-tidy', label: 'Tidy: edges even, nodes apart', run: () => this.change(shape.id, 'tidy', (s) => ({ nodes: tidyLayout(s.props), edges: s.props.edges })) },
					]
				: []
		// New weights on the same edges (shown weights only: Dijkstra, Prim and Kruskal run on them).
		const reweigh: NodeOperation[] =
			shape.props.weights === 'weighted' && shape.props.edges.length
				? [{ section: 'actions', id: 'graph-reweigh', label: 'New weights', run: () => rerollShape(this.editor, shape.id, 'new weights') }]
				: []
		return [...views, ...turn, ...arrange, ...reweigh, ...this.algorithmOperations(shape)]
	}

	/** Its edges' weights drawn again from its seed (New weights): the same graph, other weights. */
	redraw(shape: GraphShape): TLShapePartial<GraphShape> {
		const { nodes, edges, seed } = shape.props
		return this.withModel(shape, { nodes, edges: edges.map((e) => ({ ...e, weight: edgeWeight(seed, e.id) })) })
	}

	/** While an edge's end is dragged elsewhere, the edge isn't drawn where it was: the preview is where it goes. */
	override displayScene(shape: GraphShape, frame?: Frame) {
		const scene = super.displayScene(shape, frame)
		const drag = frame ? undefined : connectState(this.editor).get()
		if (!drag?.rewire || drag.shapeId !== shape.id) return scene
		const moving = drag.rewire.edge
		return { ...scene, edges: scene.edges.filter((e) => e.key !== moving) }
	}

	/** An instant change to the graph's edges, one undo step (nothing if `edit` can't make it). */
	private change(id: GraphShape['id'], label: string, edit: (shape: GraphShape) => GraphModel | undefined) {
		const shape = this.editor.getShape(id) as GraphShape | undefined
		const model = shape && edit(shape)
		if (!shape || !model) return
		this.editor.markHistoryStoppingPoint(label)
		this.editor.updateShape(this.withModel(shape, model))
	}

	/** Degrees as badges on the nodes (and neighbours lit on hover), or not: one undo step. */
	private toggleDegrees(id: GraphShape['id']) {
		const shape = this.editor.getShape(id) as GraphShape | undefined
		if (!shape) return
		this.editor.markHistoryStoppingPoint('toggle degrees')
		this.editor.updateShape<GraphShape>({ id, type: GRAPH_SHAPE_TYPE, props: { degrees: !shape.props.degrees } })
	}

	override sceneBadges(shape: GraphShape) {
		return shape.props.degrees ? degrees(shape.props, shape.props.direction === 'directed') : undefined
	}

	/** With the degrees shown, pointing at a node lights its neighbours (directed: what it points to, what points to it). */
	hoverHighlights(shape: GraphShape, key: string): Marks {
		return shape.props.degrees ? neighbourMarks(shape.props, key, shape.props.direction === 'directed') : {}
	}

	private toggleView(id: GraphShape['id'], view: GraphViewShape['props']['view']) {
		const shape = this.editor.getShape(id) as GraphShape | undefined
		if (shape) toggleGraphView(this.editor, shape, view)
	}

	private algorithmOperations(shape: GraphShape): NodeOperation[] {
		const algorithms = { group: 'algorithms' }
		const pieces: NodeOperation = {
			...algorithms,
			id: 'graph-components',
			label: 'Count connected components',
			run: () => this.runAlgorithm(shape.id, 'connected components', (s) => components(s.props, this.algorithmOptions(s)).frames, undefined, 'graph-components'),
		}
		// Lecture 9's Task 18: DFS finds a cycle as an edge back to the call stack.
		const directed = shape.props.direction === 'directed'
		const cycle: NodeOperation = {
			...algorithms,
			id: 'graph-cycle',
			label: 'Is there a cycle?',
			run: () => this.runAlgorithm(shape.id, 'is there a cycle?', (s) => findCycle(s.props, directed).frames, undefined, directed ? 'graph-cycle-directed' : 'graph-cycle'),
		}
		const addVertex: NodeOperation = {
			group: 'representations',
			id: 'graph-add-vertex-costs',
			label: "Add a vertex: each view's cost",
			run: () => this.playCosts(shape.id, 'add a vertex', (s) => addVertexCosts(s.props)),
		}
		return [pieces, cycle, ...this.directedOrNot(shape, algorithms), addVertex]
	}

	private directedOrNot(shape: GraphShape, algorithms: { group: string }): NodeOperation[] {
		return shape.props.direction === 'directed'
			? [
					{
						...algorithms,
						id: 'graph-topological-sort',
						label: 'Topological sort',
						run: () => this.runAlgorithm(shape.id, 'topological sort', (s) => topologicalSort(s.props).frames, undefined, 'graph-topological-sort'),
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
			'Drag either end of an edge (just off its node) to another node to re-wire it; right-click a directed edge to reverse it, or the graph to reverse every edge (the transpose)',
			'With the graph tool (Shift+G), press on a node of a graph and drag: the graph goes on from there',
			'Right-click the graph: Graph > Lay out round a circle, or Tidy (edges even, nodes apart, from where they are)',
			'Hover a node or an edge for x (remove); drag the dot under a node to move it',
			"Right-click a node: Step by step has BFS, DFS, a path to another node (fewest edges), Dijkstra, Prim, connected components, Is there a cycle?, and what each representation pays (is it adjacent to another, add or remove a vertex); the graph: Kruskal (undirected) or topological sort (directed); an edge: what removing it costs",
			'Show: its adjacency matrix, lists, edge list or union-find beside it (again to hide it), each headed by what it costs; the code beside it',
			'Show > Degrees and neighbours: each node its degree, and pointing at a node lights its neighbours (directed: out green, in orange)',
			'Weighted: Graph > New weights, the same edges',
			'Style panel: Edges (directed or not), Weights, Labels, and Density, Pieces, Order for a new sketch',
		]
	}

	private algorithmOptions(shape: GraphShape) {
		return { directed: shape.props.direction === 'directed', weighted: shape.props.weights === 'weighted' }
	}

	private traverse(id: GraphShape['id'], start: string, kind: 'bfs' | 'dfs') {
		this.runAlgorithm(
			id,
			kind === 'bfs' ? 'breadth-first search' : 'depth-first search',
			(shape) => (kind === 'bfs' ? bfs : dfs)(shape.props, start, shape.props.direction === 'directed').frames,
			undefined,
			`graph-${kind}`
		)
	}

	/** The id of the vertex named `typed` (as it is, else in any case), if there is one. */
	private nodeNamed(id: GraphShape['id'], typed: string) {
		const shape = this.editor.getShape(id) as GraphShape | undefined
		const named = (match: (value: string) => boolean) => shape?.props.nodes.find((n) => match(n.value))
		return (named((v) => v === typed.trim()) ?? named((v) => v.toLowerCase() === typed.trim().toLowerCase()))?.id
	}

	/** The path with the fewest edges from `from` to the vertex named `to`, if there is one by that name. */
	private path(id: GraphShape['id'], from: string, to: string) {
		const target = this.nodeNamed(id, to)
		if (!target) return
		this.runAlgorithm(id, 'path', (s) => shortestPath(s.props, from, target, s.props.direction === 'directed').frames, undefined, 'graph-path')
	}

	/**
	 * What a change (or a question) costs each representation, step by step, with the adjacency matrix
	 * and lists beside the graph (opened for it if missing: Esc takes them away again). The change goes
	 * in at the end, as one undo step.
	 */
	private playCosts(id: GraphShape['id'], label: string, run: (shape: GraphShape) => CostRun) {
		const shape = this.editor.getShape(id) as GraphShape | undefined
		if (!shape) return
		const shown = new Set(viewsOf(this.editor, shape).map((v) => v.props.view))
		let mark: string | undefined
		for (const view of ['matrix', 'lists'] as const) {
			if (shown.has(view)) continue
			const current = this.editor.getShape(id) as GraphShape
			const made = showGraphView(this.editor, current, view)
			mark ??= made
		}
		const { frames, result } = run(this.editor.getShape(id) as GraphShape)
		playOperation(this.editor, {
			shapeId: id,
			label,
			frames,
			final: result && this.withModel(shape, result),
			onCancel: mark === undefined ? undefined : () => void this.editor.bailToMark(mark!),
		})
	}

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
		this.runAlgorithm(id, 'minimum spanning tree', (s) => kruskal(s.props, this.algorithmOptions(s)).frames, takeBack, 'graph-kruskal')
	}

	/** Play an algorithm's steps on the graph as it is now; nothing changes (Shift at the end keeps the highlights as marks). */
	private runAlgorithm(id: GraphShape['id'], label: string, steps: (shape: GraphShape) => Frame[], onCancel?: () => void, code?: string) {
		const shape = this.editor.getShape(id) as GraphShape | undefined
		if (!shape) return
		const frames = steps(shape)
		playOperation(this.editor, {
			shapeId: id,
			label,
			frames,
			onCancel,
			code,
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
		let placed = nodes
		if (change.density || change.parts) {
			const ids = nodes.map((n) => n.id)
			const sketch = generateGraph(nodes, seed, labels, options)
			edges = sketch.edges.map((e) => ({
				...e,
				from: ids[Number(e.from.slice(1))],
				to: ids[Number(e.to.slice(1))],
			}))
			// Complete: round a circle (from the first node), so no edge runs through a node.
			if (options.density === 'complete') placed = nodes.map((n, i) => ({ ...n, x: sketch.nodes[i].x, y: sketch.nodes[i].y }))
		} else if (change.order === 'dag') {
			edges = mergeTwins(edges.map((e) => (order.get(e.from)! > order.get(e.to)! ? { ...e, from: e.to, to: e.from } : e)))
		} else {
			return this.update(shape, options)
		}
		const update = this.withModel(shape, { nodes: placed, edges })
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
		// Connect grips on the node under the pointer (all nodes on touch screens), as for its x: drawn
		// apart (`Tracked`), so hovering from node to node doesn't redraw the graph.
		const busy = isBusy(playbackFor(this.editor, shape.id))
		const gripping = !dragging && !busy && showsStructureControls(this.editor, shape) && this.editor.isIn('select.idle')
		const zoom = this.editor.getZoomLevel()
		return (
			<>
				{super.component(shape)}
				<SVGContainer>
					<InFront id={shape.id} svg>
						{gripping && (
							<Tracked
								render={() => {
									const { showNode } = this.controlTargets(shape)
									return scene.nodes
										.filter((n) => showNode(n.key))
										.map((n) => <GrowGrip key={n.key} at={connectGripAt(n)} zoom={zoom} colors={colors} />)
								}}
							/>
						)}
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
					</InFront>
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
	// Moving an edge's tail: it runs from the pointer to the node that stays.
	const route = drag.rewire?.end === 'from' ? routeEdge(end, from) : routeEdge(from, end)
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
