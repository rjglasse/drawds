import type { Point } from '../../nodelink/geometry'
import { edgeCellKey, type Scene, type SceneEdge, type SceneNode } from '../../nodelink/scene'
import { getTreeMetrics, nodeSize, termAnnotations, type TreeMetrics } from '../tree/layout'
import { byId } from '../tree/model'
import type { TreeNode } from '../tree/tree-shape-types'
import type { GeneralTreeShapeProps } from './general-tree-shape-types'

type LayoutProps = Pick<GeneralTreeShapeProps, 'nodes' | 'size'> & Partial<Pick<GeneralTreeShapeProps, 'terms'>>

/** What can carry a mark: each node, and each edge down to a child (`edge:<parent>-><child>`). */
export function generalTreeMarkKeys(nodes: readonly TreeNode[]): string[] {
	return [...nodes.map((n) => n.id), ...nodes.flatMap((n) => n.children.flatMap((c) => (c ? [edgeCellKey(`${n.id}->${c}`)] : [])))]
}

interface Item {
	id: string
	value: string
	w: number
	h: number
	fontScale?: number
	children: Item[]
}

/** Horizontal extent of a subtree at each depth below its root, relative to the root's centre. */
interface Contour {
	left: number[]
	right: number[]
}

function buildItems(nodes: readonly TreeNode[], m: TreeMetrics): Item | null {
	const index = byId(nodes)
	const seen = new Set<string>()
	const visit = (id: string): Item => {
		seen.add(id)
		const node = index.get(id)!
		const children: Item[] = []
		for (const c of node.children) if (c && index.has(c) && !seen.has(c)) children.push(visit(c))
		return { id, value: node.value, ...nodeSize(node.value, m), children }
	}
	return nodes.length ? visit(nodes[0].id) : null
}

const shifted = (c: Contour, by: number): Contour => ({ left: c.left.map((x) => x + by), right: c.right.map((x) => x + by) })
const mirrored = (c: Contour): Contour => ({ left: c.right.map((x) => -x), right: c.left.map((x) => -x) })

/** Two contours as one, `b` already placed. */
function merged(a: Contour, b: Contour): Contour {
	const depth = Math.max(a.left.length, b.left.length)
	const out: Contour = { left: [], right: [] }
	for (let d = 0; d < depth; d++) {
		out.left.push(Math.min(a.left[d] ?? Infinity, b.left[d] ?? Infinity))
		out.right.push(Math.max(a.right[d] ?? -Infinity, b.right[d] ?? -Infinity))
	}
	return out
}

/**
 * Siblings packed left to right: each as far left as the subtrees before it allow (`gap` between
 * contours at every depth, centres `minSep` apart). Positions from the first sibling's centre.
 */
function packed(contours: readonly Contour[], m: TreeMetrics): number[] {
	const pos = [0]
	let placed = contours[0]
	for (let i = 1; i < contours.length; i++) {
		let at = pos[i - 1] + m.minSep
		const shared = Math.min(placed.right.length, contours[i].left.length)
		for (let d = 0; d < shared; d++) at = Math.max(at, placed.right[d] - contours[i].left[d] + m.gap)
		pos.push(at)
		placed = merged(placed, shifted(contours[i], at))
	}
	return pos
}

const centred = (pos: readonly number[]) => {
	const mid = (pos[0] + pos[pos.length - 1]) / 2
	return pos.map((p) => p - mid)
}

/**
 * Tidy layout for any number of children (Reingold-Tilford's idea, as the binary trees use): each
 * subtree placed, then its children packed against each other from the left and again from the
 * right, and the two averaged, so a small subtree between two big ones sits midway rather than
 * crowding one side (each packing keeps every gap, so their average does too). A parent is centred
 * over its first and last child; a lone child sits right under it, a general tree having no sides.
 * Records each child's offset from its parent in `offsets`.
 */
function place(item: Item, offsets: Map<Item, number>, m: TreeMetrics): Contour {
	const contour: Contour = { left: [-item.w / 2], right: [item.w / 2] }
	if (!item.children.length) return contour
	const contours = item.children.map((child) => place(child, offsets, m))
	const fromLeft = centred(packed(contours, m))
	const fromRight = centred(packed([...contours].reverse().map(mirrored), m))
		.map((p) => -p)
		.reverse()
	const pos = fromLeft.map((p, i) => (p + fromRight[i]) / 2)
	let below: Contour = { left: [], right: [] }
	item.children.forEach((child, i) => {
		offsets.set(child, pos[i])
		below = merged(below, shifted(contours[i], pos[i]))
	})
	return { left: [...contour.left, ...below.left], right: [...contour.right, ...below.right] }
}

/**
 * Every node at its automatic position: the root at x = 0, the top at y = 0. A tree that widens
 * grows both ways from its root, so the root holds still on the page (the shape moves by its layout
 * offset), during an operation's steps too.
 */
function baseScene(props: LayoutProps): Scene {
	const m = getTreeMetrics(props.size)
	const metrics = { fontSize: m.fontSize, labelFontSize: m.labelFontSize, strokeWidth: m.strokeWidth }
	const root = buildItems(props.nodes, m)
	if (!root) return { nodes: [], edges: [], metrics }

	const offsets = new Map<Item, number>()
	place(root, offsets, m)
	const nodes: SceneNode[] = []
	const edges: SceneEdge[] = []
	const visit = (item: Item, x: number, level: number, parent?: string) => {
		nodes.push({
			key: item.id,
			kind: 'circle',
			x,
			y: level * m.levelH,
			w: item.w,
			h: item.h,
			value: item.value,
			editable: true,
			draggable: true,
			...(item.fontScale ? { fontScale: item.fontScale } : {}),
		})
		if (parent) edges.push({ key: `${parent}->${item.id}`, from: parent, to: item.id, directed: false })
		for (const child of item.children) visit(child, x + offsets.get(child)!, level + 1, item.id)
	}
	visit(root, 0, 0)

	// The tree's own top, so annotations above it don't move it.
	const minY = Math.min(...nodes.map((n) => n.y - n.h / 2))
	const all = props.terms ? [...nodes, ...termAnnotations(props, nodes, m)] : nodes
	return { nodes: all.map((n) => ({ ...n, y: n.y - minY })), edges, metrics }
}

/** The tree's scene: the automatic layout plus each node's drag offset. */
export function generalTreeScene(props: LayoutProps): Scene {
	const scene = baseScene(props)
	const index = byId(props.nodes)
	return {
		...scene,
		nodes: scene.nodes.map((n) => {
			const node = index.get(n.key)
			return node && (node.dx || node.dy) ? { ...n, x: n.x + node.dx, y: n.y + node.dy } : n
		}),
	}
}

/** Where a node sits with no drag offset, in layout coordinates. */
export function generalTreeBasePosition(props: LayoutProps, key: string): Point | undefined {
	const node = baseScene(props).nodes.find((n) => n.key === key)
	return node && { x: node.x, y: node.y }
}

/** Centre of the root with no drag offset (layout coordinates); the sketch tool keeps this under the drag origin. */
export function generalTreeRootCentre(props: LayoutProps): Point {
	return (props.nodes[0] && generalTreeBasePosition(props, props.nodes[0].id)) ?? { x: 0, y: 0 }
}
