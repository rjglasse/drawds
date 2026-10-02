import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { Frame } from '../../nodelink/playback'
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
class Recorder {
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

	/** A frame that only looks at an edge. */
	look(edge: string, frame: Frame) {
		const key = edgeCellKey(edge)
		const before = this.colours.get(key) ?? null
		this.add({ ...frame, flash: { ...frame.flash, [key]: LOOKING } })
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
	const strips = () => [
		{ title: 'queue (front on the left)', items: queue.map(name) },
		{ title: 'visit order', items: order.map(name) },
	]
	const link = directed ? '→' : '–'

	rec.add({
		flash: { [start]: WAITING },
		badges: { [start]: '1' },
		strips: strips(),
		caption: `Start at ${name(start)}: discover it (1) and queue it`,
	})
	let previous: string | undefined
	while (queue.length) {
		const u = queue.shift()!
		rec.add({
			flash: { [u]: CURRENT, ...(previous ? { [previous]: DONE } : {}) },
			strips: strips(),
			caption: `Dequeue ${name(u)} and look at its ${directed ? 'out-' : ''}edges`,
		})
		for (const { node: v, edge } of adjacent.get(u) ?? []) {
			if (order.includes(v)) {
				rec.look(edge, { caption: `${name(u)}${link}${name(v)}: ${name(v)} was already discovered` })
				continue
			}
			order.push(v)
			treeEdges.push(edge)
			queue.push(v)
			rec.add({
				flash: { [v]: WAITING, [edgeCellKey(edge)]: TREE },
				badges: { [v]: String(order.length) },
				strips: strips(),
				caption: `${name(u)}${link}${name(v)}: ${name(v)} is new: discover it (${order.length}) and queue it`,
			})
		}
		previous = u
	}
	rec.add({
		flash: previous ? { [previous]: DONE } : {},
		strips: strips(),
		caption: `Queue empty: done, ${ending(order.length, model.nodes.length)}`,
	})
	return { frames: rec.frames, order, treeEdges }
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
	const strips = () => [
		{ title: 'call stack (top on the right)', items: stack.map(name) },
		{ title: 'visit order', items: order.map(name) },
	]
	const link = directed ? '→' : '–'

	const visit = (u: string, via?: { from: string; edge: string }) => {
		order.push(u)
		stack.push(u)
		if (via) treeEdges.push(via.edge)
		rec.add({
			flash: { [u]: CURRENT, ...(via ? { [via.from]: WAITING, [edgeCellKey(via.edge)]: TREE } : {}) },
			badges: { [u]: String(order.length) },
			strips: strips(),
			caption: via
				? `${name(via.from)}${link}${name(u)}: ${name(u)} is new: go deeper and visit it (${order.length})`
				: `Visit ${name(start)} (1)`,
		})
		for (const { node: v, edge } of adjacent.get(u) ?? []) {
			if (order.includes(v)) {
				rec.look(edge, { caption: `${name(u)}${link}${name(v)}: ${name(v)} was already visited` })
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
		})
	}
	visit(start)
	return { frames: rec.frames, order, treeEdges }
}
