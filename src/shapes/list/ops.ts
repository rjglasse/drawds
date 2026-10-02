import { extendValues, insertValue } from '../../data/fill'
import type { Point } from '../../nodelink/geometry'
import { listBasePosition } from './layout'
import type { ListNode, ListShapeProps } from './list-shape-types'

type ListProps = Pick<ListShapeProps, 'nodes' | 'direction' | 'size' | 'fill' | 'seed'>
type LayoutProps = Pick<ListShapeProps, 'nodes' | 'direction' | 'size'>

/** Next unused numeric node id suffix (node ids are `n0`, `n1`, ...). */
function nextNodeIndex(nodes: readonly ListNode[]) {
	return 1 + Math.max(-1, ...nodes.map((n) => Number(n.id.slice(1))).filter(Number.isFinite))
}

/**
 * The list resized to `count` nodes by adding or removing at the head (`atStart`) or the tail.
 * Existing nodes keep their ids, values and drag offsets; new values follow the fill mode.
 */
export function resizeList({ nodes, fill, seed }: ListProps, count: number, atStart: boolean): ListNode[] {
	if (count <= nodes.length) return atStart ? nodes.slice(nodes.length - count) : nodes.slice(0, count)
	const values = extendValues(
		nodes.map((n) => n.value),
		fill,
		seed,
		count,
		{ atStart }
	)
	const next = nextNodeIndex(nodes)
	const added = count - nodes.length
	const fresh = (value: string, k: number): ListNode => ({ id: `n${next + k}`, value, dx: 0, dy: 0 })
	if (!atStart) return [...nodes, ...values.slice(nodes.length).map(fresh)]
	// New head nodes are numbered from the old head outwards, so a node keeps its id as more are added.
	return [...values.slice(0, added).map((value, i) => fresh(value, added - 1 - i)), ...nodes]
}

/** Insert a node after `afterId`; its value sits between its neighbours per the fill mode. */
export function insertListNode({ nodes, fill, seed }: ListProps, afterId: string): { nodes: ListNode[]; id: string } {
	const i = nodes.findIndex((n) => n.id === afterId)
	if (i < 0) return { nodes: [...nodes], id: '' }
	const index = nextNodeIndex(nodes)
	const value = insertValue(nodes[i].value, nodes[i + 1]?.value, fill, seed, index)
	const node: ListNode = { id: `n${index}`, value, dx: 0, dy: 0 }
	return { nodes: [...nodes.slice(0, i + 1), node, ...nodes.slice(i + 1)], id: node.id }
}

export function removeListNode(nodes: readonly ListNode[], id: string): ListNode[] {
	return nodes.filter((n) => n.id !== id)
}

/**
 * Shape-space shift that keeps the list where it was on the page after its nodes change: the first
 * node of `before` that is still in `after` stays put (normally the head; the next node if the
 * head was removed).
 */
export function anchorShift(before: LayoutProps, after: LayoutProps): Point {
	const anchor = before.nodes.find((n) => after.nodes.some((m) => m.id === n.id))
	const from = anchor && listBasePosition(before, anchor.id)
	const to = anchor && listBasePosition(after, anchor.id)
	return from && to ? { x: from.x - to.x, y: from.y - to.y } : { x: 0, y: 0 }
}
