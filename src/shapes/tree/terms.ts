import type { MarkColor, Marks } from '../../cells/marks'
import { edgeCellKey } from '../../nodelink/scene'
import { byId } from './model'
import type { TreeNode } from './tree-shape-types'

// Lecture 8a's terms, worked out from the tree: the root (no parent), internal nodes (with a
// child), leaves (none); each node's depth (edges up to the root: the root's is 0) and height (edges
// down to its deepest leaf: a leaf's is 0; counting nodes instead adds one, as the lecture's other
// convention does), and the tree's height, its root's. Pure.

export type NodeTerm = 'root' | 'internal' | 'leaf'

/** The colours the terms are drawn in: the root red, internal nodes blue, leaves green. */
export const TERM_COLORS: Record<NodeTerm, MarkColor> = { root: 'red', internal: 'blue', leaf: 'green' }

export interface TreeTerms {
	term: Map<string, NodeTerm>
	depth: Map<string, number>
	height: Map<string, number>
	parent: Map<string, string>
	/** How many levels (the deepest depth + 1). */
	levels: number
	counts: { nodes: number; internal: number; leaves: number }
}

export function treeTerms(nodes: readonly TreeNode[]): TreeTerms {
	const index = byId(nodes)
	const term = new Map<string, NodeTerm>()
	const depth = new Map<string, number>()
	const height = new Map<string, number>()
	const parent = new Map<string, string>()
	const visit = (id: string, d: number): number => {
		depth.set(id, d)
		const kids = (index.get(id)?.children ?? []).filter((c): c is string => !!c && index.has(c) && !depth.has(c))
		for (const c of kids) parent.set(c, id)
		const h = kids.length ? 1 + Math.max(...kids.map((c) => visit(c, d + 1))) : 0
		height.set(id, h)
		term.set(id, d === 0 ? 'root' : kids.length ? 'internal' : 'leaf')
		return h
	}
	if (nodes.length) visit(nodes[0].id, 0)
	const kinds = [...term.entries()]
	const children = (id: string) => (index.get(id)?.children ?? []).some((c) => !!c && index.has(c))
	return {
		term,
		depth,
		height,
		parent,
		levels: depth.size ? Math.max(...depth.values()) + 1 : 0,
		// As lecture 8 sorts them: the root, internal nodes below it, leaves (a lone root is a leaf too).
		counts: {
			nodes: term.size,
			internal: kinds.filter(([, t]) => t === 'internal').length,
			leaves: kinds.filter(([id, t]) => t === 'leaf' || (t === 'root' && !children(id))).length,
		},
	}
}

/** The terms as tints: each node in its term's colour. */
export const termMarks = (terms: TreeTerms): Marks => Object.fromEntries([...terms.term].map(([id, t]) => [id, TERM_COLORS[t]]))

/** The summary under the legend: how many nodes of each kind, and the height in both conventions. */
export function termsSummary(terms: TreeTerms): string {
	const { nodes, internal, leaves } = terms.counts
	if (!nodes) return 'No nodes: an empty tree'
	const h = terms.levels - 1
	const leafs = `${leaves} lea${leaves === 1 ? 'f' : 'ves'}`
	const kinds = nodes === 1 ? 'the root, also a leaf' : `the root, ${internal} internal, ${leafs}`
	return `${nodes} node${nodes === 1 ? '' : 's'}: ${kinds}. Height ${h} (edges down, a leaf 0), or ${h + 1} counting levels`
}

/**
 * Pointing at a node: its path from the root (orange, edges and the nodes on it) and its subtree's
 * edges (green), the subtree being the node and everything below it.
 */
export function pathAndSubtree(nodes: readonly TreeNode[], key: string): Marks {
	const terms = treeTerms(nodes)
	if (!terms.depth.has(key)) return {}
	const out: Record<string, MarkColor> = {}
	for (let at = key; terms.parent.has(at); at = terms.parent.get(at)!) {
		const up = terms.parent.get(at)!
		out[edgeCellKey(`${up}->${at}`)] = 'orange'
		out[up] = 'orange'
	}
	out[key] = 'orange'
	const below = [...terms.parent].filter(([, p]) => p !== undefined)
	const inSubtree = new Set([key])
	// Parents come before children in the map (a pre-order visit), so one pass collects the subtree.
	for (const [child, p] of below) if (inSubtree.has(p)) inSubtree.add(child)
	for (const [child, p] of below) if (inSubtree.has(p)) out[edgeCellKey(`${p}->${child}`)] = 'green'
	return out
}
