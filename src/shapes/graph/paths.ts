import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { Frame } from '../../nodelink/playback'
import { edgeCellKey } from '../../nodelink/scene'
import type { Pointer } from '../../pointers/pointers'
import type { GraphModel } from './model'
import { neighbours, Recorder, visitedStrip } from './traverse'

// Lecture 9's questions about paths, step by step, in the traversals' colours (the vertex being worked
// on red, waiting ones orange, finished ones blue, tree edges green). A path from s to t: breadth-first
// search, which reaches vertices in order of how many edges away they are, so the first path found has
// the fewest edges; each vertex remembers its parent, and the path is walked back from t. Is there a
// cycle? (lecture 9's Task 18): depth-first search, which finds one as an edge back to a vertex still
// on the call stack: undirected, a visited neighbour that isn't the parent; directed, a neighbour on
// the stack (one that is done is no cycle).

const CURRENT: MarkColor = 'red'
const WAITING: MarkColor = 'orange'
const DONE: MarkColor = 'blue'
const TREE: MarkColor = 'green'
const CYCLE: MarkColor = 'red'

export interface PathRun {
	frames: Frame[]
	/** The path's vertices from s to t, or undefined if t can't be reached. */
	path?: string[]
	code: string
}

const pointer = (name: string, at: string): Pointer => ({ id: `#${name}`, name, at })

/** parent[] beside visited[]: each vertex's parent in the search, '–' for none yet (or the start). */
function parentStrip(model: GraphModel, parent: ReadonlyMap<string, string>, name: (id: string) => string) {
	const strip = visitedStrip(model, [])
	const byLabel = model.nodes.map((n) => n.id).sort((a, b) => compareKeys(name(a), name(b)) || a.localeCompare(b))
	return { ...strip, title: 'parent[]', items: byLabel.map((v) => (parent.has(v) ? name(parent.get(v)!) : '–')) }
}

/**
 * A path from `s` to `t` with the fewest edges: BFS from s, each vertex discovered noting its parent
 * (and its distance, a badge), until t is discovered; then x walks back from t along the parents,
 * lighting the path. If the queue empties first, t can't be reached from s.
 */
