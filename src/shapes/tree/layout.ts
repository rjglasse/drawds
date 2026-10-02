import type { TLDefaultSizeStyle } from 'tldraw'
import type { Point } from '../../nodelink/geometry'
import type { Scene, SceneEdge, SceneNode } from '../../nodelink/scene'
import { CELL_SIZES } from '../sizes'
import { byId } from './model'
import type { TreeShapeProps } from './tree-shape-types'

export function getTreeMetrics(size: TLDefaultSizeStyle) {
	const cell = CELL_SIZES[size]
	const labelFontSize = Math.max(10, cell * 0.28)
	return {
		cell,
		/** Node circle diameter. */
		diameter: cell,
		/** Vertical distance between levels; also the drag distance per new level when sketching. */
		levelH: cell * 1.6,
		/** Minimum distance between sibling centres. */
		minSep: cell * 1.6,
		/**
		 * How far a lone child sits to its own side. Well under half of minSep, so it stays clearly
		 * under its parent rather than under the gap between its parent and an uncle.
		 */
		lone: cell * 0.55,
		/** Minimum gap between neighbouring subtrees. */
		gap: cell * 0.5,
		fontSize: cell * 0.42,
		labelFontSize,
		strokeWidth: Math.max(1.5, cell / 24),
		nullW: labelFontSize * 3,
		nullH: labelFontSize * 1.6,
	}
}

type Metrics = ReturnType<typeof getTreeMetrics>
type LayoutProps = Pick<TreeShapeProps, 'nodes' | 'nulls' | 'size'>

/** Key of the null marker drawn in an empty slot. */
export const nullKey = (parent: string, slot: number) => `#null:${parent}:${slot}`

/** A node of the tree being laid out: a real node, or a null marker in an empty slot. */
interface Item {
	key: string
	parent?: string
	kind: 'circle' | 'null'
	w: number
	h: number
	value: string
	children: (Item | null)[]
}

/** Horizontal extent of a subtree at each depth below its root, relative to the root's centre. */
interface Contour {
	left: number[]
	right: number[]
}

function buildItems({ nodes, nulls }: LayoutProps, m: Metrics): Item | null {
	const index = byId(nodes)
	const seen = new Set<string>()
	const visit = (id: string): Item => {
		seen.add(id)
		const node = index.get(id)!
		const children = [0, 1].map((slot): Item | null => {
			const c = node.children[slot]
			if (c && index.has(c) && !seen.has(c)) return { ...visit(c), parent: id }
			if (nulls !== 'show') return null
			return { key: nullKey(id, slot), parent: id, kind: 'null', w: m.nullW, h: m.nullH, value: 'null', children: [] }
		})
		return { key: id, kind: 'circle', w: m.diameter, h: m.diameter, value: node.value, children }
	}
	return nodes.length ? visit(nodes[0].id) : null
}

/**
 * Tidy layout (in the spirit of Reingold-Tilford): place each subtree, then push sibling subtrees
 * apart just enough that their contours keep `gap` between them at every depth. A lone child goes
 * a little to its own side (`lone`), so left and right children stay distinguishable.
 * Records each child's horizontal offset from its parent in `offsets`.
 */
function place(item: Item, offsets: Map<Item, number>, m: Metrics): Contour {
	const [left, right] = [item.children[0] ?? null, item.children[1] ?? null]
	const cl = left && place(left, offsets, m)
	const cr = right && place(right, offsets, m)
	let offL = 0
	let offR = 0
	if (cl && cr) {
		let need = m.minSep
		const shared = Math.min(cl.right.length, cr.left.length)
		for (let d = 0; d < shared; d++) need = Math.max(need, cl.right[d] - cr.left[d] + m.gap)
		offL = -need / 2
		offR = need / 2
	} else if (cl) offL = -m.lone
	else if (cr) offR = m.lone
	if (left) offsets.set(left, offL)
	if (right) offsets.set(right, offR)

	const contour: Contour = { left: [-item.w / 2], right: [item.w / 2] }
	const depth = Math.max(cl?.left.length ?? 0, cr?.left.length ?? 0)
	for (let d = 0; d < depth; d++) {
		contour.left.push(
			Math.min(cl && d < cl.left.length ? cl.left[d] + offL : Infinity, cr && d < cr.left.length ? cr.left[d] + offR : Infinity)
		)
		contour.right.push(
			Math.max(cl && d < cl.right.length ? cl.right[d] + offL : -Infinity, cr && d < cr.right.length ? cr.right[d] + offR : -Infinity)
		)
	}
	return contour
}

/** Every node (and null marker) at its automatic position, with the scene's top-left at (0, 0). */
function baseScene(props: LayoutProps): Scene {
	const m = getTreeMetrics(props.size)
	const metrics = { fontSize: m.fontSize, labelFontSize: m.labelFontSize, strokeWidth: m.strokeWidth }
	const root = buildItems(props, m)
	if (!root) return { nodes: [], edges: [], metrics }

	const offsets = new Map<Item, number>()
	place(root, offsets, m)
	const nodes: SceneNode[] = []
	const edges: SceneEdge[] = []
	const visit = (item: Item, x: number, level: number) => {
		nodes.push({
			key: item.key,
			kind: item.kind,
			x,
			y: level * m.levelH,
			w: item.w,
			h: item.h,
			value: item.value,
			editable: item.kind === 'circle',
			draggable: item.kind === 'circle',
		})
		if (item.parent) edges.push({ key: `${item.parent}->${item.key}`, from: item.parent, to: item.key, directed: false })
		for (const child of item.children) if (child) visit(child, x + offsets.get(child)!, level + 1)
	}
	visit(root, 0, 0)

	const minX = Math.min(...nodes.map((n) => n.x - n.w / 2))
	const minY = Math.min(...nodes.map((n) => n.y - n.h / 2))
	return { nodes: nodes.map((n) => ({ ...n, x: n.x - minX, y: n.y - minY })), edges, metrics }
}

/** The tree's scene: the automatic layout plus each node's drag offset; null markers follow their parent. */
export function treeScene(props: LayoutProps): Scene {
	const scene = baseScene(props)
	const index = byId(props.nodes)
	const parentOf = new Map(scene.edges.map((e) => [e.to, e.from]))
	return {
		...scene,
		nodes: scene.nodes.map((n) => {
			const owner = index.get(n.kind === 'null' ? parentOf.get(n.key)! : n.key)
			return owner && (owner.dx || owner.dy) ? { ...n, x: n.x + owner.dx, y: n.y + owner.dy } : n
		}),
	}
}

/** Where a node sits with no drag offset, in shape space. */
export function treeBasePosition(props: LayoutProps, key: string): Point | undefined {
	const node = baseScene(props).nodes.find((n) => n.key === key)
	return node && { x: node.x, y: node.y }
}

/** Centre of the root with no drag offset; the sketch tool keeps this under the drag origin. */
export function treeRootCentre(props: LayoutProps): Point {
	return (props.nodes[0] && treeBasePosition(props, props.nodes[0].id)) ?? { x: 0, y: 0 }
}
