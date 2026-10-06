import type { TLDefaultSizeStyle } from 'tldraw'
import type { Point } from '../../nodelink/geometry'
import type { Scene, SceneNode } from '../../nodelink/scene'
import { getTreeMetrics, treeScene } from '../tree/layout'
import type { TreeNode } from '../tree/tree-shape-types'
import { childIndices } from './heap'

/** Scene keys: tree node i is `${i}` (also the mark key); array cell i is `a${i}`. */
export const arrayKey = (i: number) => `a${i}`

/** The index a tree node or array cell key refers to. */
export function indexOfKey(key: string): number | undefined {
	const i = Number(key.startsWith('a') ? key.slice(1) : key)
	return Number.isInteger(i) && i >= 0 ? i : undefined
}

/** The implicit complete tree of a heap array. */
export function heapTreeNodes(values: readonly string[]): TreeNode[] {
	return values.map((value, i) => ({
		id: String(i),
		value,
		children: childIndices(i).map((c) => (c < values.length ? String(c) : null)),
		dx: 0,
		dy: 0,
	}))
}

type HeapLayoutProps = { values: readonly string[]; size: TLDefaultSizeStyle }

/** The heap drawn twice: as a tidy tree (its root at x = 0), and as its backing array (with indices) centred below. */
export function heapScene({ values, size }: HeapLayoutProps): Scene {
	const m = getTreeMetrics(size)
	const tree = treeScene({ nodes: heapTreeNodes(values), nulls: 'hide', size })
	const nodes: SceneNode[] = tree.nodes.map((n) => ({ ...n, draggable: false }))
	if (!nodes.length) return tree

	const bottom = Math.max(...nodes.map((n) => n.y + n.h / 2))
	const centre = (Math.min(...nodes.map((n) => n.x)) + Math.max(...nodes.map((n) => n.x))) / 2
	const y = bottom + m.cell * 0.9 + m.cell / 2
	const x0 = centre - ((values.length - 1) * m.cell) / 2
	values.forEach((value, i) => {
		const x = x0 + i * m.cell
		nodes.push({ key: arrayKey(i), kind: 'box', x, y, w: m.cell, h: m.cell, value, editable: true, draggable: false })
		nodes.push({
			key: `#index${i}`,
			kind: 'label',
			x,
			y: y + m.cell / 2 + m.labelFontSize,
			w: m.cell,
			h: m.labelFontSize * 1.4,
			value: String(i),
			editable: false,
			draggable: false,
		})
	})

	// The root stays at x = 0, as the tree's: a heap gaining a level grows both ways and its root holds still.
	const minY = Math.min(...nodes.map((n) => n.y - n.h / 2))
	return { ...tree, nodes: nodes.map((n) => ({ ...n, y: n.y - minY })) }
}

/** Centre of the root (layout coordinates); the sketch tool keeps it under the drag origin. */
export function heapRootCentre(props: HeapLayoutProps): Point {
	const root = heapScene(props).nodes.find((n) => n.key === '0')
	return root ? { x: root.x, y: root.y } : { x: 0, y: 0 }
}
