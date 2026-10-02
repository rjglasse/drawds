import { nodeBox, type EdgeRoute, type Point } from './geometry'
import type { SceneNode } from './scene'

function segmentDistance(p: Point, a: Point, b: Point) {
	const dx = b.x - a.x
	const dy = b.y - a.y
	const len2 = dx * dx + dy * dy
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
	return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

/**
 * The node whose box, grown by `reach` on every side, contains `p` (the closest centre wins).
 * Growing the box keeps a node "hovered" while the pointer travels to its corner button.
 */
export function hoveredNode(nodes: readonly SceneNode[], p: Point, reach: number): string | undefined {
	let best: string | undefined
	let bestDistance = Infinity
	for (const node of nodes) {
		const box = nodeBox(node)
		const inside =
			p.x >= box.x - reach && p.x <= box.x + box.w + reach && p.y >= box.y - reach && p.y <= box.y + box.h + reach
		const distance = Math.hypot(p.x - node.x, p.y - node.y)
		if (inside && distance < bestDistance) {
			best = node.key
			bestDistance = distance
		}
	}
	return best
}

/** The edge nearest `p` (its path or its mid-point button), if within `reach`. */
export function hoveredEdge(routes: ReadonlyMap<string, EdgeRoute>, keys: readonly string[], p: Point, reach: number) {
	let best: string | undefined
	let bestDistance = reach
	for (const key of keys) {
		const route = routes.get(key)
		if (!route) continue
		let distance = Math.hypot(p.x - route.labelAt.x, p.y - route.labelAt.y)
		for (let i = 1; i < route.points.length; i++) {
			distance = Math.min(distance, segmentDistance(p, route.points[i - 1], route.points[i]))
		}
		if (distance <= bestDistance) {
			best = key
			bestDistance = distance
		}
	}
	return best
}
