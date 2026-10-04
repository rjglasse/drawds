import { describe, expect, it } from 'vitest'
import { adjacencyMatrix, adjacencyScene, entryKey, headKey, orderedNodes, viewHighlights } from './model'

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
