import type { TLDefaultSizeStyle } from 'tldraw'
import type { MarkColor, Marks } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { FrameSets } from '../../nodelink/playback'
import { translateScene, type Scene, type SceneEdge, type SceneNode } from '../../nodelink/scene'
import { kruskal } from '../graph/algorithms'
import { edgeKey as ufEdgeKey, elementKey, parentKey, unionFindScene } from '../union-find/layout'
import { CELL_SIZES } from '../sizes'
import type { GraphEdge, GraphNode, GraphShapeProps } from '../graph/graph-shape-types'
import { neighbours } from '../graph/traverse'
import { cellKey } from '../matrix/layout'

// A graph's adjacency matrix and adjacency lists, worked out from its props: pure, so a view shape
// can redraw them whenever the graph changes. Highlights on the graph (its marks, an operation's
// steps) map onto the view: a node lights its row and column (its list's head), an edge its cell
// (its entries in the lists).

type Graph = Pick<GraphShapeProps, 'nodes' | 'edges' | 'direction' | 'weights'>

/** Nodes in label order, as the matrix's rows and columns and the lists run (and BFS / DFS visit neighbours). */
export function orderedNodes({ nodes }: Pick<Graph, 'nodes'>): GraphNode[] {
	return [...nodes].sort((a, b) => compareKeys(a.value, b.value) || a.id.localeCompare(b.id))
}

/** The cells an edge fills: (from, to), and (to, from) too when undirected. */
function edgeCells(edge: GraphEdge, index: Map<string, number>, directed: boolean): string[] {
	const [i, j] = [index.get(edge.from), index.get(edge.to)]
	if (i === undefined || j === undefined) return []
	return directed || i === j ? [cellKey(i, j)] : [cellKey(i, j), cellKey(j, i)]
}

/**
 * The adjacency matrix: row u, column v holds 1 if there is an edge u -> v (either way when
 * undirected), else 0; weighted, the edge's weight, else blank.
 */
export function adjacencyMatrix(graph: Graph) {
	const nodes = orderedNodes(graph)
	const index = new Map(nodes.map((n, i) => [n.id, i]))
	const directed = graph.direction === 'directed'
	const weighted = graph.weights === 'weighted'
	const values: string[][] = nodes.map(() => nodes.map(() => (weighted ? '' : '0')))
	for (const edge of graph.edges) {
		for (const key of edgeCells(edge, index, directed)) {
			const [r, c] = key.split(',').map(Number)
			values[r][c] = weighted ? edge.weight : '1'
		}
	}
	return { labels: nodes.map((n) => n.value), values }
}

/** Scene keys of the lists view: a node's head cell, and the entry for one of its edges. */
export const headKey = (node: string) => `h:${node}`
export const entryKey = (node: string, edge: string) => `n:${node}:${edge}`

/**
 * The adjacency lists as a scene, an array of list heads: each node's label on the left, its head
 * cell (one under another, like an array's cells), and the chain of its neighbours, in label order.
 */
export function adjacencyScene(graph: Graph, size: TLDefaultSizeStyle): Scene {
	const cell = CELL_SIZES[size]
	const pointerW = cell * 0.5
	const nodeW = cell * (graph.weights === 'weighted' ? 1.3 : 0.9) + pointerW
	const nodeH = cell * 0.8
	const gap = cell * 0.6
	const labelW = cell * 0.6
	const labelFontSize = Math.max(10, cell * 0.28)
	const label = new Map(graph.nodes.map((n) => [n.id, n.value]))
	const weight = new Map(graph.edges.map((e) => [e.id, e.weight]))
	const lists = neighbours(graph, graph.direction === 'directed')
	const nodes: SceneNode[] = []
	const edges: SceneEdge[] = []
	orderedNodes(graph).forEach((node, i) => {
		const y = (i + 0.5) * cell
		nodes.push({ key: `l:${node.id}`, kind: 'label', x: labelW / 2, y, w: labelW, h: labelFontSize * 1.6, value: node.value, editable: false, draggable: false })
		nodes.push({
			key: headKey(node.id),
			kind: 'list-node',
			x: labelW + pointerW / 2,
			y,
			w: pointerW,
			h: cell,
			value: '',
			pointer: { side: 'right', width: pointerW },
			editable: false,
			draggable: false,
		})
		let previous = headKey(node.id)
		;(lists.get(node.id) ?? []).forEach(({ node: other, edge }, k) => {
			const key = entryKey(node.id, edge)
			nodes.push({
				key,
				kind: 'list-node',
				x: labelW + pointerW + gap + nodeW / 2 + k * (nodeW + gap),
				y,
				w: nodeW,
				h: nodeH,
				value: graph.weights === 'weighted' ? `${label.get(other)}:${weight.get(edge)}` : (label.get(other) ?? ''),
				pointer: { side: 'right', width: pointerW },
				editable: false,
				draggable: false,
			})
			edges.push({ key: `${previous}->`, from: previous, to: key, directed: true, fromPointer: true })
			previous = key
		})
	})
	return {
		nodes,
		edges,
		metrics: { fontSize: cell * 0.42, labelFontSize, strokeWidth: Math.max(1.5, cell / 24) },
	}
}

