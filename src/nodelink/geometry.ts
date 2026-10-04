import type { Scene, SceneEdge, SceneNode } from './scene'

export interface Point {
	x: number
	y: number
}

/** Axis-aligned box by its top-left corner. */
export interface Box {
	x: number
	y: number
	w: number
	h: number
}

export function nodeBox(node: SceneNode): Box {
	return { x: node.x - node.w / 2, y: node.y - node.h / 2, w: node.w, h: node.h }
}

/** The part of a node that shows its value; list nodes exclude their pointer compartments. */
export function valueBox(node: SceneNode): Box {
	const box = nodeBox(node)
	if (!node.pointer) return box
	const { side, width, back } = node.pointer
	const before = side === 'left' || back ? width : 0
	return { x: box.x + before, y: box.y, w: box.w - width * (back ? 2 : 1), h: box.h }
}

/**
 * Centre of a list node's pointer compartment, where a pointer arrow starts: its next pointer, or
 * (`prev`) a doubly linked node's prev pointer, on the other side.
 */
export function pointerAnchor(node: SceneNode, prev = false): Point {
	if (!node.pointer) return { x: node.x, y: node.y }
	const { width } = node.pointer
	const side = prev ? (node.pointer.side === 'right' ? 'left' : 'right') : node.pointer.side
	const x = side === 'right' ? node.x + node.w / 2 - width / 2 : node.x - node.w / 2 + width / 2
	return { x, y: node.y }
}

export function nodeContains(node: SceneNode, p: Point): boolean {
	if (node.kind === 'circle') return Math.hypot(p.x - node.x, p.y - node.y) <= node.w / 2
	return boxContains(nodeBox(node), p)
}

export function boxContains(box: Box, p: Point): boolean {
	return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h
}

/** Where the ray from a node's centre towards `toward` leaves the node's outline. */
export function boundaryPoint(node: SceneNode, toward: Point): Point {
	const dx = toward.x - node.x
	const dy = toward.y - node.y
	const len = Math.hypot(dx, dy)
	if (len === 0) return { x: node.x, y: node.y }
	if (node.kind === 'circle') {
		const r = node.w / 2
		return { x: node.x + (dx / len) * r, y: node.y + (dy / len) * r }
	}
	const t = Math.min(
		dx === 0 ? Infinity : node.w / 2 / Math.abs(dx),
		dy === 0 ? Infinity : node.h / 2 / Math.abs(dy)
	)
	return { x: node.x + dx * t, y: node.y + dy * t }
}

/** Where a ray from `p` (inside the node) towards `toward` leaves the node's box. */
function exitPoint(node: SceneNode, p: Point, toward: Point): Point {
	const box = nodeBox(node)
	const dx = toward.x - p.x
	const dy = toward.y - p.y
	const tx = dx > 0 ? (box.x + box.w - p.x) / dx : dx < 0 ? (box.x - p.x) / dx : Infinity
	const ty = dy > 0 ? (box.y + box.h - p.y) / dy : dy < 0 ? (box.y - p.y) / dy : Infinity
	const t = Math.min(tx, ty, 1)
	return { x: p.x + dx * t, y: p.y + dy * t }
}

/** Closest point on a node's outline to `p` (for a point outside the node). */
export function nearestOutlinePoint(node: SceneNode, p: Point): Point {
	if (node.kind === 'circle' || nodeContains(node, p)) return boundaryPoint(node, p)
	const box = nodeBox(node)
	return { x: Math.min(Math.max(p.x, box.x), box.x + box.w), y: Math.min(Math.max(p.y, box.y), box.y + box.h) }
}

export interface EdgeRoute {
	/** SVG path data. */
	d: string
	/** End of the edge, where an arrowhead goes, and the direction it arrives in (radians). */
	tip: Point
	angle: number
	/** Where to centre the edge's label. */
	labelAt: Point
	/** Polyline approximation, for hit-testing and bounds. */
	points: Point[]
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

function quadAt(a: Point, c: Point, b: Point, t: number): Point {
	const u = 1 - t
	return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }
}

function cubicAt(a: Point, c1: Point, c2: Point, b: Point, t: number): Point {
	const u = 1 - t
	const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
	return {
		x: w[0] * a.x + w[1] * c1.x + w[2] * c2.x + w[3] * b.x,
		y: w[0] * a.y + w[1] * c1.y + w[2] * c2.y + w[3] * b.y,
	}
}

const SAMPLES = 12
const sample = (at: (t: number) => Point) => Array.from({ length: SAMPLES + 1 }, (_, i) => at(i / SAMPLES))

