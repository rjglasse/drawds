import { moveAmongSiblings, removeGeneralSubtree } from '../shapes/general-tree/model'
import type { TreeNode } from '../shapes/tree/tree-shape-types'

// A general tree's moves, as its transcript keeps them (as `tree-moves.ts` for binary trees). A node is
// named by its path from the root: the child indexes taken, '1.0' for root.children[1].children[0],
// '' the root. Nodes have ids, so a change is told exactly, and each move a change could be is checked
// by making it with the tree's own edits (`src/shapes/general-tree/model.ts`).

/** A general tree as the transcript writes it: a node's value and its children, in order. */
export interface GeneralTree {
	v: string
	c: GeneralTree[]
}

/** The child indexes from the root, joined by dots; '' is the root. */
export type GeneralPath = string

export type GeneralTreeMove =
	| { op: 'new'; name: string; tree: GeneralTree }
	| { op: 'set'; path: GeneralPath; v: string }
	/** A new last child, at `path` (its parent's path and its index). */
	| { op: 'add'; path: GeneralPath; v: string }
	/** The subtree at `path` out, its siblings closing up (`v`: its root's value). */
	| { op: 'remove'; path: GeneralPath; v: string }
	/** The node at `path` swaps two of its children, `i` and `j` (one moved left or right). */
	| { op: 'swap'; path: GeneralPath; i: number; j: number }
	| { op: 'assign'; tree: GeneralTree }

type Nodes = readonly Pick<TreeNode, 'id' | 'value' | 'children'>[]

const kids = (n: Pick<TreeNode, 'children'>) => n.children.filter((c): c is string => !!c)

/** The child indexes in a path. */
export const indexesOf = (path: GeneralPath): number[] => (path ? path.split('.').map(Number) : [])

/** Whether two trees are the same nodes, values and children, in order (where they are drawn aside). */
export function sameGeneralTree(a: Nodes, b: Nodes): boolean {
	if (a.length !== b.length || (a.length && a[0].id !== b[0].id)) return false
	const index = new Map(b.map((n) => [n.id, n]))
	return a.every((n) => {
		const m = index.get(n.id)
		if (!m || m.value !== n.value) return false
		const [x, y] = [kids(n), kids(m)]
		return x.length === y.length && x.every((c, i) => c === y[i])
	})
}

/** The path from the root to node `id`. */
export function generalPathOf(nodes: Nodes, id: string): GeneralPath {
	const parent = new Map<string, [string, number]>()
	for (const n of nodes) kids(n).forEach((c, i) => parent.set(c, [n.id, i]))
	const out: number[] = []
	for (let at = parent.get(id); at; at = parent.get(at[0])) out.unshift(at[1])
	return out.join('.')
}

/** The tree as the transcript writes it, from the root. */
export function generalShapeOf(nodes: Nodes): GeneralTree {
	const index = new Map(nodes.map((n) => [n.id, n]))
	const seen = new Set<string>()
	const build = (id: string): GeneralTree => {
		seen.add(id)
		const n = index.get(id)!
		return { v: n.value, c: kids(n).filter((c) => index.has(c) && !seen.has(c)).map(build) }
	}
	return nodes.length ? build(nodes[0].id) : { v: '', c: [] }
}

/**
 * The moves that take a tree from `prev` to `next`: values set, a last child added, a subtree
 * removed, a node moved among its siblings; else the new tree all at once (sketched again).
 */
export function diffGeneralTree(prev: Nodes, next: Nodes): GeneralTreeMove[] {
	if (sameGeneralTree(prev, next)) return []
	const before = new Set(prev.map((n) => n.id))
	const after = new Set(next.map((n) => n.id))
	const added = next.filter((n) => !before.has(n.id))
	const gone = prev.filter((n) => !after.has(n.id))
	const index = new Map(next.map((n) => [n.id, n]))
	if (!added.length && !gone.length) {
		const linked = prev.every((n) => {
			const [x, y] = [kids(n), kids(index.get(n.id)!)]
			return x.length === y.length && x.every((c, i) => c === y[i])
		})
		if (linked)
			return prev.flatMap((n): GeneralTreeMove[] =>
				index.get(n.id)!.value === n.value ? [] : [{ op: 'set', path: generalPathOf(next, n.id), v: index.get(n.id)!.value }]
			)
		// One node moved left or right among its siblings.
		for (const n of prev) {
			for (const by of [-1, 1] as const) {
				if (!sameGeneralTree(moveAmongSiblings(prev as TreeNode[], n.id, by), next)) continue
				const path = generalPathOf(prev, n.id)
				const i = indexesOf(path).at(-1)!
				const parent = path.split('.').slice(0, -1).join('.')
				return [{ op: 'swap', path: parent, i: Math.min(i, i + by), j: Math.max(i, i + by) }]
			}
		}
	}
	if (added.length === 1 && !gone.length && sameGeneralTree(removeGeneralSubtree(next as TreeNode[], added[0].id), prev)) {
		const parent = next.find((n) => kids(n).includes(added[0].id))
		if (parent && kids(parent).at(-1) === added[0].id) return [{ op: 'add', path: generalPathOf(next, added[0].id), v: added[0].value }]
	}
	if (!added.length && gone.length) {
		// The subtree's root: the one gone node whose parent stays.
		const tops = gone.filter((n) => !prev.some((p) => !after.has(p.id) && kids(p).includes(n.id)))
		if (tops.length === 1 && sameGeneralTree(removeGeneralSubtree(prev as TreeNode[], tops[0].id), next)) {
			return [{ op: 'remove', path: generalPathOf(prev, tops[0].id), v: tops[0].value }]
		}
	}
	return [{ op: 'assign', tree: generalShapeOf(next) }]
}
