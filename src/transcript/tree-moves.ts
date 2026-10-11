import { mirrorSubtree, removeSubtree, swapChildren } from '../shapes/tree/model'
import type { TreeNode } from '../shapes/tree/tree-shape-types'

// A binary tree's moves, as its transcript keeps them (as `array-moves.ts` for arrays). A node is
// named by its path from the root ('LR': root.left.right), as a teacher points at one. Its nodes have
// ids, so a change is told exactly, and each move a change could be is checked by making it with
// the tree's own edits (`src/shapes/tree/model.ts`): what it says is what was done.

/** A tree as the transcript writes it: a node's value and its two subtrees (null: empty). */
export type TreeShape = { v: string; l: TreeShape; r: TreeShape } | null

/** A path from the root: L and R, '' for the root itself. */
export type Path = string

export type TreeMove =
	| { op: 'new'; name: string; tree: TreeShape }
	| { op: 'set'; path: Path; v: string }
	/** A new leaf, at `path`. */
	| { op: 'add'; path: Path; v: string }
	/** The subtree at `path` out (`v`: its root's value). */
	| { op: 'remove'; path: Path; v: string }
	/** The node at `path` swaps its two children. */
	| { op: 'swap'; path: Path }
	/** The subtree at `path` mirrored: every node in it swaps its children. */
	| { op: 'mirror'; path: Path }
	| { op: 'assign'; tree: TreeShape }
	/**
	 * An operation played step by step and put in: its algorithm's call, `args` what can be told of
	 * its parameters from what it did (the key it put in, the node it took out), else its effect.
	 */
	| { op: 'call'; algorithm: string; label: string; effect: TreeMove[]; args?: { key?: string; node?: Path } }

type Nodes = readonly Pick<TreeNode, 'id' | 'value' | 'children'>[]

const childrenOf = (n: Pick<TreeNode, 'children'>) => [n.children[0] ?? null, n.children[1] ?? null]

/** Whether two trees are the same nodes, values and links (where they are drawn aside). */
export function sameTree(a: Nodes, b: Nodes): boolean {
	if (a.length !== b.length || (a.length && a[0].id !== b[0].id)) return false
	const index = new Map(b.map((n) => [n.id, n]))
	return a.every((n) => {
		const m = index.get(n.id)
		if (!m || m.value !== n.value) return false
		const [x, y] = [childrenOf(n), childrenOf(m)]
		return x[0] === y[0] && x[1] === y[1]
	})
}

/** The path from the root to node `id`. */
export function pathOf(nodes: Nodes, id: string): Path {
	const parent = new Map<string, [string, 'L' | 'R']>()
	for (const n of nodes) childrenOf(n).forEach((c, slot) => c && parent.set(c, [n.id, slot ? 'R' : 'L']))
	let path = ''
	for (let at = parent.get(id); at; at = parent.get(at[0])) path = at[1] + path
	return path
}

/** The tree as the transcript writes it, from the root. */
export function shapeOf(nodes: Nodes): TreeShape {
	const index = new Map(nodes.map((n) => [n.id, n]))
	const build = (id: string | null): TreeShape => {
		const n = id === null ? undefined : index.get(id)
		if (!n) return null
		const [l, r] = childrenOf(n)
		return { v: n.value, l: build(l), r: build(r) }
	}
	return nodes.length ? build(nodes[0].id) : null
}

/** What can be told of an operation's parameters from what it did: the one key put in, the one node taken out. */
export function treeArgs(prev: Nodes, next: Nodes): { key?: string; node?: Path } {
	const before = new Set(prev.map((n) => n.id))
	const after = new Set(next.map((n) => n.id))
	const added = next.filter((n) => !before.has(n.id))
	const gone = prev.filter((n) => !after.has(n.id))
	return {
		...(added.length === 1 ? { key: added[0].value } : {}),
		...(gone.length === 1 ? { node: pathOf(prev, gone[0].id) } : {}),
	}
}

/**
 * The moves that take a tree from `prev` to `next`: values set, a leaf added, a subtree removed, a
 * node's children swapped, a subtree mirrored; else the new tree all at once.
 */
export function diffTree(prev: Nodes, next: Nodes): TreeMove[] {
	if (sameTree(prev, next)) return []
	const before = new Set(prev.map((n) => n.id))
	const after = new Set(next.map((n) => n.id))
	const added = next.filter((n) => !before.has(n.id))
	const gone = prev.filter((n) => !after.has(n.id))
	const index = new Map(next.map((n) => [n.id, n]))
	if (!added.length && !gone.length) {
		const linked = prev.every((n) => {
			const [x, y] = [childrenOf(n), childrenOf(index.get(n.id)!)]
			return x[0] === y[0] && x[1] === y[1]
		})
		if (linked) return prev.flatMap((n): TreeMove[] => (index.get(n.id)!.value === n.value ? [] : [{ op: 'set', path: pathOf(next, n.id), v: index.get(n.id)!.value }]))
		// One node's children swapped, or its subtree mirrored (the nearer the root, the more it says).
		for (const n of prev) {
			if (sameTree(swapChildren(prev as TreeNode[], n.id), next)) return [{ op: 'swap', path: pathOf(prev, n.id) }]
			if (sameTree(mirrorSubtree(prev as TreeNode[], n.id), next)) return [{ op: 'mirror', path: pathOf(prev, n.id) }]
		}
	}
	if (added.length === 1 && !gone.length && sameTree(removeSubtree(next as TreeNode[], added[0].id), prev)) {
		return [{ op: 'add', path: pathOf(next, added[0].id), v: added[0].value }]
	}
	if (!added.length && gone.length) {
		// The subtree's root: the one gone node whose parent stays.
		const tops = gone.filter((n) => !prev.some((p) => !after.has(p.id) && childrenOf(p).includes(n.id)))
		if (tops.length === 1 && sameTree(removeSubtree(prev as TreeNode[], tops[0].id), next)) {
			return [{ op: 'remove', path: pathOf(prev, tops[0].id), v: tops[0].value }]
		}
	}
	return [{ op: 'assign', tree: shapeOf(next) }]
}
