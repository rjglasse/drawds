import type { MarkColor } from '../../cells/marks'
import type { Frame } from '../../nodelink/playback'
import { edgeCellKey, type Scene, type SceneEdge } from '../../nodelink/scene'
import { byId, levelOrder } from '../tree/model'
import type { TreeNode } from '../tree/tree-shape-types'

// Left-child, right-sibling (Knuth; CLRS 10.4): any tree is a binary tree in disguise. Each node keeps
// one link down, to its first child (its left), and gets one across, to its next sibling (its right);
// the links to its other children go. Pre-order then visits the binary tree as it did the general
// tree, and in-order as post-order did. Pure.

const LEFT: MarkColor = 'green'
const RIGHT: MarkColor = 'orange'
const CURRENT: MarkColor = 'red'

const kids = (n: TreeNode) => n.children.filter((c): c is string => !!c)

/** The scene key of the arrow from a node to its next sibling. */
export const siblingEdgeKey = (from: string, to: string) => `sib:${from}->${to}`

/**
 * The general tree as a binary tree: each node's left its first child, its right its next sibling.
 * Ids are binary paths (`n`, `nL`, `nLR`...), as a sketched binary tree's are; values as they were.
 */
export function leftChildRightSibling(nodes: readonly TreeNode[]): TreeNode[] {
	if (!nodes.length) return []
	const index = byId(nodes)
	const out: TreeNode[] = []
	// Pre-order: a node, its children's chain (left), then its siblings' (right).
	const place = (id: string, binary: string, next: string | undefined) => {
		const node = index.get(id)!
		const [first] = kids(node)
		const self: TreeNode = { id: binary, value: node.value, children: [first ? `${binary}L` : null, next ? `${binary}R` : null], dx: 0, dy: 0 }
		out.push(self)
		if (first) chain(kids(node), `${binary}L`)
		return self
	}
	// Siblings in order: each the right of the one before.
	const chain = (siblings: string[], binary: string) => {
		siblings.forEach((id, i) => place(id, binary + 'R'.repeat(i), siblings[i + 1]))
	}
	place(nodes[0].id, 'n', undefined)
	return out
}

/**
 * The conversion step by step on the general tree as it is drawn (`scene`, its layout): node by node in
 * level order, its first child's edge kept (green: its left), its other children's edges fading out,
 * and an arrow from each child to the next (orange: its right).
 */
export function lcrsSteps(nodes: readonly TreeNode[], scene: Scene): Frame[] {
	const parents = levelOrder(nodes).filter((n) => kids(n).length)
	const value = (id: string) => byId(nodes).get(id)?.value || id
	const done = new Set<string>()
	/** The scene once the nodes in `done` are converted, `now`'s old edges still drawn (to fade out). */
	const sceneAt = (now?: string): Scene => {
		const edges: SceneEdge[] = []
		for (const edge of scene.edges) {
			const parent = nodes.find((n) => n.id === edge.from)
			const first = parent && kids(parent)[0] === edge.to
			if (first || !done.has(edge.from) || edge.from === now) edges.push(edge)
		}
		for (const p of parents.filter((n) => done.has(n.id))) {
			const children = kids(p)
			children.slice(1).forEach((c, i) => edges.push({ key: siblingEdgeKey(children[i], c), from: children[i], to: c, directed: true }))
		}
		return { ...scene, edges }
	}
	const frames: Frame[] = [
		{
			scene: sceneAt(),
			caption: 'Left child, right sibling: every node keeps a link to its first child (its left) and gets one to its next sibling (its right)',
			ask: false,
		},
	]
	let previous: string | undefined
	for (const p of parents) {
		done.add(p.id)
		const children = kids(p)
		const [first, ...rest] = children
		const flash: Record<string, MarkColor | null> = {
			[p.id]: CURRENT,
			...(previous ? { [previous]: null } : {}),
			[edgeCellKey(`${p.id}->${first}`)]: LEFT,
			...Object.fromEntries(rest.map((c, i) => [edgeCellKey(siblingEdgeKey(children[i], c)), RIGHT])),
		}
		const rights = rest.map((c, i) => `${value(c)} is ${value(children[i])}'s right`).join(', ')
		frames.push({
			scene: sceneAt(p.id),
			flash,
			dim: rest.map((c) => edgeCellKey(`${p.id}->${c}`)),
			caption: `${value(p.id)}: ${value(first)}, its first child, is its left${rights ? `; ${rights} (the next sibling)` : ` (its only child)`}`,
			ask: `${value(p.id)}'s children: which one is its left, and what are the others' rights?`,
			askFocus: [p.id],
			line: 'link',
			vars: { node: value(p.id) },
		})
		previous = p.id
	}
	frames.push({
		scene: sceneAt(),
		flash: previous ? { [previous]: null } : {},
		caption:
			'At most two links a node: left, its first child, and right, its next sibling. A binary tree, drawn beside it: pre-order visits it as it does the general tree, in-order as post-order does',
		ask: false,
	})
	return frames
}
