import { describe, expect, it } from 'vitest'
import { addVertexCosts, hasEdgeCosts, removeEdgeCosts, removeVertexCosts } from './costs'
import { adjacencyMatrix, adjacencyScene, edgeList, entryKey, headKey, orderedNodes, viewHighlights, viewTitle } from './model'

const node = (id: string, value: string) => ({ id, value, x: 0, y: 0 })
const graph = {
	// Created out of label order: the views run in label order (as BFS and DFS visit neighbours).
	nodes: [node('v0', 'B'), node('v1', 'A'), node('v2', 'C')],
	edges: [
		{ id: 'e0', from: 'v1', to: 'v0', weight: '4' },
		{ id: 'e1', from: 'v0', to: 'v2', weight: '7' },
	],
	direction: 'undirected' as const,
	weights: 'unweighted' as const,
}

describe('adjacency matrix', () => {
	it('undirected: 1 both ways, symmetric; rows and columns in label order', () => {
		expect(orderedNodes(graph).map((n) => n.value)).toEqual(['A', 'B', 'C'])
		expect(adjacencyMatrix(graph)).toEqual({
			labels: ['A', 'B', 'C'],
			values: [
				['0', '1', '0'],
				['1', '0', '1'],
				['0', '1', '0'],
			],
		})
	})

	it('directed: row = from, column = to; weighted: the weight, blank for no edge', () => {
		expect(adjacencyMatrix({ ...graph, direction: 'directed' }).values).toEqual([
			['0', '1', '0'],
			['0', '0', '1'],
			['0', '0', '0'],
		])
		expect(adjacencyMatrix({ ...graph, weights: 'weighted' }).values[1]).toEqual(['4', '', '7'])
	})
})

describe('adjacency lists', () => {
	it('each node heads a chain of its neighbours, in label order; directed lists hold out-edges only', () => {
		const chain = (scene: ReturnType<typeof adjacencyScene>, from: string) => {
			const out: string[] = []
			for (let at = headKey(from); ; ) {
				const edge = scene.edges.find((e) => e.from === at)
				if (!edge) return out
				out.push(scene.nodes.find((n) => n.key === edge.to)!.value)
				at = edge.to
			}
		}
		const undirected = adjacencyScene(graph, 'm')
		expect(chain(undirected, 'v0')).toEqual(['A', 'C'])
		expect(chain(undirected, 'v1')).toEqual(['B'])
		const directed = adjacencyScene({ ...graph, direction: 'directed', weights: 'weighted' }, 'm')
		expect(chain(directed, 'v0')).toEqual(['C:7'])
		expect(chain(directed, 'v2')).toEqual([])
	})
})

describe('highlights on a view', () => {
	it('a node lights its row and column (its list head), an edge its cells (its list entries)', () => {
		const marks = { v0: 'orange', 'edge:e0': 'green' } as const
		expect(viewHighlights(graph, 'matrix', marks)).toEqual({ 'row:1': 'orange', 'col:1': 'orange', '1,0': 'green', '0,1': 'green' })
		expect(viewHighlights(graph, 'lists', marks)).toEqual({ [headKey('v0')]: 'orange', [entryKey('v1', 'e0')]: 'green', [entryKey('v0', 'e0')]: 'green' })
		expect(viewHighlights({ ...graph, direction: 'directed' }, 'matrix', { 'edge:e0': 'green' })).toEqual({ '0,1': 'green' })
	})
})

describe('edge list and what each view costs (lecture 9a)', () => {
	// A–B, B–C, and D on no edge.
	const withD = { ...graph, nodes: [...graph.nodes, node('v3', 'D')] }

	it('the edge list: a row per edge, the earlier label first, sorted; D, on no edge, is lost', () => {
		expect(edgeList(withD)).toMatchObject({ values: [['A', 'B'], ['B', 'C']], cols: ['u', 'v'], isolated: ['D'] })
		expect(edgeList({ ...graph, direction: 'directed', weights: 'weighted' })).toMatchObject({
			values: [['A', 'B', '4'], ['B', 'C', '7']],
			cols: ['from', 'to', 'w'],
		})
	})

	it('headings count V, E and the cells: V × V, V + 2E (directed V + E), E pairs', () => {
		expect(viewTitle(withD, 'matrix')).toBe('Adjacency matrix: V × V = 4 × 4 = 16 cells, 4 for E = 2 edges (each in two)')
		expect(viewTitle({ ...withD, direction: 'directed' }, 'matrix')).toBe('Adjacency matrix: V × V = 4 × 4 = 16 cells, 2 for E = 2 edges')
		expect(viewTitle(withD, 'lists')).toBe('Adjacency lists: V + 2E = 4 + 4 = 8 (E = 2 edges)')
		expect(viewTitle({ ...withD, direction: 'directed' }, 'lists')).toBe('Adjacency lists: V + E = 4 + 2 = 6 (E = 2 edges)')
		expect(viewTitle(withD, 'edges')).toBe("Edge list: E = 2 pairs (V = 4); D, on no edge, isn't in it")
		expect(viewTitle(graph, 'edges')).toBe('Edge list: E = 2 pairs (V = 3)')
	})

	it("on the edge list, an edge lights its row, a node every cell naming it", () => {
		expect(viewHighlights(graph, 'edges', { 'edge:e1': 'green', v0: 'red' })).toEqual({
			'row:1': 'green',
			'1,0': 'red',
			'1,1': 'green',
			'0,1': 'red',
		})
	})
})