export function shortestPath(model: GraphModel, s: string, t: string, directed: boolean): PathRun {
	const label = new Map(model.nodes.map((n) => [n.id, n.value]))
	const name = (id: string) => label.get(id) ?? id
	const adjacent = neighbours(model, directed)
	const rec = new Recorder()
	const link = directed ? '→' : '–'
	const code = 'graph-path'
	const visited = [s]
	const parent = new Map<string, string>()
	const via = new Map<string, string>()
	const dist = new Map([[s, 0]])
	const queue = [s]
	const ends = [pointer('s', s), pointer('t', t)]
	const strips = () => [{ title: 'queue (front on the left)', items: queue.map(name) }, visitedStrip(model, visited), parentStrip(model, parent, name)]
	const vars = { s: name(s), t: name(t) }
	if (s === t) {
		rec.add({ pointers: ends, flash: { [s]: TREE }, caption: `From ${name(s)} to itself: the path is just ${name(s)}, no edges`, vars })
		return { frames: rec.frames, path: [s], code }
	}
	rec.add({
		flash: { [s]: WAITING },
		badges: { [s]: '0' },
		pointers: ends,
		strips: strips(),
		caption: `A path from ${name(s)} to ${name(t)} with the fewest edges: breadth-first search from ${name(s)}, each vertex noting its parent. Queue ${name(s)}, 0 edges away`,
		line: 'start',
		vars,
	})
	let previous: string | undefined
	let found = false
	while (queue.length && !found) {
		const v = queue.shift()!
		rec.add({
			flash: { [v]: CURRENT, ...(previous ? { [previous]: DONE } : {}) },
			pointers: ends,
			strips: strips(),
			caption: `Dequeue ${name(v)} (${dist.get(v)} edge${dist.get(v) === 1 ? '' : 's'} from ${name(s)}) and look at its ${directed ? 'out-' : ''}edges`,
			ask: 'Which vertex comes off the queue next?',
			line: 'dequeue',
			vars: { ...vars, v: name(v) },
		})
		for (const { node: w, edge } of adjacent.get(v) ?? []) {
			const ask = { ask: `${name(v)}${link}${name(w)}: is ${name(w)} new?`, askFocus: [edgeCellKey(edge)] }
			const at = { ...vars, v: name(v), w: name(w) }
			if (visited.includes(w)) {
				rec.look(edge, { pointers: ends, caption: `${name(v)}${link}${name(w)}: visited[${name(w)}] is already true`, ...ask, line: 'check', vars: at })
				continue
			}
			visited.push(w)
			parent.set(w, v)
			via.set(w, edge)
			dist.set(w, dist.get(v)! + 1)
			found = w === t
			if (!found) queue.push(w)
			const d = dist.get(w)!
			rec.add({
				flash: { [w]: WAITING, [edgeCellKey(edge)]: TREE },
				badges: { [w]: String(d) },
				pointers: ends,
				strips: strips(),
				caption: found
					? `${name(v)}${link}${name(w)}: that is ${name(t)}, reached ${d} edge${d === 1 ? '' : 's'} from ${name(s)}: parent[${name(t)}] = ${name(v)}. Now walk back`
					: `${name(v)}${link}${name(w)}: ${name(w)} is new: visited, parent[${name(w)}] = ${name(v)}, ${d} edge${d === 1 ? '' : 's'} away; queue it`,
				...ask,
				line: found ? 'found' : 'mark',
				vars: at,
			})
			if (found) break
		}
		previous = v
	}
	if (!found) {
		rec.add({
			flash: previous ? { [previous]: DONE } : {},
			pointers: ends,
			strips: strips(),
			caption: `Queue empty and ${name(t)} never reached: there is no path from ${name(s)} to ${name(t)}${directed ? ' (edges only go one way)' : ''}`,
			ask: 'The queue is empty: what does that tell us?',
			line: 'none',
			vars,
		})
		return { frames: rec.frames, code }
	}
	// The search's tree fades back; the path lights up as x walks back from t along the parents.
	const path = [t]
	while (path[0] !== s) path.unshift(parent.get(path[0])!)
	const fade = Object.fromEntries([...via.values()].map((e) => [edgeCellKey(e), null]))
	rec.add({
		flash: { ...fade, ...Object.fromEntries(visited.map((v) => [v, DONE])), [t]: TREE },
		pointers: [...ends, pointer('x', t)],
		strips: strips(),
		caption: `x = ${name(t)}: walk back along the parents to ${name(s)}`,
		ask: false,
		line: 'walk',
		vars: { ...vars, x: name(t) },
	})
	for (let k = path.length - 1; k > 0; k--) {
		const [x, p] = [path[k], path[k - 1]]
		rec.add({
			flash: { [p]: TREE, [edgeCellKey(via.get(x)!)]: TREE },
			pointers: [...ends, pointer('x', p)],
			strips: strips(),
			caption: `parent[${name(x)}] = ${name(p)}, so x = ${name(p)}${p === s ? `: back at ${name(s)}` : ''}`,
			ask: `x = ${name(x)}: where does x go next?`,
			askFocus: [x],
			line: 'walk',
			vars: { ...vars, x: name(p) },
		})
	}
	const edges = path.length - 1
	rec.add({
		pointers: ends,
		strips: strips(),
		caption: `The path ${path.map(name).join(link)}: ${edges} edge${edges === 1 ? '' : 's'}, the fewest there are, as BFS reaches every vertex ${edges - 1 > 0 ? `${edges - 1} edges away` : 'nearer'} before any ${edges} away`,
		ask: false,
		line: 'done',
		vars,
	})
	return { frames: rec.frames, path, code }
}

export interface CycleRun {
	frames: Frame[]
	/** The cycle found, its vertices in order (the first one again closes it), or undefined. */
	cycle?: string[]
	code: string
}

/**
 * Is there a cycle? Depth-first search from each vertex not visited yet, the call stack a strip. An
 * edge back to a vertex still on the stack closes a cycle (that vertex, down the stack to here, and
 * back): undirected, any visited neighbour but the parent (the edge just come along) is one;
 * directed, a visited neighbour off the stack is done, and no cycle runs through it.
 */
