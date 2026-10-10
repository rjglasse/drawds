import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import { components, dijkstra, kruskal, prim, topologicalSort } from './algorithms'
import type { GraphModel } from './model'

const node = (id: string, value: string) => ({ id, value, x: 0, y: 0 })
const edge = (id: string, from: string, to: string, weight: number) => ({ id, from, to, weight: String(weight) })

//   A --4-- B --5-- D --3-- E
//    \     /       /
//     1   2       8
//      \ /       /
//       C -------
const graph: GraphModel = {
	nodes: [node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D'), node('e', 'E')],
	edges: [edge('ab', 'a', 'b', 4), edge('ac', 'a', 'c', 1), edge('cb', 'c', 'b', 2), edge('bd', 'b', 'd', 5), edge('cd', 'c', 'd', 8), edge('de', 'd', 'e', 3)],
}
const weighted = { directed: false, weighted: true }
const last = (frames: { caption?: string }[]) => frames[frames.length - 1].caption

describe('dijkstra', () => {
	it('finds the shortest distances, the best edges green', () => {
		const run = dijkstra(graph, 'a', weighted)
		expect(Object.fromEntries(run.dist!)).toEqual({ a: 0, b: 3, c: 1, d: 8, e: 11 })
		expect(run.chosen.sort()).toEqual(['ac', 'bd', 'cb', 'de'])
		const end = stateAt(run.frames, run.frames.length - 1)
		// A to B first went straight (4), then via C (3): only the better edge stays green.
		expect(end.flash['edge:ab']).toBeUndefined()
		expect(end.flash['edge:cb']).toBe('green')
		expect(end.badges).toEqual({ a: '0', b: '3', c: '1', d: '8', e: '11' })
		expect(last(run.frames)).toBe('Every node is finished: the green edges are the shortest paths from A')
	})

	it('narrates each relaxation and keeps a priority queue', () => {
		const { frames } = dijkstra(graph, 'a', weighted)
		expect(frames[0].caption).toBe('dist(A) = 0, every other node ∞')
		expect(frames[0].badges).toEqual({ a: '0', b: '∞', c: '∞', d: '∞', e: '∞' })
		expect(frames.map((f) => f.caption)).toContain('C–B (2): 1 + 2 = 3 < 4, so dist(B) = 3, via C')
		// D first gets 9 via C, then 8 via B: its green edge moves from C–D to B–D.
		expect(frames.map((f) => f.caption)).toContain('B–D (5): 3 + 5 = 8 < 9, so dist(D) = 8, via B')
		expect(frames[0].strips?.[0].items).toEqual(['A:0'])
		expect(stateAt(frames, frames.length - 1).counts).toEqual({ updates: 6 })
	})

	it('counts every edge as 1 on an unweighted graph, and reports unreachable nodes', () => {
		const run = dijkstra({ ...graph, nodes: [...graph.nodes, node('z', 'Z')] }, 'a', { directed: false, weighted: false })
		expect(run.dist!.get('d')).toBe(2)
		expect(run.frames[0].caption).toMatch(/^The graph is unweighted, so every edge counts 1\./)
		expect(last(run.frames)).toMatch(/^Nothing left to take: 1 node can't be reached/)
	})
})

describe('minimum spanning trees', () => {
	it('prim grows the tree by the cheapest edge leaving it', () => {
		const run = prim(graph, 'a', weighted)
		expect(run.chosen).toEqual(['ac', 'cb', 'bd', 'de'])
		expect(last(run.frames)).toBe('Every node is in the tree: a minimum spanning tree, total weight 11')
		expect(run.frames[1].caption).toBe('2 edges leave the tree; the cheapest is A–C (1)')
	})

	it('kruskal takes edges cheapest first, skipping those that close a cycle', () => {
		const run = kruskal(graph, weighted)
		expect(run.chosen).toEqual(['ac', 'cb', 'de', 'bd'])
		expect(run.frames.map((f) => f.caption)).toContain('A–B (4): find(A) = C, find(B) = C, one tree already, so it would close a cycle: skip it')
		expect(last(run.frames)).toBe('4 edges for 5 nodes: a minimum spanning tree, total weight 11')
	})

	it('kruskal keeps its trees in a union-find (by size), carried by every frame', () => {
		const run = kruskal(graph, weighted)
		expect(run.frames.every((f) => f.sets)).toBe(true)
		expect(run.frames[0].sets!.parent).toEqual({ a: 'a', b: 'b', c: 'c', d: 'd', e: 'e' })
		// A–C: two singletons, so A goes under C; C–B: C's tree is bigger, so B goes under C too.
		expect(run.frames[1].caption).toBe("A–C (1): find(A) = A, find(C) = C, two trees, so take it: union puts A's tree under C")
		expect(run.frames[2].sets).toMatchObject({ parent: { a: 'c', b: 'c', c: 'c' }, sizes: { c: 3 }, flash: { 'edge:b': 'green', c: 'green' } })
		// The skipped A–B: both ways up lit red at the root.
		const skip = run.frames.find((f) => f.caption?.startsWith('A–B'))!
		expect(skip.sets!.flash).toMatchObject({ a: 'orange', 'edge:a': 'orange', b: 'orange', c: 'red' })
		// B–D joins C's tree (3) and E's (2): E goes under C.
		expect(run.frames.at(-1)!.sets!.parent).toEqual({ a: 'c', b: 'c', c: 'c', d: 'e', e: 'c' })
	})

	it('a disconnected graph gets a forest', () => {
		const run = kruskal({ ...graph, nodes: [...graph.nodes, node('z', 'Z')] }, weighted)
		expect(last(run.frames)).toBe("No edges left and the graph isn't connected: a minimum spanning forest, total weight 11")
	})
})

describe('connected components', () => {
	it('counts the pieces: each node in no piece yet starts one, a search finds the rest', () => {
		const run = components({ nodes: [...graph.nodes, node('y', 'Y'), node('x', 'X'), node('z', 'Z')], edges: [...graph.edges, edge('xz', 'x', 'z', 1)] }, weighted)
		expect(run.pieces).toEqual([['a', 'b', 'c', 'd', 'e'], ['x', 'z'], ['y']])
		expect(last(run.frames)).toBe('Every vertex is visited: 3 searches, so 3 components')
		const end = stateAt(run.frames, run.frames.length - 1)
		expect(end.badges).toMatchObject({ a: '1', e: '1', x: '2', z: '2', y: '3' })
		expect(end.counts).toEqual({ components: 3 })
		expect(end.flash).toMatchObject({ a: 'blue', x: 'green', y: 'orange', 'edge:xz': 'green' })
		// Lecture 9: the loop skips what a search marked; a search marks its whole component.
		expect(run.frames.map((f) => f.caption)).toContain('v = B: visited[B] is true, a search found it already: skip')
		expect(run.frames.map((f) => f.caption)).toContain('X–Z: dfs(Z) marks Z visited')
		expect(run.frames.map((f) => f.caption)).toContain('dfs(X) is done: component 2 is X, Z. count += 1, so count = 2')
	})

	it('a connected graph is one piece; a directed one counts edges both ways', () => {
		expect(last(components(graph, weighted).frames)).toBe('Every vertex is visited: one search reached them all, so the graph is connected (1 component)')
		expect(components(graph, { directed: true, weighted: true }).frames[0].caption).toContain('(edges count both ways)')
	})
})

describe("lecture 9's components: a loop over visited[], one DFS per component", () => {
	it('{0, 1, 2, 3} and {4, 5, 6}: the loop jumps from 0 to 4, skipping what dfs(0) marked', () => {
		const split: GraphModel = {
			nodes: '0123456'.split('').map((v, i) => ({ id: `v${v}`, value: v, x: i, y: 0 })),
			edges: ['0-2', '2-3', '0-1', '4-5', '5-6'].map((p, i) => {
				const [from, to] = p.split('-')
				return { id: `e${i}`, from: `v${from}`, to: `v${to}`, weight: '1' }
			}),
		}
		const run = components(split, { directed: false, weighted: false })
		const searches = run.frames.filter((f) => f.line === 'search').map((f) => f.vars?.v)
		expect(searches).toEqual(['0', '4'])
		expect(run.frames.filter((f) => f.line === 'skip').map((f) => f.vars?.v)).toEqual(['1', '2', '3', '5', '6'])
		expect(run.frames.at(-1)?.caption).toBe('Every vertex is visited: 2 searches, so 2 components')
		expect(run.code).toBe('graph-components')
	})
})

describe('topological sort', () => {
	const dag: GraphModel = {
		nodes: graph.nodes,
		edges: [edge('ab', 'a', 'b', 1), edge('ac', 'a', 'c', 1), edge('cb', 'c', 'b', 1), edge('bd', 'b', 'd', 1), edge('cd', 'c', 'd', 1), edge('de', 'd', 'e', 1)],
	}

	it('orders the nodes so every edge points forward, numbering them at the end', () => {
		const run = topologicalSort(dag)
		expect(run.order).toEqual(['a', 'c', 'b', 'd', 'e'])
		expect(run.frames[0].badges).toEqual({ a: '0', b: '2', c: '1', d: '2', e: '1' })
		expect(run.frames.at(-1)?.badges).toEqual({ a: '1', c: '2', b: '3', d: '4', e: '5' })
		expect(last(run.frames)).toBe('Every node is placed: A, C, B, D, E. Every edge points forward in this order')
	})

	it('fades placed nodes and removed edges as it goes', () => {
		const { frames } = topologicalSort(dag)
		const placedA = frames.find((f) => f.caption === 'A is placed, with its edges gone')
		expect(placedA?.dim).toEqual(['edge:ab', 'edge:ac', 'a'])
	})

	it('finds a cycle', () => {
		const run = topologicalSort({ ...dag, edges: [...dag.edges, edge('ea', 'e', 'a', 1)] })
		expect(run.order).toEqual([])
		expect(last(run.frames)).toMatch(/^The queue is empty, but A, B, C, D, E still have incoming edges/)
	})
})
