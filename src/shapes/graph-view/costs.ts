import type { MarkColor, Marks } from '../../cells/marks'
import type { Frame } from '../../nodelink/playback'
import { edgeCellKey } from '../../nodelink/scene'
import { addNode, removeEdge, removeNode } from '../graph/model'
import { GRAPH_SPACING } from '../graph/generate'
import type { GraphShapeProps } from '../graph/graph-shape-types'
import { neighbours } from '../graph/traverse'
import { cellKey } from '../matrix/layout'
import { edgeList, edgeRowKeys, entryKey, headKey, orderedNodes, type CountedView } from './model'

// Lecture 9a's comparison of representations, step by step: what adding or removing a vertex or an
// edge, or asking whether two vertices are adjacent, costs the adjacency matrix, the adjacency lists
// and the edge list, each lighting what it has to touch (`Frame.views`, beside the graph) and counting
// it in the play bar. The matrix is a fixed V × V array (adding a vertex copies it into a bigger one),
// the lists an array of heads with a linked list each (in label order), the edge list the pairs.
// Corrections to the lecture: removing an edge from the lists walks u's list (and v's, undirected),
// O(deg u + deg v), not O(E); removing a vertex walks every list, O(V + E); and an edge list alone
// loses the vertices on no edge.

type Graph = Pick<GraphShapeProps, 'nodes' | 'edges' | 'direction' | 'weights' | 'labels'>

const TOUCHED: MarkColor = 'orange'
const CHANGED: MarkColor = 'red'
const ADDED: MarkColor = 'green'

export interface CostRun {
	frames: Frame[]
	/** The graph afterwards, if it changes. */
	result?: Pick<Graph, 'nodes' | 'edges'>
}

/** The play bar's counts: what each representation touched (cells, entries, rows). */
const costs = (matrix: number, lists: number, edges: number) => ({ 'matrix cells': matrix, 'list entries': lists, 'edge-list rows': edges })

function helpers(graph: Graph) {
	const label = new Map(graph.nodes.map((n) => [n.id, n.value]))
	const name = (id: string) => label.get(id) ?? id
	const directed = graph.direction === 'directed'
	const link = directed ? '→' : '–'
	const index = new Map(orderedNodes(graph).map((n, i) => [n.id, i]))
	const lists = neighbours(graph, directed)
	return { name, directed, link, index, lists }
}

const lit = (keys: string[], color: MarkColor): Marks => Object.fromEntries(keys.map((k) => [k, color]))

/** A vertex added on no edge, to the right of the graph: the matrix grows by copying, the lists by a head. */
export function addVertexCosts(graph: Graph): CostRun {
	const right = graph.nodes.length ? Math.max(...graph.nodes.map((n) => n.x)) + GRAPH_SPACING : 0
	const top = graph.nodes.length ? Math.min(...graph.nodes.map((n) => n.y)) : 0
	const { nodes, id } = addNode(graph, { x: right, y: top }, graph.labels)
	const after = { ...graph, nodes }
	const { name, index } = helpers(after)
	const V = graph.nodes.length
	const n = name(id)
	const at = index.get(id)!
	const props = { nodes, edges: graph.edges }
	const all = Array.from({ length: V + 1 }, (_, i) => i)
	const frames: Frame[] = [
		{
			props,
			flash: { [id]: ADDED },
			counts: costs(0, 0, 0),
			caption: `Add vertex ${n}, on no edge yet. What does each representation have to do for it?`,
			ask: false,
		},
		{
			props,
			views: {
				matrix: {
					...lit(all.flatMap((r) => all.filter((c) => r !== at && c !== at).map((c) => cellKey(r, c))), TOUCHED),
					...lit([...all.flatMap((i) => [cellKey(at, i), cellKey(i, at)]), `row:${at}`, `col:${at}`], ADDED),
				},
			},
			counts: costs((V + 1) ** 2, 0, 0),
			caption: `Matrix: a ${V} × ${V} array can't grow, so a new ${V + 1} × ${V + 1} one, the ${V * V} cells copied over and ${2 * V + 1} new ones for ${n}'s row and column: ${(V + 1) ** 2} cells, O(V²)`,
			ask: 'Adding a vertex: how many cells does the matrix write?',
		},
		{
			props,
			views: { lists: { [headKey(id)]: ADDED } },
			counts: costs((V + 1) ** 2, 1, 0),
			caption: `Lists: one more head, ${n}'s, for an empty list: 1, O(1) (amortised: the array of heads grows by doubling when full)`,
			ask: 'And the adjacency lists?',
		},
		{
			props,
			counts: costs((V + 1) ** 2, 1, 0),
			caption: `Edge list: nothing to write. A vertex on no edge isn't in any pair, so the vertices have to be kept apart from it`,
			ask: 'And the edge list?',
		},
		{
			props,
			counts: costs((V + 1) ** 2, 1, 0),
			caption: `Adding a vertex: the matrix ${(V + 1) ** 2} cells (V², the copy; with spare rows and columns it could be V), the lists 1, the edge list none`,
			ask: false,
		},
	]
	return { frames, result: props }
}