export function findCycle(model: GraphModel, directed: boolean): CycleRun {
	const label = new Map(model.nodes.map((n) => [n.id, n.value]))
	const name = (id: string) => label.get(id) ?? id
	const adjacent = neighbours(model, directed)
	const rec = new Recorder()
	const link = directed ? '→' : '–'
	const code = directed ? 'graph-cycle-directed' : 'graph-cycle'
	const visited = new Set<string>()
	const stack: string[] = []
	const stackEdges: string[] = []
	const order = model.nodes.map((n) => n.id).sort((a, b) => compareKeys(name(a), name(b)) || a.localeCompare(b))
	const strips = () => [{ title: 'call stack (top on the right)', items: stack.map(name) }, visitedStrip(model, visited)]
	// The loop's vertex, where each search starts: s.
	const loop = (v: string): Pointer[] => [pointer('s', v)]
	rec.add({
		strips: strips(),
		caption: directed
			? 'Is there a cycle? Depth-first search from every vertex not visited yet: an edge to a vertex still on the call stack leads back round, a cycle'
			: "Is there a cycle? Depth-first search from every vertex not visited yet: a visited neighbour that isn't the parent (the edge just come along) closes a cycle",
	})
	let cycle: string[] | undefined
	const dfs = (v: string, u: string, from?: { node: string; edge: string }): boolean => {
		visited.add(u)
		stack.push(u)
		if (from) stackEdges.push(from.edge)
		rec.add({
			pointers: loop(v),
			flash: { [u]: CURRENT, ...(from ? { [from.node]: WAITING, [edgeCellKey(from.edge)]: TREE } : {}) },
			strips: strips(),
			caption: from ? `${name(from.node)}${link}${name(u)}: ${name(u)} is new: dfs(${name(u)}) marks it visited` : `dfs(${name(u)}) marks ${name(u)} visited`,
			line: 'mark',
			vars: { s: name(v), v: name(u), ...(directed || !from ? {} : { parent: name(from.node) }) },
		})
		for (const { node: w, edge } of adjacent.get(u) ?? []) {
			const at = { s: name(v), v: name(u), w: name(w), ...(directed || !from ? {} : { parent: name(from.node) }) }
			const ask = {
				ask: directed ? `${name(u)}${link}${name(w)}: new, done, or still on the stack?` : `${name(u)}${link}${name(w)}: new, the parent, or visited?`,
				askFocus: [edgeCellKey(edge)],
			}
			if (!directed && from && w === from.node && edge === from.edge) {
				rec.look(edge, { pointers: loop(v), strips: strips(), caption: `${name(u)}${link}${name(w)}: ${name(w)} is ${name(u)}'s parent, the edge just come along: no cycle there`, ...ask, line: 'parent', vars: at })
				continue
			}
			const back = stack.indexOf(w)
			if (back >= 0 || (!directed && visited.has(w))) {
				// Back round: w, down the stack to u, then this edge.
				cycle = [...stack.slice(back), w]
				const edges = [...stackEdges.slice(back), edge]
				rec.add({
					pointers: loop(v),
					flash: Object.fromEntries([...cycle.map((n) => [n, CYCLE]), ...edges.map((e) => [edgeCellKey(e), CYCLE])]),
					strips: strips(),
					caption: directed
						? `${name(u)}${link}${name(w)}: ${name(w)} is still on the call stack, so this edge leads back to it: a cycle, ${cycle.map(name).join(link)}`
						: `${name(u)}${link}${name(w)}: ${name(w)} is visited and isn't ${name(u)}'s parent: a cycle, ${cycle.map(name).join(link)}`,
					...ask,
					line: 'cycle',
					vars: at,
				})
				return true
			}
			if (visited.has(w)) {
				rec.look(edge, { pointers: loop(v), strips: strips(), caption: `${name(u)}${link}${name(w)}: ${name(w)} is visited but done, off the stack: no way back round from it to ${name(u)}`, ...ask, line: 'done', vars: at })
				continue
			}
			if (dfs(v, w, { node: u, edge })) return true
		}
		stack.pop()
		if (from) stackEdges.pop()
		const back = stack[stack.length - 1]
		rec.add({
			pointers: loop(v),
			flash: { [u]: DONE, ...(back ? { [back]: CURRENT } : {}) },
			strips: strips(),
			caption: `${name(u)}: every edge tried, no cycle through it${back ? `: back to ${name(back)}` : ''}`,
			ask: `Every edge from ${name(u)} tried: where does the search go now?`,
			askFocus: [u],
			line: 'none-here',
			vars: { s: name(v), v: name(u) },
		})
		return false
	}
	for (const v of order) {
		if (visited.has(v)) continue
		rec.add({ pointers: loop(v), strips: strips(), caption: `s = ${name(v)} isn't visited yet: dfs(${name(v)})`, ask: false, line: 'search', vars: { s: name(v) } })
		if (dfs(v, v)) break
	}
	if (cycle) {
		const edges = cycle.length - 1
		rec.add({
			pointers: [],
			strips: strips(),
			caption: `Yes: ${cycle.map(name).join(link)}, a cycle of ${edges} edge${edges === 1 ? '' : 's'}${directed ? ', so there is no topological order' : ''}`,
			ask: false,
			line: 'yes',
		})
		return { frames: rec.frames, cycle, code }
	}
	rec.add({
		pointers: [],
		strips: strips(),
		caption: directed
			? 'Every vertex visited and no edge led back to the call stack: no cycle. The graph is a DAG, so it has a topological order'
			: "Every vertex visited and no visited neighbour but a parent: no cycle. The graph is a forest (a tree if it's connected)",
		ask: false,
		line: 'no',
	})
	return { frames: rec.frames, code }
}
