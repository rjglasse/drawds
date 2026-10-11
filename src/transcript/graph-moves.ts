// A graph's moves, as its transcript keeps them (as `array-moves.ts` for arrays): vertices named by
// their labels, as the graph's code and the drawing name them. Where nodes sit is the drawing's
// business, not the graph's: moving one logs nothing.

export type GraphMove =
	| { op: 'new'; name: string; vertices: string[]; edges: [string, string, string][] }
	| { op: 'addVertex'; v: string }
	| { op: 'removeVertex'; v: string }
	/** A vertex's label typed anew. */
	| { op: 'rename'; from: string; to: string }
	| { op: 'addEdge'; from: string; to: string; weight: string }
	| { op: 'removeEdge'; from: string; to: string }
	| { op: 'weight'; from: string; to: string; weight: string }
	/** A new graph on the same canvas (rewired, relabelled): built again. */
	| { op: 'assign'; vertices: string[]; edges: [string, string, string][] }

/** What a graph's transcript follows: its vertices and edges, by id, where they are drawn left out. */
export interface GraphState {
	nodes: { id: string; value: string }[]
	edges: { id: string; from: string; to: string; weight: string }[]
}

export const graphState = ({ nodes, edges }: GraphState): GraphState => ({
	nodes: nodes.map(({ id, value }) => ({ id, value })),
	edges: edges.map(({ id, from, to, weight }) => ({ id, from, to, weight })),
})

export function sameGraph(a: GraphState, b: GraphState): boolean {
	return (
		a.nodes.length === b.nodes.length &&
		a.edges.length === b.edges.length &&
		a.nodes.every((n, i) => n.id === b.nodes[i].id && n.value === b.nodes[i].value) &&
		a.edges.every((e, i) => e.id === b.edges[i].id && e.from === b.edges[i].from && e.to === b.edges[i].to && e.weight === b.edges[i].weight)
	)
}

/** The graph as the transcript builds it: its labels, and its edges between them. */
export function built(g: GraphState): { vertices: string[]; edges: [string, string, string][] } {
	const label = new Map(g.nodes.map((n) => [n.id, n.value]))
	return { vertices: g.nodes.map((n) => n.value), edges: g.edges.map((e) => [label.get(e.from) ?? e.from, label.get(e.to) ?? e.to, e.weight]) }
}

/**
 * The moves that take a graph from `prev` to `next`: edges out, vertices out (their edges with them),
 * labels typed anew, vertices in, edges in, weights changed. Most of it new at once (a graph rewired,
 * its labels switched): built again.
 */
export function diffGraph(prev: GraphState, next: GraphState): GraphMove[] {
	if (sameGraph(prev, next)) return []
	const before = new Map(prev.nodes.map((n) => [n.id, n.value]))
	const after = new Map(next.nodes.map((n) => [n.id, n.value]))
	const edgesBefore = new Map(prev.edges.map((e) => [e.id, e]))
	const edgesAfter = new Map(next.edges.map((e) => [e.id, e]))
	const goneNodes = prev.nodes.filter((n) => !after.has(n.id))
	const newNodes = next.nodes.filter((n) => !before.has(n.id))
	const renamed = next.nodes.filter((n) => before.has(n.id) && before.get(n.id) !== n.value)
	const goneEdges = prev.edges.filter((e) => !edgesAfter.has(e.id))
	const newEdges = next.edges.filter((e) => !edgesBefore.has(e.id))
	const reweighed = next.edges.filter((e) => edgesBefore.has(e.id) && edgesBefore.get(e.id)!.weight !== e.weight)
	// A rewire or a switch of labels: most of it new, so it is built again.
	const rebuilt = (goneEdges.length > prev.edges.length / 2 && newEdges.length > next.edges.length / 2 && next.edges.length > 2) || renamed.length > Math.max(1, next.nodes.length / 2)
	if (rebuilt) return [{ op: 'assign', ...built(next) }]
	const goneIds = new Set(goneNodes.map((n) => n.id))
	return [
		// An edge goes with its vertex: only the others are said.
		...goneEdges.filter((e) => !goneIds.has(e.from) && !goneIds.has(e.to)).map((e): GraphMove => ({ op: 'removeEdge', from: before.get(e.from)!, to: before.get(e.to)! })),
		...goneNodes.map((n): GraphMove => ({ op: 'removeVertex', v: n.value })),
		...renamed.map((n): GraphMove => ({ op: 'rename', from: before.get(n.id)!, to: n.value })),
		...newNodes.map((n): GraphMove => ({ op: 'addVertex', v: n.value })),
		...newEdges.map((e): GraphMove => ({ op: 'addEdge', from: after.get(e.from)!, to: after.get(e.to)!, weight: e.weight })),
		...reweighed.map((e): GraphMove => ({ op: 'weight', from: after.get(e.from)!, to: after.get(e.to)!, weight: e.weight })),
	]
}