/** A vertex removed with its edges: the matrix copies what is left, the lists and the edge list are searched for it. */
export function removeVertexCosts(graph: Graph, v: string): CostRun {
	const { name, index, lists, directed } = helpers(graph)
	const V = graph.nodes.length
	const at = index.get(v)!
	const own = graph.edges.filter((e) => e.from === v || e.to === v)
	const n = name(v)
	const props = { nodes: graph.nodes, edges: graph.edges }
	const all = Array.from({ length: V }, (_, i) => i)
	// The lists: v's own goes; every other one is walked for entries naming v.
	const ownEntries = (lists.get(v) ?? []).map((x) => entryKey(v, x.edge))
	const others = [...lists.entries()].filter(([u]) => u !== v)
	const walked = others.flatMap(([u, list]) => list.map((x) => ({ key: entryKey(u, x.edge), names: x.node === v })))
	const entries = ownEntries.length + walked.length
	const { rows } = edgeList(graph)
	const matrixCells = (V - 1) ** 2
	const frames: Frame[] = [
		{
			props,
			flash: { [v]: CHANGED, ...lit(own.map((e) => edgeCellKey(e.id)), CHANGED) },
			counts: costs(0, 0, 0),
			caption: `Remove vertex ${n} and its ${own.length} edge${own.length === 1 ? '' : 's'}. What does each representation have to do?`,
			ask: false,
		},
		{
			props,
			views: {
				matrix: {
					...lit(all.flatMap((r) => all.filter((c) => r !== at && c !== at).map((c) => cellKey(r, c))), TOUCHED),
					...lit([...all.flatMap((i) => [cellKey(at, i), cellKey(i, at)]), `row:${at}`, `col:${at}`], CHANGED),
				},
			},
			counts: costs(matrixCells, 0, 0),
			caption: `Matrix: a new ${V - 1} × ${V - 1} array, the ${matrixCells} cells outside ${n}'s row and column copied over: O(V²)`,
			ask: 'Removing a vertex: how many cells does the matrix copy?',
		},
		{
			props,
			views: {
				lists: {
					...lit(walked.filter((w) => !w.names).map((w) => w.key), TOUCHED),
					...lit([headKey(v), ...ownEntries, ...walked.filter((w) => w.names).map((w) => w.key)], CHANGED),
				},
			},
			counts: costs(matrixCells, entries, 0),
			caption: `Lists: ${n}'s list goes (${ownEntries.length} entr${ownEntries.length === 1 ? 'y' : 'ies'}), and every other list is walked to take ${n} out: ${walked.length} looked at, ${walked.filter((w) => w.names).length} taken out. O(V + E)${directed ? ": in-edges can be in anyone's list" : ''}`,
			ask: 'And the adjacency lists?',
		},
		{
			props,
			views: { edges: Object.fromEntries(rows.flatMap((r, i) => edgeRowKeys(graph, i).map((k) => [k, r.from === v || r.to === v ? CHANGED : TOUCHED]))) },
			counts: costs(matrixCells, entries, rows.length),
			caption: `Edge list: every pair looked at, the ${own.length} naming ${n} taken out: ${rows.length} rows, O(E)`,
			ask: 'And the edge list?',
		},
	]
	const result = removeNode(graph, v)
	frames.push({
		props: result,
		flash: Object.fromEntries([v, ...own.map((e) => edgeCellKey(e.id))].map((k) => [k, null])),
		counts: costs(matrixCells, entries, rows.length),
		caption: `${n} is gone, with its edges: the matrix copied ${matrixCells} cells (V²), the lists walked ${entries} entries (V + E), the edge list ${rows.length} rows (E)`,
		ask: false,
	})
	return { frames, result }
}

