import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { Frame, FrameSets } from '../../nodelink/playback'
import { edgeCellKey } from '../../nodelink/scene'
import { findPath, singletons, union } from '../union-find/union-find'
import type { GraphModel } from './model'
import { neighbours, Recorder } from './traverse'

// Weighted-graph and DAG algorithms, step by step, in the colours of the traversals: the node being
// worked on red, nodes waiting (in a queue) orange, finished nodes blue, chosen edges green; an
// edge being looked at flashes orange (red when it is turned down). Badges carry distances or
// in-degrees; the play bar counts updates or the total weight.

const CURRENT: MarkColor = 'red'
const WAITING: MarkColor = 'orange'
const DONE: MarkColor = 'blue'
const CHOSEN: MarkColor = 'green'
const LOOKING: MarkColor = 'orange'
const REJECTED: MarkColor = 'red'

export interface AlgorithmOptions {
	directed: boolean
	/** Whether weights are shown: if not, every edge counts 1. */
	weighted: boolean
}

export interface GraphRun {
	frames: Frame[]
	/** Edges chosen: the shortest-path tree, or the spanning tree. */
	chosen: string[]
	/** Dijkstra: each node's final distance (Infinity if unreachable). */
	dist?: Map<string, number>
	/** Topological sort: the order (shorter than the graph if there is a cycle). */
	order?: string[]
	/** Connected components: the pieces, each a list of nodes in the order found. */
	pieces?: string[][]
}

function helpers(model: GraphModel, { directed, weighted }: AlgorithmOptions) {
	const label = new Map(model.nodes.map((n) => [n.id, n.value]))
	const edges = new Map(model.edges.map((e) => [e.id, e]))
	const weight = (id: string) => {
		const w = Number(edges.get(id)?.weight)
		return weighted && Number.isFinite(w) ? w : 1
	}
	const name = (id: string) => label.get(id) ?? id
	const link = directed ? '→' : '–'
	const edgeName = (id: string) => {
		const e = edges.get(id)!
		return `${name(e.from)}${link}${name(e.to)}${weighted ? ` (${weight(id)})` : ''}`
	}
	const byLabel = (a: string, b: string) => compareKeys(name(a), name(b)) || a.localeCompare(b)
	const note = weighted ? '' : 'The graph is unweighted, so every edge counts 1. '
	return { name, link, weight, edgeName, byLabel, note }
}

const show = (d: number) => (d === Infinity ? '∞' : String(d))

/**
 * Dijkstra's shortest paths from `start`: every node's distance starts at ∞ (a badge); the closest
 * unfinished node is taken, its distance is final, and each of its edges may lower a neighbour's
 * distance. The best edge into each node is green, so the green edges end as the shortest paths.
 */
export function dijkstra(model: GraphModel, start: string, options: AlgorithmOptions): GraphRun {
	const { name, link, weight, byLabel, note } = helpers(model, options)
	const adjacent = neighbours(model, options.directed)
	const rec = new Recorder()
	const dist = new Map(model.nodes.map((n) => [n.id, n.id === start ? 0 : Infinity]))
	const via = new Map<string, string>()
	const done = new Set<string>()
	let updates = 0
	const open = () => [...dist].filter(([id, d]) => d < Infinity && !done.has(id)).map(([id]) => id)
	const strips = () => [
		{
			title: 'priority queue (closest first)',
			items: open()
				.sort((a, b) => dist.get(a)! - dist.get(b)! || byLabel(a, b))
				.map((id) => `${name(id)}:${dist.get(id)}`),
		},
	]
	const negative = options.weighted && model.edges.some((e) => weight(e.id) < 0)
	rec.add({
		flash: { [start]: WAITING },
		badges: Object.fromEntries(model.nodes.map((n) => [n.id, show(dist.get(n.id)!)])),
		strips: strips(),
		counts: { updates },
		caption: `${note}${negative ? 'Careful: Dijkstra assumes no negative weights. ' : ''}dist(${name(start)}) = 0, every other node ∞`,
	})
	let previous: string | undefined
	for (;;) {
		const u = open().sort((a, b) => dist.get(a)! - dist.get(b)! || byLabel(a, b))[0]
		if (u === undefined) break
		const du = dist.get(u)!
		done.add(u)
		rec.add({
			flash: { [u]: CURRENT, ...(previous ? { [previous]: DONE } : {}) },
			strips: strips(),
			caption: `Take the closest unfinished node, ${name(u)} (${du}): its distance is final`,
		})
		for (const { node: v, edge } of adjacent.get(u) ?? []) {
			const w = weight(edge)
			const step = `${name(u)}${link}${name(v)}${options.weighted ? ` (${w})` : ''}`
			if (done.has(v)) {
				rec.look(edge, { caption: `${step}: ${name(v)} is finished, its distance can't improve` })
				continue
			}
			const d = du + w
			const before = dist.get(v)!
			if (d >= before) {
				rec.look(edge, { caption: `${step}: ${du} + ${w} = ${d} ≥ ${before}, so keep ${before}` })
				continue
			}
			const replaced = via.get(v)
			dist.set(v, d)
			via.set(v, edge)
			updates++
			rec.add({
				flash: { [v]: WAITING, [edgeCellKey(edge)]: CHOSEN, ...(replaced ? { [edgeCellKey(replaced)]: null } : {}) },
				badges: { [v]: String(d) },
				strips: strips(),
				counts: { updates },
				caption: `${step}: ${du} + ${w} = ${d} < ${show(before)}, so dist(${name(v)}) = ${d}, via ${name(u)}`,
			})
		}
		previous = u
	}
	const unreachable = [...dist.values()].filter((d) => d === Infinity).length
	rec.add({
		flash: previous ? { [previous]: DONE } : {},
		strips: strips(),
		caption: unreachable
			? `Nothing left to take: ${unreachable} node${unreachable === 1 ? " can't" : "s can't"} be reached (∞). The green edges are the shortest paths`
			: `Every node is finished: the green edges are the shortest paths from ${name(start)}`,
	})
	return { frames: rec.frames, chosen: [...via.values()], dist }
}

