import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../data/random'
import type { Point } from '../../nodelink/geometry'
import {
	GRAPH_MIN_GAP,
	GRAPH_SPACING,
	INITIAL_GRAPH_SKETCH,
	generateGraph,
	nextGraphSketch,
	segmentsCross,
	type GraphSketch,
} from './generate'
import { graphShapeMigrations, type GraphEdge } from './graph-shape-types'
import { graphScene } from './layout'
import {
	addEdge,
	addNode,
	degrees,
	edgeWeight,
	markKeys,
	mergeTwins,
	nextLabel,
	nodeLabel,
	relabel,
	removeEdge,
	removeNode,
	type GraphModel,
} from './model'

/** Drive the sketch along a polyline, in small pointer moves like a real drag. */
function sketch(path: Point[], step = 0.4): GraphSketch {
	let s = INITIAL_GRAPH_SKETCH
	for (let i = 1; i < path.length; i++) {
		const [a, b] = [path[i - 1], path[i]]
		const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
		for (let j = 1; j <= n; j++) s = nextGraphSketch(s, { x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n })
	}
	return s
}

/** A wandering scribble from the origin. */
function scribble(seed: number, length = 60): Point[] {
	const rng = mulberry32(seed)
	const path = [{ x: 0, y: 0 }]
	let angle = 0
	for (let i = 0; i < length; i++) {
		angle += (rng() - 0.5) * 1.6
		const last = path[path.length - 1]
		path.push({ x: last.x + Math.cos(angle), y: last.y + Math.sin(angle) })
	}
	return path
}

function isConnected({ nodes, edges }: GraphModel) {
	const seen = new Set([nodes[0].id])
	const queue = [nodes[0].id]
	while (queue.length) {
		const id = queue.shift()!
		for (const e of edges) {
			const other = e.from === id ? e.to : e.to === id ? e.from : undefined
			if (other && !seen.has(other)) {
				seen.add(other)
				queue.push(other)
			}
		}
	}
	return seen.size === nodes.length
}

const at = (model: GraphModel, id: string) => model.nodes.find((n) => n.id === id)!

describe('graph sketch', () => {
	it('drops a node every GRAPH_SPACING along a straight drag', () => {
		const s = sketch([
			{ x: 0, y: 0 },
			{ x: GRAPH_SPACING * 4 + 0.1, y: 0 },
		])
		expect(s.points).toHaveLength(5)
		s.points.forEach((p, i) => expect(p.x).toBeCloseTo(GRAPH_SPACING * i, 1))
	})

	it('never drops a node too close to another when the drag doubles back', () => {
		const s = sketch([
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 1 },
			{ x: 0, y: 1 },
		])
		for (const [i, p] of s.points.entries()) {
			for (const q of s.points.slice(i + 1)) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(GRAPH_MIN_GAP)
		}
	})
})