/** Where `x` is in `u`'s list: the entries walked to reach it (it last), or all of them if it isn't there. */
function walkTo(lists: ReturnType<typeof neighbours>, u: string, x: string) {
	const list = lists.get(u) ?? []
	const k = list.findIndex((e) => e.node === x)
	return { walked: (k < 0 ? list : list.slice(0, k + 1)).map((e) => entryKey(u, e.edge)), found: k >= 0 }
}

/** An edge removed: two cells of the matrix, a walk along one list or two, a search of the pairs. */
export function removeEdgeCosts(graph: Graph, edgeId: string): CostRun {
	const { name, index, lists, directed, link } = helpers(graph)
	const edge = graph.edges.find((e) => e.id === edgeId)!
	const [u, v] = [edge.from, edge.to]
	const pair = `${name(u)}${link}${name(v)}`
	const props = { nodes: graph.nodes, edges: graph.edges }
	const cells = directed || u === v ? [cellKey(index.get(u)!, index.get(v)!)] : [cellKey(index.get(u)!, index.get(v)!), cellKey(index.get(v)!, index.get(u)!)]
	const fromU = walkTo(lists, u, v)
	const fromV = directed || u === v ? { walked: [] as string[] } : walkTo(lists, v, u)
	const walked = [...fromU.walked, ...fromV.walked]
	const { rows } = edgeList(graph)
	const row = rows.findIndex((r) => r.edge === edgeId)
	const changed = (keys: string[]) => ({ ...lit(keys, TOUCHED), ...lit(keys.slice(-1), CHANGED) })
	const frames: Frame[] = [
		{ props, flash: { [edgeCellKey(edgeId)]: CHANGED }, counts: costs(0, 0, 0), caption: `Remove edge ${pair}. What does each representation have to do?`, ask: false },
		{
			props,
			views: { matrix: lit(cells, CHANGED) },
			counts: costs(cells.length, 0, 0),
			caption: `Matrix: a[${name(u)}][${name(v)}] = 0${cells.length > 1 ? ` and a[${name(v)}][${name(u)}] = 0` : ''}: ${cells.length} cell${cells.length === 1 ? '' : 's'}, O(1)`,
			ask: 'Removing an edge: how many cells does the matrix touch?',
		},
		{
			props,
			views: { lists: { ...changed(fromU.walked), ...changed(fromV.walked) } },
			counts: costs(cells.length, walked.length, 0),
			caption: `Lists: walk ${name(u)}'s list to ${name(v)} (${fromU.walked.length})${fromV.walked.length ? ` and ${name(v)}'s to ${name(u)} (${fromV.walked.length})` : ''} and unlink: ${walked.length} entr${walked.length === 1 ? 'y' : 'ies'}, O(deg ${name(u)}${fromV.walked.length ? ` + deg ${name(v)}` : ''})`,
			ask: 'And the adjacency lists?',
		},
		{
			props,
			views: { edges: Object.fromEntries(rows.slice(0, row + 1).flatMap((_, i) => edgeRowKeys(graph, i).map((k) => [k, i === row ? CHANGED : TOUCHED]))) },
			counts: costs(cells.length, walked.length, row + 1),
			caption: `Edge list: look through the pairs until ${pair}, and take it out: ${row + 1} row${row === 0 ? '' : 's'}, O(E)`,
			ask: 'And the edge list?',
		},
	]
	const result = removeEdge(graph, edgeId)
	frames.push({
		props: result,
		flash: { [edgeCellKey(edgeId)]: null },
		counts: costs(cells.length, walked.length, row + 1),
		caption: `${pair} is gone: the matrix ${cells.length} cell${cells.length === 1 ? '' : 's'} (O(1)), the lists ${walked.length} entries (O(degree)), the edge list ${row + 1} rows (O(E))`,
		ask: false,
	})
	return { frames, result }
}

