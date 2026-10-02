import { compareKeys } from '../../data/compare'
import { addChild, byId, parentOf, removeSubtree } from './model'
import type { TreeNode } from './tree-shape-types'

/** Nodes in in-order (left, node, right) from the root, nodes[0]. */
export function inOrder(nodes: readonly TreeNode[]): TreeNode[] {
	const index = byId(nodes)
	const out: TreeNode[] = []
	const visit = (id: string | null, seen: Set<string>) => {
		const n = id ? index.get(id) : undefined
		if (!n || seen.has(n.id)) return
		seen.add(n.id)
		visit(n.children[0] ?? null, seen)
		out.push(n)
		visit(n.children[1] ?? null, seen)
	}
	if (nodes.length) visit(nodes[0].id, new Set())
	return out
}

/** Any tree shape becomes a valid BST by giving it sorted values in in-order. */
export function assignInOrder(nodes: readonly TreeNode[], values: readonly string[]): TreeNode[] {
	const sorted = [...values].sort(compareKeys)
	const valueOf = new Map(inOrder(nodes).map((n, i) => [n.id, sorted[i] ?? n.value]))
	return nodes.map((n) => ({ ...n, value: valueOf.get(n.id) ?? n.value }))
}

/**
 * Nodes that break the BST ordering: each node must lie strictly between the bounds its ancestors
 * set (so a deep node on the wrong side of its grandparent is caught, not just of its parent).
 */
export function bstViolations(nodes: readonly TreeNode[]): Set<string> {
	const index = byId(nodes)
	const bad = new Set<string>()
	const visit = (id: string | null, lo: string | undefined, hi: string | undefined, seen: Set<string>) => {
		const n = id ? index.get(id) : undefined
		if (!n || seen.has(n.id)) return
		seen.add(n.id)
		if ((lo !== undefined && compareKeys(n.value, lo) <= 0) || (hi !== undefined && compareKeys(n.value, hi) >= 0)) bad.add(n.id)
		visit(n.children[0] ?? null, lo, n.value, seen)
		visit(n.children[1] ?? null, n.value, hi, seen)
	}
	if (nodes.length) visit(nodes[0].id, undefined, undefined, new Set())
	return bad
}

export interface BstInsert {
	/** Nodes compared on the way down, root first. */
	path: string[]
	/** Set when the key is already in the tree (nothing is inserted). */
	found?: string
	/** The new node's id, and the tree with it. */
	id?: string
	nodes: TreeNode[]
}

/** Insert a key: walk down comparing, and hang a new node in the empty slot where the walk ends. */
export function bstInsert(nodes: readonly TreeNode[], key: string): BstInsert {
	const index = byId(nodes)
	const path: string[] = []
	let node = nodes[0]
	while (node) {
		path.push(node.id)
		const cmp = compareKeys(key, node.value)
		if (cmp === 0) return { path, found: node.id, nodes: [...nodes] }
		const slot = cmp < 0 ? 0 : 1
		const next = node.children[slot]
		if (!next || !index.has(next)) {
			const added = addChild(nodes, node.id, slot, key)
			return { path, id: added.id, nodes: added.nodes }
		}
		node = index.get(next)!
	}
	return { path, nodes: [...nodes] }
}

export interface BstDelete {
	/** Which textbook case applied. */
	kind: 'leaf' | 'one-child' | 'two-children'
	/** Two children: the in-order successor, the path down to it from the right child, and its value. */
	successor?: string
	path: string[]
	nodes: TreeNode[]
}

/** Replace node `id` in its parent's slot (or as root) by `replacement`, dropping `id`. */
function splice(nodes: readonly TreeNode[], id: string, replacement: string): TreeNode[] {
	const parent = parentOf(nodes, id)
	const rest = nodes
		.filter((n) => n.id !== id)
		.map((n) => (parent && n.id === parent.id ? { ...n, children: n.children.map((c) => (c === id ? replacement : c)) } : n))
	if (parent) return rest
	// The root was spliced out: its child becomes the root, which must come first.
	return [rest.find((n) => n.id === replacement)!, ...rest.filter((n) => n.id !== replacement)]
}

/**
 * Delete a node, BST style: a leaf just goes; a node with one child is replaced by it; a node
 * with two children takes its in-order successor's value (leftmost of its right subtree), and the
 * successor, which has no left child, is removed instead.
 */
export function bstDelete(nodes: readonly TreeNode[], id: string): BstDelete {
	const index = byId(nodes)
	const node = index.get(id)
	if (!node) return { kind: 'leaf', path: [], nodes: [...nodes] }
	const kids = node.children.filter((c): c is string => !!c && index.has(c))
	if (kids.length === 0) return { kind: 'leaf', path: [], nodes: removeSubtree(nodes, id) }
	if (kids.length === 1) return { kind: 'one-child', path: [], nodes: splice(nodes, id, kids[0]) }

	const path: string[] = []
	let s = index.get(node.children[1]!)!
	path.push(s.id)
	while (s.children[0] && index.has(s.children[0])) {
		s = index.get(s.children[0])!
		path.push(s.id)
	}
	const withValue = nodes.map((n) => (n.id === id ? { ...n, value: s.value } : n))
	const right = s.children[1]
	const rest = right && index.has(right) ? splice(withValue, s.id, right) : removeSubtree(withValue, s.id)
	return { kind: 'two-children', successor: s.id, path, nodes: rest }
}
