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
	/**
	 * Two children: lecture 8b's 3.1 (the successor is the right child) or 3.2 (it is further down,
	 * the leftmost of the right subtree).
	 */
	twoChildren?: '3.1' | '3.2'
	/** Two children: the in-order successor, and the path down to it from the right child. */
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
 * Delete a node, BST style: a leaf just goes; a node with one child is replaced by it; a node with
 * two children is replaced by its in-order successor (the leftmost of its right subtree), relinked
 * as lecture 8b does, no keys copied: 3.1, the successor is its right child: it moves up, the
 * deleted node's left subtree its left. 3.2, the successor is further down: its right subtree takes
 * its place, then it moves up with both of the deleted node's subtrees.
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
	const [left, right] = node.children
	const deep = path.length > 1
	const sParent = deep ? path[path.length - 2] : undefined
	const sRight = s.children[1] && index.has(s.children[1]) ? s.children[1] : null
	const parent = parentOf(nodes, id)
	const relinked = nodes
		.filter((n) => n.id !== id)
		.map((n) => {
			// The successor takes the deleted node's subtrees (3.1 keeps its own right one).
			if (n.id === s.id) return { ...n, children: [left, deep ? right : n.children[1]] }
			// 3.2: the successor's right subtree takes its place, as its parent's left child.
			if (n.id === sParent) return { ...n, children: [sRight, n.children[1]] }
			if (parent && n.id === parent.id) return { ...n, children: n.children.map((c) => (c === id ? s.id : c)) }
			return n
		})
	// The root was deleted: the successor is the root now, and comes first.
	const out = parent ? relinked : [relinked.find((n) => n.id === s.id)!, ...relinked.filter((n) => n.id !== s.id)]
	return { kind: 'two-children', twoChildren: deep ? '3.2' : '3.1', successor: s.id, path, nodes: out }
}