/** Is there an edge u–v? One matrix cell, a walk along u's list, a search of the pairs. */
export function hasEdgeCosts(graph: Graph, u: string, v: string): CostRun {
	const { name, index, lists, directed, link } = helpers(graph)
	const pair = `${name(u)}${link}${name(v)}`
	const props = { nodes: graph.nodes, edges: graph.edges }
	const cell = cellKey(index.get(u)!, index.get(v)!)
	const { walked, found } = walkTo(lists, u, v)
	const { rows } = edgeList(graph)
	const matches = (r: (typeof rows)[number]) => (r.from === u && r.to === v) || (!directed && r.from === v && r.to === u)
	const row = rows.findIndex(matches)
	const scanned = row < 0 ? rows.length : row + 1
	const answer = found ? 'yes' : 'no'
	const colour = found ? ADDED : CHANGED
	const frames: Frame[] = [
		{ props, flash: { [u]: TOUCHED, [v]: TOUCHED }, counts: costs(0, 0, 0), caption: `Is there an edge ${pair}? What does each representation have to look at?`, ask: false },
		{
			props,
			views: { matrix: { [cell]: colour } },
			counts: costs(1, 0, 0),
			caption: `Matrix: a[${name(u)}][${name(v)}] says it at once, ${answer}: 1 cell, O(1)`,
			ask: `Is there an edge ${pair}: how many cells does the matrix look at?`,
		},
		{
			props,
			views: { lists: { ...lit(walked, TOUCHED), ...(found ? lit(walked.slice(-1), ADDED) : {}) } },
			counts: costs(1, walked.length, 0),
			caption: `Lists: walk ${name(u)}'s list ${found ? `until ${name(v)}` : 'to the end'}, ${answer}: ${walked.length} entr${walked.length === 1 ? 'y' : 'ies'}, O(deg ${name(u)})`,
			ask: 'And the adjacency lists?',
		},
		{
			props,
			views: { edges: Object.fromEntries(rows.slice(0, scanned).flatMap((_, i) => edgeRowKeys(graph, i).map((k) => [k, i === row ? ADDED : TOUCHED]))) },
			counts: costs(1, walked.length, scanned),
			caption: `Edge list: look through the pairs ${row < 0 ? 'to the end' : `until ${pair}`}, ${answer}: ${scanned} row${scanned === 1 ? '' : 's'}, O(E)`,
			ask: 'And the edge list?',
		},
		{
			props,
			counts: costs(1, walked.length, scanned),
			caption: `${found ? 'Yes' : 'No'}, ${found ? 'there is' : "there's no"} edge ${pair}: the matrix looked at 1 cell, the lists ${walked.length} entries, the edge list ${scanned} rows`,
			ask: false,
		},
	]
	return { frames }
}

/** The views an operation's costs are shown in. */
export const COST_VIEWS: CountedView[] = ['matrix', 'lists', 'edges']
