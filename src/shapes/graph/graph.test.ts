import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../data/random'
import type { Point } from '../../nodelink/geometry'
import {
	GRAPH_MIN_GAP,
	GRAPH_SPACING,
	INITIAL_GRAPH_SKETCH,
	MAX_GRAPH_NODES,
	extendGraph,
	extendingSketch,
	generateGraph,
	nextGraphSketch,
	segmentsCross,
	type GraphSketch,
} from './generate'
import { graphShapeMigrations, type GraphEdge } from './graph-shape-types'
import { graphCorner, graphScene } from './layout'
import {
	addEdge,
	addNode,
	degrees,
	neighbourMarks,
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
import { reverseEdge, rewireEdge, transpose } from './model'
import { edgeEndGrips, edgeOfRewireHandle, rewireHandleId } from './connect'

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

	it("corner: the nodes' lower right; with none, a lone node's at the origin (never -Infinity)", () => {
		expect(graphCorner({ nodes: model.nodes, size: 'm' })).toEqual({ x: 3.5 * 48, y: 3.5 * 48 })
		expect(graphCorner({ nodes: [], size: 'm' })).toEqual({ x: 24, y: 24 })
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

	it('pointing at a node: its neighbours and the edges to them; directed, out green and in orange', () => {
		const g: GraphModel = {
			nodes: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, value: id.toUpperCase(), x: i, y: 0 })),
			edges: [
				{ id: 'e0', from: 'a', to: 'b', weight: '1' },
				{ id: 'e1', from: 'c', to: 'a', weight: '1' },
				{ id: 'e2', from: 'b', to: 'a', weight: '1' },
				{ id: 'e3', from: 'c', to: 'd', weight: '1' },
				{ id: 'e4', from: 'a', to: 'a', weight: '1' },
			],
		}
		expect(neighbourMarks(g, 'a', false)).toEqual({ a: 'blue', b: 'green', c: 'green', 'edge:e0': 'green', 'edge:e1': 'green', 'edge:e2': 'green', 'edge:e4': 'green' })
		// b both ways: green, each edge its own colour; a loop leaves a blue.
		expect(neighbourMarks(g, 'a', true)).toEqual({ a: 'blue', b: 'green', c: 'orange', 'edge:e0': 'green', 'edge:e1': 'orange', 'edge:e2': 'orange', 'edge:e4': 'green' })
		expect(neighbourMarks(g, 'd', true)).toEqual({ d: 'blue', c: 'orange', 'edge:e3': 'orange' })
		expect(neighbourMarks({ nodes: g.nodes, edges: [] }, 'b', false)).toEqual({ b: 'blue' })
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

describe('reversing and re-wiring edges', () => {
	// A→B (weight 4), B→C, C→A.
	const tri: GraphModel = {
		nodes: ['A', 'B', 'C'].map((value, i) => ({ id: `v${i}`, value, x: i, y: 0 })),
		edges: [
			{ id: 'e0', from: 'v0', to: 'v1', weight: '4' },
			{ id: 'e1', from: 'v1', to: 'v2', weight: '1' },
			{ id: 'e2', from: 'v2', to: 'v0', weight: '2' },
		],
	}

	it('reverses a directed edge, keeping its id and weight; not onto an edge already there', () => {
		expect(reverseEdge(tri, 'e0')?.edges[0]).toEqual({ id: 'e0', from: 'v1', to: 'v0', weight: '4' })
		const twins = { ...tri, edges: [...tri.edges, { id: 'e3', from: 'v1', to: 'v0', weight: '7' }] }
		expect(reverseEdge(twins, 'e0')).toBeUndefined()
		expect(reverseEdge(tri, 'e9')).toBeUndefined()
	})

	it('transposes: every edge turned round, a pair u→v, v→u swapping over', () => {
		expect(transpose(tri).edges.map((e) => [e.from, e.to])).toEqual([
			['v1', 'v0'],
			['v2', 'v1'],
			['v0', 'v2'],
		])
		expect(transpose(transpose(tri))).toEqual(tri)
	})

	it('re-wires one end to another node; no self-loop, no duplicate, no change', () => {
		expect(rewireEdge(tri, 'e0', 'to', 'v2', true)?.edges[0]).toEqual({ id: 'e0', from: 'v0', to: 'v2', weight: '4' })
		expect(rewireEdge(tri, 'e0', 'from', 'v2', true)?.edges[0]).toEqual({ id: 'e0', from: 'v2', to: 'v1', weight: '4' })
		expect(rewireEdge(tri, 'e0', 'to', 'v0', true)).toBeUndefined()
		expect(rewireEdge(tri, 'e0', 'to', 'v1', true)).toBeUndefined()
		// v1→v2 is there already; undirected, C–A is the same pair as A–C.
		expect(rewireEdge(tri, 'e0', 'from', 'v1', true)).toBeUndefined()
		expect(rewireEdge(tri, 'e0', 'to', 'v2', false)).toBeUndefined()
	})

	it("grips an edge's ends a little along it, the head's past its arrow; not a short edge", () => {
		const grips = edgeEndGrips([{ x: 0, y: 0 }, { x: 100, y: 0 }], 15, 10)!
		expect(grips).toEqual({ from: { x: 15, y: 0 }, to: { x: 75, y: 0 } })
		// Along a bend: the distance is measured along the route.
		expect(edgeEndGrips([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 100 }], 15)?.from).toEqual({ x: 10, y: 5 })
		expect(edgeEndGrips([{ x: 0, y: 0 }, { x: 40, y: 0 }], 15, 10)).toBeUndefined()
		expect(edgeOfRewireHandle(rewireHandleId('e12', 'to'))).toEqual({ edge: 'e12', end: 'to' })
		expect(edgeOfRewireHandle('connect:v1')).toBeUndefined()
	})
})

describe('extending a graph from one of its nodes', () => {
	const base: GraphModel = generateGraph(sketch([{ x: 0, y: 0 }, { x: 8, y: 0 }]).points, 7, 'letters')
	const run = (from: string, path: Point[]) => {
		let s = extendingSketch(base, from)
		for (const p of path) s = nextGraphSketch(s, p)
		return s
	}

	it('drops nodes along the drag from the node, keeping clear of the graph, and joins them to it', () => {
		const start = base.nodes[base.nodes.length - 1]
		const s = run(start.id, [{ x: 0, y: 3 }, { x: 0, y: 7 }])
		expect(s.points[0]).toEqual({ x: 0, y: 0 })
		expect(s.points.length).toBeGreaterThan(2)
		const grown = extendGraph(base, start.id, s.points, 7, 'letters')
		expect(grown.nodes.slice(0, base.nodes.length)).toEqual(base.nodes)
		expect(grown.edges.slice(0, base.edges.length)).toEqual(base.edges)
		// Ids and labels carry on; every new node is reached from the old graph.
		const added = grown.nodes.slice(base.nodes.length)
		expect(added.map((n) => n.id)).toEqual(added.map((_, i) => `v${base.nodes.length + i}`))
		expect(added[0].value).toBe(String.fromCharCode(65 + base.nodes.length))
		expect(isConnected(grown)).toBe(true)
		// New nodes keep their distance from the old ones.
		for (const n of added) for (const o of base.nodes) expect(Math.hypot(n.x - o.x, n.y - o.y)).toBeGreaterThanOrEqual(GRAPH_MIN_GAP - 1e-6)
	})

	it('a longer drag extends a shorter one; a DAG keeps pointing forward', () => {
		const start = base.nodes[0].id
		const short = run(start, [{ x: 0, y: 5 }])
		const long = run(start, [{ x: 0, y: 5 }, { x: 0, y: 10 }])
		const [a, b] = [extendGraph(base, start, short.points, 3, 'letters'), extendGraph(base, start, long.points, 3, 'letters')]
		expect(b.nodes.slice(0, a.nodes.length)).toEqual(a.nodes)
		expect(b.edges.slice(0, a.edges.length)).toEqual(a.edges)
		const dag = extendGraph(base, start, long.points, 3, 'letters', { order: 'dag' })
		const index = (id: string) => Number(id.slice(1))
		for (const e of dag.edges.slice(base.edges.length)) expect(index(e.from)).toBeLessThan(index(e.to))
	})

	it('stops at MAX_GRAPH_NODES in all', () => {
		const s = run(base.nodes[0].id, Array.from({ length: 200 }, (_, i) => ({ x: (i % 20) * 3, y: Math.floor(i / 20) * 3 + 4 })))
		expect(base.nodes.length + s.points.length - 1).toBeLessThanOrEqual(MAX_GRAPH_NODES)
	})
})
