import { mulberry32, randomInt } from '../../data/random'
import { edgeCellKey } from '../../nodelink/scene'
import type { GraphEdge, GraphLabelsMode, GraphNode, GraphShapeProps } from './graph-shape-types'

/** The structural part of a graph's props. */
export type GraphModel = Pick<GraphShapeProps, 'nodes' | 'edges'>

/** Label of the i-th node: A..Z, AA, AB... (like spreadsheet columns), or 0, 1, 2... */
export function nodeLabel(i: number, labels: GraphLabelsMode): string {
	if (labels === 'numbers') return String(i)
	let label = ''
	for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + ((n - 1) % 26)) + label
	return label
}

/** The first label of the sequence that no node has yet (a new node's label). */
export function nextLabel(nodes: readonly GraphNode[], labels: GraphLabelsMode): string {
	const used = new Set(nodes.map((n) => n.value))
	for (let i = 0; ; i++) {
		const label = nodeLabel(i, labels)
		if (!used.has(label)) return label
	}
}

/** Every node labelled afresh, in node order. */
export function relabel(nodes: readonly GraphNode[], labels: GraphLabelsMode): GraphNode[] {
	return nodes.map((n, i) => ({ ...n, value: nodeLabel(i, labels) }))
}

/** `prefix` plus one more than the largest number used after it so far. */
function nextId(prefix: string, ids: readonly string[]): string {
	const used = ids.map((id) => Number(id.slice(prefix.length))).filter(Number.isFinite)
	return prefix + (used.length ? Math.max(...used) + 1 : 0)
}

export const nextNodeId = (nodes: readonly GraphNode[]) => nextId('v', nodes.map((n) => n.id))
export const nextEdgeId = (edges: readonly GraphEdge[]) => nextId('e', edges.map((e) => e.id))

/** A random weight 1-9 for an edge, deterministic in the shape's seed and the edge's id. */
export function edgeWeight(seed: number, edgeId: string): string {
	const salt = Number(edgeId.slice(1)) || 0
	return String(randomInt(1, 9, mulberry32((seed ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0)))
}

/** The edge from `from` to `to` (either way round when undirected), if there is one. */
export function findEdge(edges: readonly GraphEdge[], from: string, to: string, directed: boolean) {
	return edges.find((e) => (e.from === from && e.to === to) || (!directed && e.from === to && e.to === from))
}

export function addNode(model: GraphModel, at: { x: number; y: number }, labels: GraphLabelsMode) {
	const id = nextNodeId(model.nodes)
	const nodes = [...model.nodes, { id, value: nextLabel(model.nodes, labels), x: at.x, y: at.y }]
	return { nodes, id }
}

/**
 * The edges with one more, from `from` to `to`; undefined for a self-loop or an edge that is
 * already there (in an undirected graph, either way round).
 */
export function addEdge(model: GraphModel, from: string, to: string, directed: boolean, seed: number) {
	if (from === to || findEdge(model.edges, from, to, directed)) return undefined
	if (!model.nodes.some((n) => n.id === from) || !model.nodes.some((n) => n.id === to)) return undefined
	const id = nextEdgeId(model.edges)
	return { edges: [...model.edges, { id, from, to, weight: edgeWeight(seed, id) }], id }
}

/** Remove a node and every edge that touches it. */
export function removeNode(model: GraphModel, id: string): GraphModel {
	return {
		nodes: model.nodes.filter((n) => n.id !== id),
		edges: model.edges.filter((e) => e.from !== id && e.to !== id),
	}
}

export function removeEdge(model: GraphModel, id: string): GraphModel {
	return { nodes: model.nodes, edges: model.edges.filter((e) => e.id !== id) }
}

/** For an undirected graph: one edge per pair of nodes (the first of u->v and v->u is kept). */
export function mergeTwins(edges: readonly GraphEdge[]): GraphEdge[] {
	const seen = new Set<string>()
	return edges.filter((e) => {
		const pair = [e.from, e.to].sort().join(' ')
		if (seen.has(pair)) return false
		seen.add(pair)
		return true
	})
}

/** Keys that can carry a mark: node ids and `edge:<id>` for edges. */
export function markKeys(model: GraphModel): string[] {
	return [...model.nodes.map((n) => n.id), ...model.edges.map((e) => edgeCellKey(e.id))]
}