/**
 * Route an edge between two nodes, clipped to their outlines. `bend` curves the edge to the left
 * of its direction by that fraction of its length (used to separate u->v from v->u).
 */
export function routeEdge(
	from: SceneNode,
	to: SceneNode,
	{
		bend = 0,
		fromPointer = false,
		lane = 0,
		via,
	}: { bend?: number; fromPointer?: boolean | 'prev'; lane?: number; via?: readonly Point[] } = {}
): EdgeRoute {
	if (via?.length) return routeVia(from, to, via, fromPointer)
	if (from.key === to.key) return selfLoop(from)
	let anchor = fromPointer ? pointerAnchor(from, fromPointer === 'prev') : { x: from.x, y: from.y }
	if (lane) {
		// To the left of the arrow's direction, by a share of the node's height.
		const len = Math.hypot(to.x - anchor.x, to.y - anchor.y) || 1
		const shift = lane * from.h
		anchor = { x: anchor.x + ((to.y - anchor.y) / len) * shift, y: anchor.y - ((to.x - anchor.x) / len) * shift }
	}

	if (bend === 0) {
		const start = fromPointer ? anchor : boundaryPoint(from, to)
		// Pointer arrows take the shortest path, so they run straight when the nodes line up.
		const end = fromPointer ? nearestOutlinePoint(to, anchor) : boundaryPoint(to, anchor)
		// A pointer arrow starts inside its node, so centre the label on the part you can see.
		const visibleStart = fromPointer ? exitPoint(from, start, end) : start
		return {
			d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
			tip: end,
			angle: Math.atan2(end.y - start.y, end.x - start.x),
			labelAt: lerp(visibleStart, end, 0.5),
			points: [start, end],
		}
	}

	const dx = to.x - anchor.x
	const dy = to.y - anchor.y
	const control = { x: (anchor.x + to.x) / 2 + dy * bend, y: (anchor.y + to.y) / 2 - dx * bend }
	const start = fromPointer ? anchor : boundaryPoint(from, control)
	const end = boundaryPoint(to, control)
	return {
		d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
		tip: end,
		angle: Math.atan2(end.y - control.y, end.x - control.x),
		labelAt: quadAt(start, control, end, 0.5),
		points: sample((t) => quadAt(start, control, end, t)),
	}
}

/**
 * An arrow through corners: out of the source's pointer compartment (or its outline), along the
 * corners with rounded turns, into the target's outline (a list's arrow looping back to its head).
 */
function routeVia(from: SceneNode, to: SceneNode, via: readonly Point[], fromPointer: boolean | 'prev'): EdgeRoute {
	const first = via[0]
	const last = via[via.length - 1]
	// Out of a pointer compartment straight along the first leg (in its lane), from where its dot is.
	const anchor = pointerAnchor(from, fromPointer === 'prev')
	const level = Math.abs(first.x - anchor.x) >= Math.abs(first.y - anchor.y)
	const start = fromPointer ? (level ? { x: anchor.x, y: first.y } : { x: first.x, y: anchor.y }) : boundaryPoint(from, first)
	const end = nearestOutlinePoint(to, last)
	const points = [start, ...via, end]
	const r = 10
	let d = `M ${start.x} ${start.y}`
	for (let i = 1; i < points.length - 1; i++) {
		const [a, b, c] = [points[i - 1], points[i], points[i + 1]]
		const into = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2)
		const out = Math.min(r, Math.hypot(c.x - b.x, c.y - b.y) / 2)
		const p = lerp(b, a, into / (Math.hypot(b.x - a.x, b.y - a.y) || 1))
		const q = lerp(b, c, out / (Math.hypot(c.x - b.x, c.y - b.y) || 1))
		d += ` L ${p.x} ${p.y} Q ${b.x} ${b.y} ${q.x} ${q.y}`
	}
	d += ` L ${end.x} ${end.y}`
	// The label (or + button) goes on the middle of the longest stretch.
	const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
	const longest = lengths.indexOf(Math.max(...lengths))
	return {
		d,
		tip: end,
		angle: Math.atan2(end.y - last.y, end.x - last.x),
		labelAt: lerp(points[longest], points[longest + 1], 0.5),
		points,
	}
}