describe('generateGraph', () => {
	const seeds = [1, 2, 3, 42, 1234, 99999]

	it('is connected, deterministic per seed, with weights 1-9', () => {
		for (const seed of seeds) {
			const { points } = sketch(scribble(seed))
			const g = generateGraph(points, seed, 'letters')
			expect(g.nodes.length).toBeGreaterThan(5)
			expect(isConnected(g)).toBe(true)
			expect(generateGraph(points, seed, 'letters')).toEqual(g)
			for (const e of g.edges) expect(Number(e.weight)).toBeGreaterThanOrEqual(1)
			for (const e of g.edges) expect(Number(e.weight)).toBeLessThanOrEqual(9)
		}
	})

	it('labels nodes in drag order', () => {
		const { points } = sketch(scribble(7))
		expect(generateGraph(points, 7, 'letters').nodes.slice(0, 3).map((n) => n.value)).toEqual(['A', 'B', 'C'])
		expect(generateGraph(points, 7, 'numbers').nodes.slice(0, 3).map((n) => n.value)).toEqual(['0', '1', '2'])
	})

	it('is growth-stable: a longer sketch keeps the edges of a shorter one', () => {
		for (const seed of seeds) {
			const { points } = sketch(scribble(seed))
			const full = generateGraph(points, seed, 'letters')
			for (let k = 1; k < points.length; k++) {
				const part = generateGraph(points.slice(0, k), seed, 'letters')
				expect(full.edges.slice(0, part.edges.length)).toEqual(part.edges)
			}
		}
	})

	it('has no crossing edges and no edge twice', () => {
		for (const seed of seeds) {
			const { points } = sketch(scribble(seed, 90))
			const g = generateGraph(points, seed, 'letters')
			const p = (id: string) => at(g, id)
			for (const [i, a] of g.edges.entries()) {
				for (const b of g.edges.slice(i + 1)) {
					expect(segmentsCross(p(a.from), p(a.to), p(b.from), p(b.to))).toBe(false)
					expect([a.from, a.to].sort()).not.toEqual([b.from, b.to].sort())
				}
			}
		}
	})

	it('adds extra edges beyond a spanning tree on a winding sketch', () => {
		const total = seeds.reduce((sum, seed) => {
			const g = generateGraph(sketch(scribble(seed, 90)).points, seed, 'letters')
			return sum + g.edges.length - (g.nodes.length - 1)
		}, 0)
		expect(total).toBeGreaterThan(0)
	})

	it('density: sparse sketches are trees, with fewer edges than medium and dense ones; all connected', () => {
		const edges = (density: 'sparse' | 'medium' | 'dense') =>
			seeds.reduce((sum, seed) => {
				const g = generateGraph(sketch(scribble(seed, 90)).points, seed, 'letters', { density })
				expect(isConnected(g)).toBe(true)
				if (density === 'sparse') expect(g.edges).toHaveLength(g.nodes.length - 1)
				return sum + g.edges.length
			}, 0)
		expect(edges('sparse')).toBeLessThan(edges('medium'))
		expect(edges('medium')).toBeLessThan(edges('dense'))
	})

	it('several components: some nodes start a new piece, and no edge joins two pieces', () => {
		let split = 0
		for (const seed of seeds) {
			const g = generateGraph(sketch(scribble(seed, 90)).points, seed, 'letters', { parts: 'components' })
			if (!isConnected(g)) split++
			// Fewer edges than a spanning tree would need, if in pieces, and each piece is a tree or more.
			expect(g.edges.length).toBeGreaterThanOrEqual(g.nodes.length - componentCount(g))
		}
		expect(split).toBeGreaterThan(seeds.length / 2)
	})

	it('complete: every pair joined once, V(V - 1)/2 edges, round a circle with no edge through a node', () => {
		const points = Array.from({ length: 7 }, (_, i) => ({ x: 3 + i * 2.3, y: 1 }))
		const g = generateGraph(points, 5, 'numbers', { density: 'complete' })
		expect(g.edges).toHaveLength((7 * 6) / 2)
		expect(new Set(g.edges.map((e) => [e.from, e.to].sort().join('-'))).size).toBe(21)
		// Node 0 where the drag began, its neighbours on the circle a sketch's spacing apart.
		expect(g.nodes[0]).toMatchObject({ x: 3, y: 1 })
		const at = (k: number) => g.nodes[k % 7]
		for (let k = 0; k < 7; k++) expect(Math.hypot(at(k).x - at(k + 1).x, at(k).y - at(k + 1).y)).toBeCloseTo(GRAPH_SPACING)
		// Every other node is well clear of every edge (no three nodes on a circle are in a line).
		for (const e of g.edges) {
			const [p, q] = [g.nodes.find((n) => n.id === e.from)!, g.nodes.find((n) => n.id === e.to)!]
			for (const r of g.nodes.filter((n) => n !== p && n !== q)) {
				const t = Math.max(0, Math.min(1, ((r.x - p.x) * (q.x - p.x) + (r.y - p.y) * (q.y - p.y)) / ((q.x - p.x) ** 2 + (q.y - p.y) ** 2)))
				expect(Math.hypot(r.x - (p.x + t * (q.x - p.x)), r.y - (p.y + t * (q.y - p.y)))).toBeGreaterThan(0.5)
			}
		}
		// A DAG: every pair, from the earlier node to the later.
		const dag = generateGraph(points, 5, 'numbers', { density: 'complete', order: 'dag' })
		for (const e of dag.edges) expect(Number(e.from.slice(1))).toBeLessThan(Number(e.to.slice(1)))
		expect(generateGraph(points.slice(0, 1), 5, 'numbers', { density: 'complete' }).edges).toEqual([])
	})

	it('DAG: the same edges, every one from the earlier node to the later, so no cycle', () => {
		for (const seed of seeds) {
			const { points } = sketch(scribble(seed, 90))
			const any = generateGraph(points, seed, 'letters')
			const dag = generateGraph(points, seed, 'letters', { order: 'dag' })
			const index = (id: string) => Number(id.slice(1))
			for (const e of dag.edges) expect(index(e.from)).toBeLessThan(index(e.to))
			expect(dag.edges.map((e) => [e.from, e.to].sort())).toEqual(any.edges.map((e) => [e.from, e.to].sort()))
		}
	})
})

function componentCount({ nodes, edges }: GraphModel) {
	const parent = new Map(nodes.map((n) => [n.id, n.id]))
	const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!))
	for (const e of edges) parent.set(find(e.from), find(e.to))
	return new Set(nodes.map((n) => find(n.id))).size
}