/**
 * The graph's highlights on the view: a node's on its row and column header (matrix) or its list's
 * head (lists), an edge's (`edge:<id>`) on its cells or list entries. Null (clear) entries carry over.
 */
export function viewHighlights(graph: Graph, view: 'matrix' | 'lists', marks: Record<string, MarkColor | null>): Marks {
	const out: Record<string, MarkColor | null> = {}
	const nodes = orderedNodes(graph)
	const index = new Map(nodes.map((n, i) => [n.id, i]))
	const directed = graph.direction === 'directed'
	const edges = new Map(graph.edges.map((e) => [e.id, e]))
	for (const [key, color] of Object.entries(marks)) {
		if (key.startsWith('edge:')) {
			const edge = edges.get(key.slice(5))
			if (!edge) continue
			const keys =
				view === 'matrix'
					? edgeCells(edge, index, directed)
					: [entryKey(edge.from, edge.id), ...(directed ? [] : [entryKey(edge.to, edge.id)])]
			for (const k of keys) out[k] = color
		} else if (index.has(key)) {
			if (view === 'matrix') {
				out[`row:${index.get(key)}`] = color
				out[`col:${index.get(key)}`] = color
			} else out[headKey(key)] = color
		}
	}
	return out as Marks
}

// Union-find view: Kruskal's union-find over the graph's nodes (in label order), drawn as the
// union-find shape draws one. While Kruskal plays, a step's sets (`Frame.sets`); otherwise where
// Kruskal ends: the graph's connected pieces.

const endSets = new WeakMap<object, FrameSets>()

/** The sets Kruskal leaves (union by size, over the edges cheapest first). */
export function kruskalSets(graph: Graph): FrameSets {
	let sets = endSets.get(graph)
	if (!sets) {
		sets = kruskal(graph, { directed: false, weighted: graph.weights === 'weighted' }).frames.at(-1)?.sets ?? { parent: {}, sizes: {} }
		endSets.set(graph, sets)
	}
	return sets
}

/** How many levels the deepest tree of some sets has. */
export function setsLevels(sets: FrameSets): number {
	const up = (id: string) => {
		let levels = 1
		for (let at = id; sets.parent[at] !== undefined && sets.parent[at] !== at && levels <= Object.keys(sets.parent).length; at = sets.parent[at]) levels++
		return levels
	}
	return Math.max(1, ...Object.keys(sets.parent).map(up))
}

/**
 * The union-find scene of `sets` (default: where Kruskal ends), at the origin, and its box. Laid out
 * from the widest arrangement (every node on its own), with `levels` of room for trees, so nothing
 * moves as sets merge during an operation.
 */
export function unionFindView(graph: Graph, size: TLDefaultSizeStyle, sets: FrameSets = kruskalSets(graph), levels = 1) {
	const nodes = orderedNodes(graph)
	const index = new Map(nodes.map((n, i) => [n.id, i]))
	const props = {
		labels: nodes.map((n) => n.value),
		parent: nodes.map((n, i) => index.get(sets.parent[n.id]) ?? i),
		sizes: nodes.map((n) => sets.sizes[n.id] ?? 1),
		ranks: nodes.map(() => 0),
		unionBy: 'size' as const,
		size,
	}
	const widest = unionFindScene({ ...props, parent: nodes.map((_, i) => i) }, { names: true })
	if (!widest.nodes.length) return { scene: widest, box: { x: 0, y: 0, w: 1, h: 1 }, index }
	const minX = Math.min(...widest.nodes.map((n) => n.x - n.w / 2))
	const maxX = Math.max(...widest.nodes.map((n) => n.x + n.w / 2))
	const scene = translateScene(unionFindScene(props, { levels, names: true }), { x: -minX, y: 0 })
	return { scene, box: { x: 0, y: 0, w: maxX - minX, h: Math.max(...scene.nodes.map((n) => n.y + n.h / 2)) }, index }
}

/**
 * Highlights on the union-find view in its keys: the graph's node marks on their elements, and a
 * step's `sets.flash` (nodes, `edge:<node>` for a node's parent pointer).
 */
export function setsHighlights(graph: Graph, marks: Record<string, MarkColor | null>): Marks {
	const index = new Map(orderedNodes(graph).map((n, i) => [n.id, i]))
	const out: Marks = {}
	for (const [key, color] of Object.entries(marks)) {
		if (!color) continue
		const node = key.startsWith('edge:') ? key.slice(5) : key
		const i = index.get(node)
		if (i === undefined) continue
		if (key.startsWith('edge:')) out[`edge:${ufEdgeKey(i)}`] = color
		else Object.assign(out, { [elementKey(i)]: color, [parentKey(i)]: color })
	}
	return out
}