/** A loop above the node, for edges from a node to itself. */
function selfLoop(node: SceneNode): EdgeRoute {
	const r = Math.min(node.w, node.h) / 2
	const start = boundaryPoint(node, { x: node.x - r, y: node.y - r * 1.6 })
	const end = boundaryPoint(node, { x: node.x + r, y: node.y - r * 1.6 })
	const c1 = { x: node.x - r * 1.7, y: node.y - r * 3.4 }
	const c2 = { x: node.x + r * 1.7, y: node.y - r * 3.4 }
	return {
		d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`,
		tip: end,
		angle: Math.atan2(end.y - c2.y, end.x - c2.x),
		labelAt: cubicAt(start, c1, c2, end, 0.5),
		points: sample((t) => cubicAt(start, c1, c2, end, t)),
	}
}

/** Curve for an edge: directed edges that have a reverse twin bow apart, everything else is straight. */
export function bendFor(edge: SceneEdge, edges: readonly SceneEdge[]): number {
	if (!edge.directed || edge.from === edge.to) return 0
	return edges.some((e) => e.directed && e.from === edge.to && e.to === edge.from) ? 0.2 : 0
}

/** Routes for every edge whose endpoints exist, keyed by edge key. */
export function routeScene(scene: Scene): Map<string, EdgeRoute> {
	const nodes = new Map(scene.nodes.map((n) => [n.key, n]))
	const routes = new Map<string, EdgeRoute>()
	for (const edge of scene.edges) {
		const from = nodes.get(edge.from)
		const to = nodes.get(edge.to)
		if (!from || !to) continue
		routes.set(
			edge.key,
			routeEdge(from, to, { bend: edge.bend ?? bendFor(edge, scene.edges), fromPointer: edge.fromPointer, lane: edge.lane, via: edge.via })
		)
	}
	return routes
}

/** Triangle (SVG polygon points) with its tip at `tip`, pointing along `angle`. */
export function arrowHead(tip: Point, angle: number, size: number): string {
	const spread = Math.PI / 7
	const a = { x: tip.x - size * Math.cos(angle - spread), y: tip.y - size * Math.sin(angle - spread) }
	const b = { x: tip.x - size * Math.cos(angle + spread), y: tip.y - size * Math.sin(angle + spread) }
	return `${tip.x},${tip.y} ${a.x},${a.y} ${b.x},${b.y}`
}

/** Box for an edge label of the given text, centred on the label point. */
export function labelBox(at: Point, text: string, fontSize: number): Box {
	const h = fontSize * 1.5
	const w = Math.max(h * 1.4, text.length * fontSize * 0.62 + fontSize * 0.8)
	return { x: at.x - w / 2, y: at.y - h / 2, w, h }
}

export type SpatialDirection = 'left' | 'right' | 'up' | 'down'

/**
 * The candidate nearest to `from` in a direction, within a ~55 degree cone, preferring
 * candidates that are more directly in line.
 */
export function spatialNeighbor<T extends Point>(
	from: Point,
	candidates: readonly T[],
	direction: SpatialDirection
): T | undefined {
	const [ux, uy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[direction]
	let best: T | undefined
	let bestScore = Infinity
	for (const c of candidates) {
		const dx = c.x - from.x
		const dy = c.y - from.y
		const along = dx * ux + dy * uy
		const across = Math.abs(dx * uy - dy * ux)
		if (along <= 1 || across > along * 1.5) continue
		const score = along + across * 2
		if (score < bestScore) {
			bestScore = score
			best = c
		}
	}
	return best
}

/** Where a badge may sit around a node, best first (never below: that's the node's drag handle). */
const BADGE_DIRECTIONS = [
	[-1, -1],
	[1, -1],
	[-1, 0],
	[1, 0],
	[-1, 1],
	[1, 1],
	[0, -1],
].map(([x, y]) => ({ x: x / Math.hypot(x, y), y: y / Math.hypot(x, y) }))

/** Which way from a node to put its badge, so it stays clear of the node's edges and their arrowheads. */
export function badgeDirection(node: SceneNode, scene: Scene): Point {
	const byKey = new Map(scene.nodes.map((n) => [n.key, n]))
	const angles = scene.edges.flatMap((e) => {
		const other = e.from === node.key ? byKey.get(e.to) : e.to === node.key ? byKey.get(e.from) : undefined
		return other && other !== node ? [Math.atan2(other.y - node.y, other.x - node.x)] : []
	})
	const clearance = (d: Point) => {
		const a = Math.atan2(d.y, d.x)
		return Math.min(
			Math.PI,
			...angles.map((b) => {
				const diff = Math.abs(a - b) % (2 * Math.PI)
				return Math.min(diff, 2 * Math.PI - diff)
			})
		)
	}
	// The first spot, in order of preference, that is well clear of every edge; else the clearest.
	const clear = BADGE_DIRECTIONS.find((d) => clearance(d) >= Math.PI / 3)
	if (clear) return clear
	let best = BADGE_DIRECTIONS[0]
	for (const d of BADGE_DIRECTIONS) if (clearance(d) > clearance(best)) best = d
	return best
}