describe('graph model', () => {
	const model: GraphModel = {
		nodes: [
			{ id: 'v0', value: 'A', x: 0, y: 0 },
			{ id: 'v1', value: 'B', x: 3, y: 0 },
			{ id: 'v2', value: 'C', x: 0, y: 3 },
		],
		edges: [{ id: 'e0', from: 'v0', to: 'v1', weight: '4' }],
	}

	it('labels like spreadsheet columns or indices', () => {
		expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map((i) => nodeLabel(i, 'letters'))).toEqual([
			'A',
			'B',
			'Z',
			'AA',
			'AB',
			'AZ',
			'BA',
			'ZZ',
			'AAA',
		])
		expect(nodeLabel(12, 'numbers')).toBe('12')
	})

	it('gives a new node the first unused label and the next id', () => {
		expect(nextLabel(model.nodes, 'letters')).toBe('D')
		expect(nextLabel([model.nodes[0], model.nodes[2]], 'letters')).toBe('B')
		const added = addNode(model, { x: 5, y: 5 }, 'letters')
		expect(added.id).toBe('v3')
		expect(added.nodes[3]).toEqual({ id: 'v3', value: 'D', x: 5, y: 5 })
	})

	it('adds edges, refusing self-loops and duplicates (either way round when undirected)', () => {
		expect(addEdge(model, 'v0', 'v0', false, 1)).toBeUndefined()
		expect(addEdge(model, 'v1', 'v0', false, 1)).toBeUndefined()
		expect(addEdge(model, 'v0', 'v1', true, 1)).toBeUndefined()
		const twin = addEdge(model, 'v1', 'v0', true, 1)
		expect(twin?.id).toBe('e1')
		expect(twin?.edges[1]).toEqual({ id: 'e1', from: 'v1', to: 'v0', weight: edgeWeight(1, 'e1') })
		expect(addEdge(model, 'v0', 'v9', false, 1)).toBeUndefined()
	})

	it('removing a node removes its edges', () => {
		expect(removeNode(model, 'v0')).toEqual({ nodes: model.nodes.slice(1), edges: [] })
		expect(removeNode(model, 'v2').edges).toEqual(model.edges)
		expect(removeEdge(model, 'e0').edges).toEqual([])
	})

	it('merges u->v / v->u twins for an undirected graph, keeping the first', () => {
		const edges: GraphEdge[] = [
			{ id: 'e0', from: 'v0', to: 'v1', weight: '1' },
			{ id: 'e1', from: 'v1', to: 'v2', weight: '2' },
			{ id: 'e2', from: 'v1', to: 'v0', weight: '3' },
		]
		expect(mergeTwins(edges).map((e) => e.id)).toEqual(['e0', 'e1'])
	})

	it('relabels in node order and lists markable keys', () => {
		expect(relabel(model.nodes, 'numbers').map((n) => n.value)).toEqual(['0', '1', '2'])
		expect(markKeys(model)).toEqual(['v0', 'v1', 'v2', 'edge:e0'])
	})

	it('weights are 1-9 and deterministic', () => {
		for (let i = 0; i < 50; i++) {
			const w = Number(edgeWeight(5, `e${i}`))
			expect(w).toBeGreaterThanOrEqual(1)
			expect(w).toBeLessThanOrEqual(9)
		}
		expect(edgeWeight(5, 'e3')).toBe(edgeWeight(5, 'e3'))
	})

	it('scene: circles at cell-unit positions, arrows when directed, weights when weighted', () => {
		const scene = graphScene({ ...model, direction: 'directed', weights: 'weighted', size: 'm' })
		expect(scene.nodes[1]).toMatchObject({ key: 'v1', kind: 'circle', x: 144, y: 0, w: 48, value: 'B' })
		expect(scene.edges[0]).toMatchObject({ key: 'e0', from: 'v0', to: 'v1', directed: true, label: '4' })
		const plain = graphScene({ ...model, direction: 'undirected', weights: 'unweighted', size: 'm' })
		expect(plain.edges[0]).toMatchObject({ directed: false, label: undefined })
	})
})

describe('degrees', () => {
	it('undirected: the edges at each node, adding up to 2E; directed: in / out, each adding up to E', () => {
		const g: GraphModel = {
			nodes: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, value: id.toUpperCase(), x: i, y: 0 })),
			edges: [
				{ id: 'e0', from: 'a', to: 'b', weight: '1' },
				{ id: 'e1', from: 'a', to: 'c', weight: '1' },
				{ id: 'e2', from: 'c', to: 'b', weight: '1' },
			],
		}
		expect(degrees(g, false)).toEqual({ a: '2', b: '2', c: '2', d: '0' })
		expect(degrees(g, true)).toEqual({ a: '0/2', b: '2/0', c: '1/1', d: '0/0' })
	})
})

describe('graph migrations', () => {
	it('graphs saved before degrees could show get them hidden', () => {
		const step = graphShapeMigrations.sequence.at(-1)!
		if (!('up' in step) || typeof step.down !== 'function') throw new Error('expected a props migration')
		const props: Record<string, unknown> = {}
		step.up(props)
		expect(props).toEqual({ degrees: false })
		step.down(props)
		expect(props).toEqual({})
	})

	it('graphs saved before the sketch options get the defaults', () => {
		const step = graphShapeMigrations.sequence.at(-2)!
		if (!('up' in step) || typeof step.down !== 'function') throw new Error('expected a props migration')
		const props: Record<string, unknown> = {}
		step.up(props)
		expect(props).toEqual({ density: 'medium', parts: 'connected', order: 'any' })
		step.down(props)
		expect(props).toEqual({})
	})
})
