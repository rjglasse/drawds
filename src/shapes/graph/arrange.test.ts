import { describe, expect, it } from 'vitest'
import { circleLayout, tidyLayout } from './arrange'
import { GRAPH_MIN_GAP, GRAPH_SPACING, generateGraph } from './generate'
import type { GraphModel } from './model'

const centre = (nodes: { x: number; y: number }[]) => ({ x: nodes.reduce((s, n) => s + n.x, 0) / nodes.length, y: nodes.reduce((s, n) => s + n.y, 0) / nodes.length })
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

// A sketched graph of 12 nodes along a zigzag, and a tangle: the same nodes bunched up.
const sketched = generateGraph(
	Array.from({ length: 12 }, (_, i) => ({ x: (i % 4) * 2.3, y: Math.floor(i / 4) * 2.3 + (i % 2) * 0.5 })),
	11,
	'letters'
)
const tangle: GraphModel = { ...sketched, nodes: sketched.nodes.map((n, i) => ({ ...n, x: (i % 3) * 0.4, y: Math.floor(i / 3) * 0.3 })) }

describe('round a circle', () => {
	it('puts the nodes on a circle in order, A at the top, neighbours a spacing apart, centred where they were', () => {
		const nodes = circleLayout(sketched.nodes)
		const c = centre(nodes)
		const r = gap(nodes[0], c)
		for (const n of nodes) expect(gap(n, c)).toBeCloseTo(r, 1)
		for (let i = 0; i < nodes.length; i++) expect(gap(nodes[i], nodes[(i + 1) % nodes.length])).toBeCloseTo(GRAPH_SPACING, 1)
		expect(nodes[0].y).toBeLessThan(c.y)
		expect(nodes[0].x).toBeCloseTo(c.x, 1)
		// Clockwise (y down): B to the right of A.
		expect(nodes[1].x).toBeGreaterThan(nodes[0].x)
		expect(c.x).toBeCloseTo(centre(sketched.nodes).x, 1)
		expect(c.y).toBeCloseTo(centre(sketched.nodes).y, 1)
		expect(nodes.map((n) => n.id)).toEqual(sketched.nodes.map((n) => n.id))
	})
})

describe('tidy (forces)', () => {
	it('untangles: edges about a spacing long, no two nodes on top of each other, centred where it was', () => {
		const nodes = tidyLayout(tangle)
		const at = new Map(nodes.map((n) => [n.id, n]))
		const lengths = tangle.edges.map((e) => gap(at.get(e.from)!, at.get(e.to)!))
		const mean = lengths.reduce((s, l) => s + l, 0) / lengths.length
		// As a sketch: edges a spacing on average, no two nodes nearer than its gap.
		expect(mean).toBeGreaterThanOrEqual(GRAPH_SPACING - 0.02)
		expect(mean).toBeLessThan(GRAPH_SPACING * 1.3)
		for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(gap(nodes[i], nodes[j])).toBeGreaterThanOrEqual(GRAPH_MIN_GAP - 0.02)
		expect(centre(nodes).x).toBeCloseTo(centre(tangle.nodes).x, 1)
		expect(centre(nodes).y).toBeCloseTo(centre(tangle.nodes).y, 1)
	})

	it('the same graph lands the same way; pieces with no edge between them stay near', () => {
		expect(tidyLayout(tangle)).toEqual(tidyLayout(tangle))
		const two: GraphModel = {
			nodes: ['A', 'B', 'C', 'D'].map((value, i) => ({ id: `v${i}`, value, x: i * 0.5, y: 0 })),
			edges: [
				{ id: 'e0', from: 'v0', to: 'v1', weight: '1' },
				{ id: 'e1', from: 'v2', to: 'v3', weight: '1' },
			],
		}
		const nodes = tidyLayout(two)
		expect(Math.max(...nodes.map((n) => n.x)) - Math.min(...nodes.map((n) => n.x))).toBeLessThan(GRAPH_SPACING * 4)
		expect(gap(nodes[0], nodes[1])).toBeCloseTo(GRAPH_SPACING, 0)
	})

	it('a single node, or none, stays as it is', () => {
		expect(tidyLayout({ nodes: [sketched.nodes[0]], edges: [] })).toEqual([sketched.nodes[0]])
		expect(circleLayout([])).toEqual([])
	})
})
