import { mulberry32 } from '../../data/random'
import type { Point } from '../../nodelink/geometry'
import type { GraphEdge, GraphLabelsMode } from './graph-shape-types'
import { edgeWeight, nodeLabel, type GraphModel } from './model'

// Sketch geometry, in cell units (a node is one cell across).

/** Distance between successive nodes dropped along the drag path. */
export const GRAPH_SPACING = 2.3
/** No node is dropped closer than this to an existing one, so edges keep room for a weight. */
export const GRAPH_MIN_GAP = 1.9
/** Extra edges (beyond the one that keeps the graph connected) only reach this far. */
export const GRAPH_REACH = 3.6
/** Chance of each of up to two extra edges from a new node. */
export const EXTRA_EDGE_CHANCE = 0.45
/** An edge must pass at least this far from the centre of every other node. */
const CLEARANCE = 0.8
/** Smallest angle between two edges at a node, so they never look like one. */
const MIN_ANGLE = (25 * Math.PI) / 180
/** Biggest graph the sketch gesture makes. */
export const MAX_GRAPH_NODES = 40

/** Where a graph sketch is: nodes dropped so far and the pointer, relative to the press point. */
export interface GraphSketch {
	points: Point[]
	last: Point
}

export const INITIAL_GRAPH_SKETCH: GraphSketch = { points: [{ x: 0, y: 0 }], last: { x: 0, y: 0 } }

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Follow the pointer from where it last was to `at` (cell units from the press point), dropping a
 * node once it is GRAPH_SPACING past the last node dropped and at least GRAPH_MIN_GAP from all.
 */
export function nextGraphSketch(prev: GraphSketch, at: Point): GraphSketch {
	const points = [...prev.points]
	const length = dist(prev.last, at)
	const steps = Math.ceil(length / 0.05)
	for (let i = 1; i <= steps && points.length < MAX_GRAPH_NODES; i++) {
		const t = i / steps
		const p = { x: prev.last.x + (at.x - prev.last.x) * t, y: prev.last.y + (at.y - prev.last.y) * t }
		const last = points[points.length - 1]
		const d = dist(p, last)
		if (d < GRAPH_SPACING - 1e-6) continue
		// Just past the spacing: pull back onto it exactly, so a straight drag spaces nodes evenly.
		const k = d < GRAPH_SPACING + 0.1 ? GRAPH_SPACING / d : 1
		const node = { x: last.x + (p.x - last.x) * k, y: last.y + (p.y - last.y) * k }
		if (points.some((q) => dist(node, q) < GRAPH_MIN_GAP - 1e-9)) continue
		points.push(node)
	}
	return { points, last: at }
}

function cross(o: Point, a: Point, b: Point) {
	return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** Whether segments ab and cd cross at a point inside both (touching at an end doesn't count). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
	const d1 = cross(c, d, a)
	const d2 = cross(c, d, b)
	const d3 = cross(a, b, c)
	const d4 = cross(a, b, d)
	return d1 * d2 < 0 && d3 * d4 < 0
}

function distanceToSegment(p: Point, a: Point, b: Point) {
	const dx = b.x - a.x
	const dy = b.y - a.y
	const len2 = dx * dx + dy * dy
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
	return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

function angleBetween(at: Point, a: Point, b: Point) {
	const u = Math.atan2(a.y - at.y, a.x - at.x)
	const v = Math.atan2(b.y - at.y, b.x - at.x)
	const d = Math.abs(u - v) % (2 * Math.PI)
	return Math.min(d, 2 * Math.PI - d)
}

/** A stream of random numbers for node k, independent of the nodes after it. */
const nodeRng = (seed: number, k: number) => mulberry32((seed + Math.imul(k + 1, 0x9e3779b1)) >>> 0)

/**
 * A graph over `points` (node centres in drag order, cell units). Node k joins its nearest earlier
 * node it can reach cleanly (so the graph is connected), then each of the next two nearest within
 * GRAPH_REACH with EXTRA_EDGE_CHANCE. An edge is clean if it crosses no edge, passes no other node
 * closely and makes no narrow angle with another edge at either end, which keeps sketches
 * planar-ish rather than a hairball. Edges point either way at random. Node k's edges depend only
 * on the seed and points 0..k, so a longer sketch extends a shorter one.
 */
export function generateGraph(points: readonly Point[], seed: number, labels: GraphLabelsMode): GraphModel {
	const nodes = points.map((p, i) => ({ id: `v${i}`, value: nodeLabel(i, labels), x: p.x, y: p.y }))
	const edges: GraphEdge[] = []
	const neighbours = points.map((): number[] => [])

	const clean = (a: number, b: number) => {
		const [p, q] = [points[a], points[b]]
		if (edges.some((e) => segmentsCross(p, q, points[Number(e.from.slice(1))], points[Number(e.to.slice(1))]))) {
			return false
		}
		if (points.some((r, i) => i !== a && i !== b && i <= Math.max(a, b) && distanceToSegment(r, p, q) < CLEARANCE)) {
			return false
		}
		return (
			neighbours[a].every((n) => angleBetween(p, q, points[n]) >= MIN_ANGLE) &&
			neighbours[b].every((n) => angleBetween(q, p, points[n]) >= MIN_ANGLE)
		)
	}

	const connect = (k: number, j: number, rng: () => number) => {
		const id = `e${edges.length}`
		const [from, to] = rng() < 0.5 ? [j, k] : [k, j]
		edges.push({ id, from: `v${from}`, to: `v${to}`, weight: edgeWeight(seed, id) })
		neighbours[k].push(j)
		neighbours[j].push(k)
	}

	for (let k = 1; k < points.length; k++) {
		const rng = nodeRng(seed, k)
		const earlier = Array.from({ length: k }, (_, j) => j).sort(
			(a, b) => dist(points[k], points[a]) - dist(points[k], points[b])
		)
		const first = earlier.find((j) => clean(k, j)) ?? earlier[0]
		connect(k, first, rng)
		let extras = 0
		for (const j of earlier) {
			if (extras === 2 || dist(points[k], points[j]) > GRAPH_REACH) break
			if (j === first) continue
			extras++
			if (rng() < EXTRA_EDGE_CHANCE && clean(k, j)) connect(k, j, rng)
		}
	}
	return { nodes, edges }
}
