import { GRAPH_MIN_GAP, GRAPH_SPACING } from './generate'
import type { GraphNode } from './graph-shape-types'
import type { GraphModel } from './model'

// Re-laying out a drawn graph (dds-55z.19.2): round a circle, or tidied by forces from where its
// nodes are. Both keep the graph centred where it was (its shape moves so nothing else shifts), in
// cell units, and depend on nothing but the graph, so the same graph always lands the same way.

const centre = (points: readonly { x: number; y: number }[]) => ({
	x: points.reduce((s, p) => s + p.x, 0) / points.length,
	y: points.reduce((s, p) => s + p.y, 0) / points.length,
})

const round = (v: number) => Math.round(v * 100) / 100

/**
 * The nodes round a circle in their order (A at the top, then clockwise), neighbours on the circle
 * GRAPH_SPACING apart (as a complete graph's sketch puts them), centred where they were.
 */
export function circleLayout(nodes: readonly GraphNode[]): GraphNode[] {
	const n = nodes.length
	if (n < 2) return [...nodes]
	const r = GRAPH_SPACING / (2 * Math.sin(Math.PI / n))
	const c = centre(nodes)
	return nodes.map((node, k) => {
		const angle = -Math.PI / 2 + (2 * Math.PI * k) / n
		return { ...node, x: round(c.x + r * Math.cos(angle)), y: round(c.y + r * Math.sin(angle)) }
	})
}

/**
 * Tidied by forces (Fruchterman and Reingold's), from where the nodes are: every pair pushes apart,
 * each edge pulls its ends together, and a little pull to its middle holds each piece together. The
 * steps shrink each round to nothing, so it settles; then it is scaled so its edges average
 * GRAPH_SPACING, as a sketch's do (no two nodes nearer than GRAPH_MIN_GAP). A
 * graph in pieces has each piece tidied on its own, then the pieces set in a row, a spacing apart,
 * in the order they were from left to right; the whole centred where the graph was.
 */
export function tidyLayout({ nodes, edges }: GraphModel, rounds = 300): GraphNode[] {
	if (nodes.length < 2) return [...nodes]
	const index = new Map(nodes.map((node, i) => [node.id, i]))
	const links = edges.flatMap((e) => {
		const [a, b] = [index.get(e.from), index.get(e.to)]
		return a === undefined || b === undefined || a === b ? [] : [[a, b] as const]
	})
	// The pieces: nodes joined by edges, in the order they lie from left to right.
	const parent = nodes.map((_, i) => i)
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
	for (const [a, b] of links) parent[find(a)] = find(b)
	const byRoot = new Map<number, number[]>()
	nodes.forEach((_, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), i]))
	const pieces = [...byRoot.values()].sort((p, q) => centre(p.map((i) => nodes[i])).x - centre(q.map((i) => nodes[i])).x)
	const at = nodes.map((node) => ({ x: node.x, y: node.y }))
	let right = 0
	for (const [k, piece] of pieces.entries()) {
		const local = new Map(piece.map((i, j) => [i, j]))
		const settled = settle(
			piece.map((i) => at[i]),
			links.filter(([a]) => local.has(a)).map(([a, b]) => [local.get(a)!, local.get(b)!] as const),
			rounds
		)
		// Side by side: this piece's left edge a spacing past the last one's right.
		const left = Math.min(...settled.map((p) => p.x))
		const dx = k === 0 ? 0 : right + GRAPH_SPACING - left
		piece.forEach((i, j) => (at[i] = { x: settled[j].x + dx, y: settled[j].y }))
		right = Math.max(...piece.map((i) => at[i].x))
	}
	const shift = { x: centre(nodes).x - centre(at).x, y: centre(nodes).y - centre(at).y }
	return nodes.map((node, i) => ({ ...node, x: round(at[i].x + shift.x), y: round(at[i].y + shift.y) }))
}

/** One piece settled by the forces, from `start`, its `links` by position. */
function settle(start: readonly { x: number; y: number }[], links: readonly (readonly [number, number])[], rounds: number) {
	const n = start.length
	const k = GRAPH_SPACING
	// Nodes on top of each other have no direction to part in: nudge each its own small way.
	const at = start.map((p, i) => ({ x: p.x + 1e-3 * Math.cos(i), y: p.y + 1e-3 * Math.sin(i) }))
	for (let r = 0; r < rounds; r++) {
		const push = at.map(() => ({ x: 0, y: 0 }))
		const middle = centre(at)
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				const dx = at[i].x - at[j].x
				const dy = at[i].y - at[j].y
				const d = Math.max(0.01, Math.hypot(dx, dy))
				const f = (k * k) / d / d
				push[i].x += dx * f
				push[i].y += dy * f
				push[j].x -= dx * f
				push[j].y -= dy * f
			}
			push[i].x -= (at[i].x - middle.x) * 0.05
			push[i].y -= (at[i].y - middle.y) * 0.05
		}
		for (const [a, b] of links) {
			const dx = at[a].x - at[b].x
			const dy = at[a].y - at[b].y
			const f = Math.max(0.01, Math.hypot(dx, dy)) / k
			push[a].x -= dx * f
			push[a].y -= dy * f
			push[b].x += dx * f
			push[b].y += dy * f
		}
		// The most a node moves this round: from a spacing down to nothing.
		const most = k * (1 - r / rounds)
		for (let i = 0; i < n; i++) {
			const length = Math.hypot(push[i].x, push[i].y)
			if (length < 1e-9) continue
			const step = Math.min(length, most)
			at[i].x += (push[i].x / length) * step
			at[i].y += (push[i].y / length) * step
		}
	}
	// Pushing every pair apart stretches the edges past a spacing: scale back so they average one,
	// never bringing two nodes closer than a sketch's gap.
	if (!links.length) return at
	const mean = links.reduce((sum, [a, b]) => sum + Math.hypot(at[a].x - at[b].x, at[a].y - at[b].y), 0) / links.length
	let nearest = Infinity
	for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) nearest = Math.min(nearest, Math.hypot(at[i].x - at[j].x, at[i].y - at[j].y))
	const scale = Math.max(k / mean, GRAPH_MIN_GAP / nearest)
	const c = centre(at)
	return at.map((p) => ({ x: c.x + (p.x - c.x) * scale, y: c.y + (p.y - c.y) * scale }))
}