/**
 * Prim's minimum spanning tree, grown from `start`: each step lights the edges leaving the tree,
 * and the cheapest of them joins it, with the node at its far end. Undirected graphs only.
 */
export function prim(model: GraphModel, start: string, options: AlgorithmOptions): GraphRun {
	const { name, weight, edgeName, byLabel, note } = helpers(model, { ...options, directed: false })
	const rec = new Recorder()
	const inTree = new Set([start])
	const chosen: string[] = []
	let total = 0
	rec.add({ flash: { [start]: DONE }, counts: { weight: total }, caption: `${note}Grow the tree from ${name(start)}` })
	for (;;) {
		const crossing = model.edges.filter((e) => inTree.has(e.from) !== inTree.has(e.to))
		if (!crossing.length) break
		const best = [...crossing].sort((a, b) => weight(a.id) - weight(b.id) || byLabel(a.from, b.from) || byLabel(a.to, b.to))[0]
		const lit = Object.fromEntries(crossing.map((e) => [edgeCellKey(e.id), LOOKING]))
		rec.add({
			flash: lit,
			caption: `${crossing.length} edge${crossing.length === 1 ? ' leaves' : 's leave'} the tree; the cheapest is ${edgeName(best.id)}`,
		})
		const added = inTree.has(best.from) ? best.to : best.from
		inTree.add(added)
		chosen.push(best.id)
		total += weight(best.id)
		rec.add({
			flash: { ...Object.fromEntries(crossing.map((e) => [edgeCellKey(e.id), null])), [edgeCellKey(best.id)]: CHOSEN, [added]: DONE },
			counts: { weight: total },
			caption: `Add ${edgeName(best.id)}, and ${name(added)} with it`,
		})
	}
	const left = model.nodes.length - inTree.size
	rec.add({
		caption: left
			? `No edge leaves the tree, but ${left} node${left === 1 ? " isn't" : "s aren't"} in it: this is the minimum spanning tree of ${name(start)}'s part of the graph, weight ${total}`
			: `Every node is in the tree: a minimum spanning tree, total weight ${total}`,
	})
	return { frames: rec.frames, chosen }
}

/**
 * Kruskal's minimum spanning tree: the edges from cheapest to dearest, each taken if it joins two
 * separate trees and skipped (red) if its ends are already connected, as it would close a cycle. A
 * union-find keeps the trees (union by size): each step asks find() for both ends' roots, and a
 * taken edge unions the two sets. Every frame carries the sets for the union-find drawn beside it.
 */
