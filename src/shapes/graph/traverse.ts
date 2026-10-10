import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { Frame, Strip } from '../../nodelink/playback'
import { edgeCellKey } from '../../nodelink/scene'
import type { GraphModel } from './model'

// Colours of a traversal, after the mark meanings: the node being worked on is red, discovered
// nodes still waiting (in the queue, or on the stack) orange, finished nodes blue (visited), tree
// edges green. An edge being looked at flashes orange.
const CURRENT: MarkColor = 'red'
const WAITING: MarkColor = 'orange'
const DONE: MarkColor = 'blue'
const TREE: MarkColor = 'green'
const LOOKING: MarkColor = 'orange'

export interface Traversal {
	frames: Frame[]
	/** Nodes in the order they were discovered. */
	order: string[]
	/** The edges that discovered a node: the BFS / DFS tree. */
	treeEdges: string[]
	/** Its code beside the graph (`src/shapes/graph/code.ts`). */
	code: string
}

/**
 * Lecture 9's visited[]: an array of booleans indexed by vertex, all false to begin with, flipped to
 * true as a search marks each vertex (on entry for DFS, when queued for BFS). Vertices in label order.
 */
export function visitedStrip(model: GraphModel, seen: ReadonlySet<string> | readonly string[]): Strip {
	const label = new Map(model.nodes.map((n) => [n.id, n.value]))
	const has = (id: string) => (Array.isArray(seen) ? seen.includes(id) : (seen as ReadonlySet<string>).has(id))
	const vertices = model.nodes.map((n) => n.id).sort((a, b) => compareKeys(label.get(a) ?? '', label.get(b) ?? '') || a.localeCompare(b))
	return { title: 'visited[]', items: vertices.map((v) => (has(v) ? 'T' : 'F')), labels: vertices.map((v) => label.get(v) ?? v) }
}

/**
 * Each node's neighbours with the edge that leads there, in label order (as textbooks do): every
 * edge either way when undirected, out-edges only when directed.
 */
export function neighbours({ nodes, edges }: GraphModel, directed: boolean) {
	const label = new Map(nodes.map((n) => [n.id, n.value]))
	const out = new Map(nodes.map((n) => [n.id, [] as { node: string; edge: string }[]]))
	for (const e of edges) {
		out.get(e.from)?.push({ node: e.to, edge: e.id })
		if (!directed && e.from !== e.to) out.get(e.to)?.push({ node: e.from, edge: e.id })
	}
	for (const list of out.values()) {
		list.sort((a, b) => compareKeys(label.get(a.node) ?? '', label.get(b.node) ?? '') || a.node.localeCompare(b.node))
	}
	return out
}

/**
 * Collects frames. An edge that is only looked at flashes for its own step, then goes back to the
 * colour it had (a tree edge stays green).
 */
export class Recorder {
	frames: Frame[] = []
	private colours = new Map<string, MarkColor>()
	private restore: Record<string, MarkColor | null> = {}

	add(frame: Frame) {
		const flash = { ...this.restore, ...frame.flash }
		this.restore = {}
		for (const [key, color] of Object.entries(flash)) {
			if (color) this.colours.set(key, color)
			else this.colours.delete(key)
		}
		this.frames.push({ ...frame, flash })
	}

	/** A frame that only looks at an edge (orange, or another colour: red for one that is rejected). */
	look(edge: string, frame: Frame, color: MarkColor = LOOKING) {
		const key = edgeCellKey(edge)
		const before = this.colours.get(key) ?? null
		this.add({ ...frame, flash: { ...frame.flash, [key]: color } })
		this.restore = { [key]: before }
	}
}

const ending = (reached: number, total: number) =>
	reached === total ? `all ${total} nodes reached` : `${reached} of ${total} nodes reached; the rest can't be reached from the start`

/**
 * Breadth-first search from `start`: take the node at the front of the queue, look at each of its
 * edges in turn, and discover (number, queue) every neighbour not seen before.
 */
