import { parentOf, subtreeIds } from '../tree/model'
import type { TreeNode } from '../tree/tree-shape-types'

// A general tree's edits, pure: its nodes are a binary tree's `TreeNode`s, children in order with
// no empty slots, so the binary trees' walks (levelOrder, subtreeIds, parentOf) work on them as they are.

/** Remove a node and everything under it; its siblings close up. */
export function removeGeneralSubtree(nodes: readonly TreeNode[], id: string): TreeNode[] {
	const gone = subtreeIds(nodes, id)
	return nodes
		.filter((n) => !gone.has(n.id))
		.map((n) => (n.children.includes(id) ? { ...n, children: n.children.filter((c) => c !== id) } : n))
}

/** An id for a new child: the parent's id and a digit, as sketched nodes have, else made unique. */
function newChildId(nodes: readonly TreeNode[], parentId: string) {
	const taken = new Set(nodes.map((n) => n.id))
	for (let digit = 0; digit < 10; digit++) if (!taken.has(parentId + digit)) return parentId + digit
	let k = 10
	while (taken.has(`${parentId}-${k}`)) k++
	return `${parentId}-${k}`
}

/** A new last child (rightmost) of `parentId`. */
export function appendChild(nodes: readonly TreeNode[], parentId: string, value: string): { nodes: TreeNode[]; id: string } {
	const id = newChildId(nodes, parentId)
	const next = nodes.map((n) => (n.id === parentId ? { ...n, children: [...n.children.filter(Boolean), id] } : n))
	return { nodes: [...next, { id, value, children: [], dx: 0, dy: 0 }], id }
}

/** Where a node sits among its siblings, and how many there are; the root has none. */
export function siblingPlace(nodes: readonly TreeNode[], id: string): { index: number; count: number } | undefined {
	const parent = parentOf(nodes, id)
	if (!parent) return undefined
	const siblings = parent.children.filter(Boolean)
	return { index: siblings.indexOf(id), count: siblings.length }
}

/** Swap a node with its sibling to the left (-1) or right (1), and so their subtrees. */
export function moveAmongSiblings(nodes: readonly TreeNode[], id: string, by: -1 | 1): TreeNode[] {
	const parent = parentOf(nodes, id)
	if (!parent) return [...nodes]
	const children = parent.children.filter(Boolean)
	const i = children.indexOf(id)
	const j = i + by
	if (i < 0 || j < 0 || j >= children.length) return [...nodes]
	;[children[i], children[j]] = [children[j], children[i]]
	return nodes.map((n) => (n === parent ? { ...n, children } : n))
}