export function kruskal(model: GraphModel, options: AlgorithmOptions): GraphRun {
	const { name, weight, edgeName, note } = helpers(model, { ...options, directed: false })
	const rec = new Recorder()
	const order = new Map(model.edges.map((e, i) => [e.id, i]))
	const sorted = [...model.edges].sort((a, b) => weight(a.id) - weight(b.id) || order.get(a.id)! - order.get(b.id)!)
	const ids = model.nodes.map((n) => n.id)
	const index = new Map(ids.map((id, i) => [id, i]))
	let forest = singletons(ids.length)
	const sets = (flash: Record<string, MarkColor> = {}): FrameSets => ({
		parent: Object.fromEntries(ids.map((id, i) => [id, ids[forest.parent[i]]])),
		sizes: Object.fromEntries(ids.map((id, i) => [id, forest.sizes[i]])),
		flash,
	})
	// A find's way up on the union-find: the nodes and parent pointers passed orange, the root in `root`.
	const way = (path: number[], root: MarkColor) => ({
		...Object.fromEntries(path.slice(0, -1).flatMap((i) => [[ids[i], LOOKING], [`edge:${ids[i]}`, LOOKING]])),
		[ids[path[path.length - 1]]]: root,
	})
	const chosen: string[] = []
	let total = 0
	const remaining = (from: number) => {
		const items = sorted.slice(from).map((e) => `${name(e.from)}–${name(e.to)}${options.weighted ? ` ${weight(e.id)}` : ''}`)
		return [{ title: 'edges, cheapest first', items: items.length > 10 ? [...items.slice(0, 10), '…'] : items }]
	}
	const needed = model.nodes.length - 1
	rec.add({
		strips: remaining(0),
		counts: { weight: total },
		sets: sets(),
		caption: `${note}Take the edges from cheapest to dearest, skipping any that would close a cycle. A union-find keeps the trees: every node starts on its own`,
	})
	for (const [i, e] of sorted.entries()) {
		if (chosen.length === needed) break
		const [pu, pv] = [findPath(forest.parent, index.get(e.from)!), findPath(forest.parent, index.get(e.to)!)]
		const [ru, rv] = [pu[pu.length - 1], pv[pv.length - 1]]
		const finds = `find(${name(e.from)}) = ${name(ids[ru])}, find(${name(e.to)}) = ${name(ids[rv])}`
		const ask = 'Take it or skip it?'
		if (ru === rv) {
			rec.look(
				e.id,
				{
					strips: remaining(i + 1),
					sets: sets({ ...way(pu, REJECTED), ...way(pv, REJECTED) }),
					caption: `${edgeName(e.id)}: ${finds}, one tree already, so it would close a cycle: skip it`,
					ask,
				},
				REJECTED
			)
			continue
		}
		const link = union(forest, ru, rv, 'size')
		forest = link.forest
		chosen.push(e.id)
		total += weight(e.id)
		rec.add({
			flash: { [edgeCellKey(e.id)]: CHOSEN, [e.from]: DONE, [e.to]: DONE },
			strips: remaining(i + 1),
			counts: { weight: total },
			// The ways up as they were, then the link the union made and the root it went under.
			sets: sets({ ...way(pu, LOOKING), ...way(pv, LOOKING), [`edge:${ids[link.child!]}`]: CHOSEN, [ids[link.root!]]: CHOSEN }),
			caption: `${edgeName(e.id)}: ${finds}, two trees, so take it: union puts ${name(ids[link.child!])}'s tree under ${name(ids[link.root!])}`,
			ask,
		})
	}
	rec.add({
		strips: remaining(sorted.length),
		sets: sets(),
		caption:
			chosen.length === needed
				? `${needed} edges for ${model.nodes.length} nodes: a minimum spanning tree, total weight ${total}`
				: `No edges left and the graph isn't connected: a minimum spanning forest, total weight ${total}`,
	})
	return { frames: rec.frames, chosen }
}

/** Pieces take the mark colours in turn (and a numbered badge each, as there may be more than four). */
const PIECE_COLOURS: MarkColor[] = ['blue', 'green', 'orange', 'red']

/**
 * Connected components: take the nodes in label order; one that isn't in a piece yet starts a new
 * piece (counted), and a breadth-first search from it finds the rest of that piece, each node joining
 * as an edge reaches it. Edges count both ways (a directed graph's are taken as undirected). Pieces
 * take colours in turn and every node a badge with its piece's number.
 */
export function components(model: GraphModel, options: AlgorithmOptions): GraphRun {
	const { name, byLabel } = helpers(model, { ...options, directed: false })
	const adjacent = neighbours(model, false)
	const rec = new Recorder()
	const piece = new Map<string, number>()
	const pieces: string[][] = []
	const order = model.nodes.map((n) => n.id).sort(byLabel)
	const queue: string[] = []
	const strips = () => [
		{ title: 'queue (front on the left)', items: queue.map(name) },
		{ title: 'pieces', items: pieces.map((p, i) => `${i + 1}: ${p.map(name).join(' ')}`) },
	]
	const both = options.directed ? ' (edges count both ways)' : ''
	rec.add({
		strips: strips(),
		counts: { components: 0 },
		caption: `Count the pieces${both}: take the nodes in order; one in no piece yet starts a new piece, and a search from it finds the rest`,
	})
	for (const start of order) {
		if (piece.has(start)) {
			rec.add({ caption: `${name(start)} is in piece ${piece.get(start)} already: next`, ask: `Is ${name(start)} in a piece yet?`, askFocus: [start] })
			continue
		}
		const k = pieces.length + 1
		const colour = PIECE_COLOURS[(k - 1) % PIECE_COLOURS.length]
		piece.set(start, k)
		pieces.push([start])
		queue.push(start)
		rec.add({
			flash: { [start]: colour },
			badges: { [start]: String(k) },
			strips: strips(),
			counts: { components: k },
			caption: `${name(start)} is in no piece yet: start piece ${k} there and search from it`,
			ask: `Is ${name(start)} in a piece yet?`,
			askFocus: [start],
		})
		while (queue.length) {
			const u = queue.shift()!
			for (const { node: v, edge } of adjacent.get(u) ?? []) {
				if (piece.has(v)) continue
				piece.set(v, k)
				pieces[k - 1].push(v)
				queue.push(v)
				rec.add({
					flash: { [v]: colour, [edgeCellKey(edge)]: colour },
					badges: { [v]: String(k) },
					strips: strips(),
					caption: `${name(u)}–${name(v)}: ${name(v)} joins piece ${k}`,
				})
			}
		}
		rec.add({ strips: strips(), caption: `The queue is empty: piece ${k} is ${pieces[k - 1].map(name).join(', ')}`, ask: false })
	}
	const n = pieces.length
	rec.add({
		strips: strips(),
		caption: n === 1 ? 'Every node is in one piece: the graph is connected (1 component)' : `Every node is in a piece: ${n} components`,
		ask: false,
	})
	return { frames: rec.frames, chosen: [], pieces }
}