export function bfs(model: GraphModel, start: string, directed: boolean): Traversal {
	const label = new Map(model.nodes.map((n) => [n.id, n.value]))
	const name = (id: string) => label.get(id) ?? id
	const adjacent = neighbours(model, directed)
	const rec = new Recorder()
	const order = [start]
	const treeEdges: string[] = []
	const queue = [start]
	// The queue, where to go next; visited[], where it has been (marked as each vertex is queued).
	const strips = () => [{ title: 'queue (front on the left)', items: queue.map(name) }, visitedStrip(model, order)]
	const link = directed ? '→' : '–'

	rec.add({
		flash: { [start]: WAITING },
		badges: { [start]: '1' },
		strips: strips(),
		caption: `Start at ${name(start)}: queue it and mark it visited (1)`,
		line: 'start',
		vars: { s: name(start) },
	})
	let previous: string | undefined
	while (queue.length) {
		const u = queue.shift()!
		rec.add({
			flash: { [u]: CURRENT, ...(previous ? { [previous]: DONE } : {}) },
			strips: strips(),
			caption: `Dequeue ${name(u)} and look at its ${directed ? 'out-' : ''}edges`,
			ask: 'Which node comes off the queue next?',
			line: 'dequeue',
			vars: { v: name(u) },
		})
		for (const { node: v, edge } of adjacent.get(u) ?? []) {
			// The same question whatever the answer: is the node at the far end of this edge new?
			const ask = { ask: `${name(u)}${link}${name(v)}: is ${name(v)} new?`, askFocus: [edgeCellKey(edge)] }
			const vars = { v: name(u), w: name(v) }
			if (order.includes(v)) {
				rec.look(edge, { caption: `${name(u)}${link}${name(v)}: visited[${name(v)}] is already true`, ...ask, line: 'check', vars })
				continue
			}
			order.push(v)
			treeEdges.push(edge)
			queue.push(v)
			rec.add({
				flash: { [v]: WAITING, [edgeCellKey(edge)]: TREE },
				badges: { [v]: String(order.length) },
				strips: strips(),
				caption: `${name(u)}${link}${name(v)}: ${name(v)} is new: mark it visited (${order.length}) and queue it`,
				...ask,
				line: 'mark',
				vars,
			})
		}
		previous = u
	}
	rec.add({
		flash: previous ? { [previous]: DONE } : {},
		strips: strips(),
		caption: `Queue empty: done, ${ending(order.length, model.nodes.length)}. Level by level: no vertex is fewer edges from the start than one before it`,
	})
	return { frames: rec.frames, order, treeEdges, code: 'graph-bfs' }
}

/**
 * Depth-first search from `start`, recursively: visit a node, then for each of its edges in turn go
 * deeper into any neighbour not visited yet; when all its edges are done, back up to the node it
 * came from. The strip is the recursion stack.
 */
export function dfs(model: GraphModel, start: string, directed: boolean): Traversal {
	const label = new Map(model.nodes.map((n) => [n.id, n.value]))
	const name = (id: string) => label.get(id) ?? id
	const adjacent = neighbours(model, directed)
	const rec = new Recorder()
	const order: string[] = []
	const treeEdges: string[] = []
	const stack: string[] = []
	// The call stack, where it has come from; visited[], where it has been (marked on entry).
	const strips = () => [{ title: 'call stack (top on the right)', items: stack.map(name) }, visitedStrip(model, order)]
	const link = directed ? '→' : '–'

	const isNew = (u: string, v: string, edge: string) => ({ ask: `${name(u)}${link}${name(v)}: is ${name(v)} new?`, askFocus: [edgeCellKey(edge)] })
	const visit = (u: string, via?: { from: string; edge: string }) => {
		order.push(u)
		stack.push(u)
		if (via) treeEdges.push(via.edge)
		rec.add({
			flash: { [u]: CURRENT, ...(via ? { [via.from]: WAITING, [edgeCellKey(via.edge)]: TREE } : {}) },
			badges: { [u]: String(order.length) },
			strips: strips(),
			caption: via
				? `${name(via.from)}${link}${name(u)}: ${name(u)} is new: dfs(${name(u)}) goes deeper, marking it visited (${order.length})`
				: `dfs(${name(start)}): mark it visited (1)`,
			...(via && isNew(via.from, u, via.edge)),
			line: 'mark',
			vars: { v: name(u) },
		})
		for (const { node: v, edge } of adjacent.get(u) ?? []) {
			if (order.includes(v)) {
				rec.look(edge, {
					caption: `${name(u)}${link}${name(v)}: visited[${name(v)}] is true already`,
					...isNew(u, v, edge),
					line: 'check',
					vars: { v: name(u), w: name(v) },
				})
				continue
			}
			visit(v, { from: u, edge })
		}
		stack.pop()
		const back = stack[stack.length - 1]
		rec.add({
			flash: { [u]: DONE, ...(back ? { [back]: CURRENT } : {}) },
			strips: strips(),
			caption: back
				? `${name(u)} has no unvisited neighbours left: back to ${name(back)}`
				: `${name(u)} is done: finished, ${ending(order.length, model.nodes.length)}`,
			ask: `Every edge from ${name(u)} tried: where does DFS go now?`,
			askFocus: [u],
			line: 'loop',
			vars: { v: name(u) },
		})
	}
	visit(start)
	return { frames: rec.frames, order, treeEdges, code: 'graph-dfs' }
}