describe('what a change costs each representation, step by step', () => {
	// Lecture 9's graph: vertices 0..6.
	const pairs = ['0-1', '0-2', '1-3', '2-3', '2-5', '3-4', '3-5', '5-6', '4-6']
	const lecture = {
		nodes: ['0', '1', '2', '3', '4', '5', '6'].map((v, i) => ({ id: `v${v}`, value: v, x: i, y: i % 2 })),
		edges: pairs.map((p, i) => ({ id: `e${i}`, from: `v${p[0]}`, to: `v${p[2]}`, weight: '1' })),
		direction: 'undirected' as const,
		weights: 'unweighted' as const,
		labels: 'numbers' as const,
	}
	const ends = (run: { frames: { counts?: Record<string, number> }[] }) => run.frames.at(-1)!.counts

	it('adding a vertex: the matrix copies into a bigger one (V²), the lists add a head, the edge list nothing', () => {
		const run = addVertexCosts(lecture)
		expect(ends(run)).toEqual({ 'matrix cells': 64, 'list entries': 1, 'edge-list rows': 0 })
		expect(run.result?.nodes.at(-1)).toMatchObject({ value: '7', x: 8.3, y: 0 })
		expect(run.frames[1].caption).toBe("Matrix: a 7 × 7 array can't grow, so a new 8 × 8 one, the 49 cells copied over and 15 new ones for 7's row and column: 64 cells, O(V²)")
		const matrix = run.frames[1].views!.matrix!
		expect(Object.values(matrix).filter((c) => c === 'orange')).toHaveLength(49)
		expect(matrix['7,7']).toBe('green')
		expect(run.frames[2].views).toEqual({ lists: { [headKey('v7')]: 'green' } })
	})

	it('removing vertex 3: the matrix copies (V - 1)², the lists are all walked (V + E), the edge list scanned (E)', () => {
		const run = removeVertexCosts(lecture, 'v3')
		// 3's own 4 entries, and the other lists' 14 walked.
		expect(ends(run)).toEqual({ 'matrix cells': 36, 'list entries': 18, 'edge-list rows': 9 })
		expect(run.result?.nodes.map((n) => n.value)).toEqual(['0', '1', '2', '4', '5', '6'])
		expect(run.result?.edges).toHaveLength(5)
		expect(run.frames[2].views!.lists![entryKey('v1', 'e2')]).toBe('red')
		expect(run.frames[2].views!.lists![entryKey('v0', 'e0')]).toBe('orange')
	})

	it('removing an edge: 2 cells, a walk along both ends\' lists (not E), the pairs scanned until it', () => {
		const run = removeEdgeCosts(lecture, 'e3')
		// 2–3: 2's list is 0, 3, 5 (walk 2); 3's is 1, 2, 4, 5 (walk 2).
		expect(ends(run)).toEqual({ 'matrix cells': 2, 'list entries': 4, 'edge-list rows': 4 })
		expect(run.frames[2].caption).toBe("Lists: walk 2's list to 3 (2) and 3's to 2 (2) and unlink: 4 entries, O(deg 2 + deg 3)")
		expect(run.result?.edges.map((e) => e.id)).not.toContain('e3')
	})

	it('is there an edge? one cell, a walk along one list, the pairs scanned; nothing changes', () => {
		const yes = hasEdgeCosts(lecture, 'v3', 'v5')
		expect(ends(yes)).toEqual({ 'matrix cells': 1, 'list entries': 4, 'edge-list rows': 7 })
		expect(yes.frames.at(-1)!.caption).toBe('Yes, there is edge 3–5: the matrix looked at 1 cell, the lists 4 entries, the edge list 7 rows')
		const no = hasEdgeCosts(lecture, 'v0', 'v6')
		expect(ends(no)).toEqual({ 'matrix cells': 1, 'list entries': 2, 'edge-list rows': 9 })
		expect(no.result).toBeUndefined()
	})
})