/**
 * Topological sort (Kahn): count each node's incoming edges (badges); nodes with none can go next,
 * so they wait in a queue; taking one removes it and its out-edges (they fade), which may free
 * more. If the queue empties with nodes left, they lie on a cycle and there is no order.
 */
export function topologicalSort(model: GraphModel): GraphRun {
	const { name, byLabel } = helpers(model, { directed: true, weighted: false })
	const adjacent = neighbours(model, true)
	const rec = new Recorder()
	const indegree = new Map(model.nodes.map((n) => [n.id, 0]))
	for (const e of model.edges) indegree.set(e.to, indegree.get(e.to)! + 1)
	const queue = model.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id).sort(byLabel)
	const order: string[] = []
	const removed: string[] = []
	const strips = () => [
		{ title: 'queue (no incoming edges)', items: queue.map(name) },
		{ title: 'order', items: order.map(name) },
	]
	rec.add({
		badges: Object.fromEntries(model.nodes.map((n) => [n.id, String(indegree.get(n.id))])),
		caption: "Count each node's incoming edges (the badges)",
	})
	rec.add({
		flash: Object.fromEntries(queue.map((id) => [id, WAITING])),
		strips: strips(),
		caption: queue.length
			? `${queue.map(name).join(', ')} ${queue.length === 1 ? 'has' : 'have'} none, so ${queue.length === 1 ? 'it can' : 'they can'} come first: queue ${queue.length === 1 ? 'it' : 'them'}`
			: 'Every node has an incoming edge: there is a cycle, so no node can come first',
	})
	while (queue.length) {
		const u = queue.shift()!
		order.push(u)
		rec.add({
			flash: { [u]: CURRENT },
			dim: [...removed],
			strips: strips(),
			caption: `Dequeue ${name(u)}: it comes next in the order (${order.length})`,
		})
		for (const { node: v, edge } of adjacent.get(u) ?? []) {
			const left = indegree.get(v)! - 1
			indegree.set(v, left)
			removed.push(edgeCellKey(edge))
			if (left === 0) queue.push(v)
			rec.add({
				flash: left === 0 ? { [v]: WAITING } : {},
				badges: { [v]: String(left) },
				dim: [...removed],
				strips: strips(),
				caption:
					left === 0
						? `Remove ${name(u)}→${name(v)}: ${name(v)} has no incoming edges left, so queue it`
						: `Remove ${name(u)}→${name(v)}: ${name(v)} still has ${left} incoming`,
			})
		}
		removed.push(u)
		rec.add({ flash: { [u]: DONE }, dim: [...removed], strips: strips(), caption: `${name(u)} is placed, with its edges gone` })
	}
	if (order.length < model.nodes.length) {
		const stuck = model.nodes.filter((n) => !order.includes(n.id)).map((n) => n.id)
		rec.add({
			flash: Object.fromEntries(stuck.map((id) => [id, REJECTED])),
			dim: [...removed],
			strips: strips(),
			caption: `The queue is empty, but ${stuck.map(name).join(', ')} still ${stuck.length === 1 ? 'has' : 'have'} incoming edges: ${stuck.length === 1 ? 'it lies' : 'they lie'} on a cycle, so there is no topological order`,
		})
	} else {
		rec.add({
			badges: Object.fromEntries(order.map((id, i) => [id, String(i + 1)])),
			dim: [],
			strips: strips(),
			caption: `Every node is placed: ${order.map(name).join(', ')}. Every edge points forward in this order`,
		})
	}
	return { frames: rec.frames, chosen: [], order }
}
