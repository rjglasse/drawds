import type { TreeNode } from './tree-shape-types'

export const LEFT = 0
export const RIGHT = 1

export function byId(nodes: readonly TreeNode[]) {
	return new Map(nodes.map((n) => [n.id, n]))
}

/** Nodes reachable from the root (nodes[0]) in breadth-first (level) order. */
export function levelOrder(nodes: readonly TreeNode[]): TreeNode[] {
	const index = byId(nodes)
	const out: TreeNode[] = []
	const queue = nodes.length ? [nodes[0]] : []
	while (queue.length) {
		const node = queue.shift()!
		out.push(node)
		for (const child of node.children) {
			const c = child && index.get(child)
			if (c) queue.push(c)
		}
	}
	return out
}

export function subtreeIds(nodes: readonly TreeNode[], id: string): Set<string> {
	const index = byId(nodes)
	const out = new Set<string>()
	const stack = [id]
	while (stack.length) {
		const n = index.get(stack.pop()!)
		if (!n || out.has(n.id)) continue
		out.add(n.id)
		for (const c of n.children) if (c) stack.push(c)
	}
	return out
}

/** Remove a node and everything under it, and empty its parent's slot. */
export function removeSubtree(nodes: readonly TreeNode[], id: string): TreeNode[] {
	const gone = subtreeIds(nodes, id)
	return nodes
		.filter((n) => !gone.has(n.id))
		.map((n) => (n.children.includes(id) ? { ...n, children: n.children.map((c) => (c === id ? null : c)) } : n))
}

/** An id for a new child: the parent's id plus L / R, made unique if that's taken. */
export function childId(nodes: readonly TreeNode[], parentId: string, slot: number) {
	const taken = new Set(nodes.map((n) => n.id))
	const base = parentId + (slot === LEFT ? 'L' : 'R')
	let id = base
	for (let k = 2; taken.has(id); k++) id = `${base}${k}`
	return id
}

/** Put a new node in an empty child slot. */
export function addChild(
	nodes: readonly TreeNode[],
	parentId: string,
	slot: number,
	value: string
): { nodes: TreeNode[]; id: string } {
	const id = childId(nodes, parentId, slot)
	const child: TreeNode = { id, value, children: [null, null], dx: 0, dy: 0 }
	const next = nodes.map((n) => {
		if (n.id !== parentId) return n
		const children = [...n.children]
		while (children.length <= slot) children.push(null)
		children[slot] = id
		return { ...n, children }
	})
	return { nodes: [...next, child], id }
}

export function parentOf(nodes: readonly TreeNode[], id: string): TreeNode | undefined {
	return nodes.find((n) => n.children.includes(id))
}

/** Swap a node's left and right children, and so their subtrees (a lone child changes sides). */
export function swapChildren(nodes: readonly TreeNode[], id: string): TreeNode[] {
	return nodes.map((n) => (n.id === id ? { ...n, children: [n.children[RIGHT] ?? null, n.children[LEFT] ?? null] } : n))
}

/**
 * Mirror a node's subtree: every node in it swaps its children, so it reads right to left. A
 * node dragged sideways below it moves to the other side too; the node itself stays where it is.
 */
export function mirrorSubtree(nodes: readonly TreeNode[], id: string): TreeNode[] {
	const inside = subtreeIds(nodes, id)
	return nodes.map((n) =>
		inside.has(n.id)
			? { ...n, children: [n.children[RIGHT] ?? null, n.children[LEFT] ?? null], dx: n.id === id ? n.dx : -n.dx }
			: n
	)
}
