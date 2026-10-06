import type { TLDefaultSizeStyle } from 'tldraw'
import type { Scene, SceneEdge, SceneNode } from '../../nodelink/scene'
import { getTreeMetrics } from '../tree/layout'
import { childrenOf, type UnionBy } from './union-find'

/**
 * Scene keys: element i is `${i}` (also its mark key), its parent pointer the edge `e${i}` (marks
 * `edge:e${i}`), its parent cell `p${i}` and its size / rank cell `w${i}`.
 */
export const elementKey = (i: number) => String(i)
export const edgeKey = (i: number) => `e${i}`
export const parentKey = (i: number) => `p${i}`
export const weightKey = (i: number) => `w${i}`

/** The element a node or cell key refers to (`3`, `p3`, `w3`), if any. */
export function elementOfKey(key: string): number | undefined {
	const m = /^[pw]?(\d+)$/.exec(key)
	return m ? Number(m[1]) : undefined
}

type UnionFindLayoutProps = {
	labels: readonly string[]
	parent: readonly number[]
	sizes: readonly number[]
	ranks: readonly number[]
	unionBy: UnionBy
	size: TLDefaultSizeStyle
}

/**
 * Where each element of a forest goes: trees side by side in the order of their roots, each a tidy
 * n-ary tree (a parent centred over its children, children in index order). `x` from the forest's
 * left edge, `depth` in levels; `width` the whole forest's.
 */
export function forestPositions(parent: readonly number[], nodeW: number, sep: number, treeGap: number) {
	const children = childrenOf(parent)
	const widths = new Map<number, number>()
	const widthOf = (i: number): number => {
		const kids = children[i]
		const w = Math.max(nodeW, kids.reduce((s, c) => s + widthOf(c), 0) + sep * Math.max(0, kids.length - 1))
		widths.set(i, w)
		return w
	}
	const x: number[] = parent.map(() => 0)
	const depth: number[] = parent.map(() => 0)
	const place = (i: number, left: number, d: number) => {
		depth[i] = d
		const kids = children[i]
		if (!kids.length) {
			x[i] = left + widths.get(i)! / 2
			return
		}
		const span = kids.reduce((s, c) => s + widths.get(c)!, 0) + sep * (kids.length - 1)
		let at = left + (widths.get(i)! - span) / 2
		for (const c of kids) {
			place(c, at, d + 1)
			at += widths.get(c)! + sep
		}
		x[i] = (x[kids[0]] + x[kids[kids.length - 1]]) / 2
	}
	const roots = parent.flatMap((p, i) => (p === i ? [i] : []))
	let left = 0
	for (const [k, r] of roots.entries()) {
		widthOf(r)
		place(r, left, 0)
		left += widths.get(r)! + (k < roots.length - 1 ? treeGap : 0)
	}
	return { x, depth, width: left }
}

/**
 * The forest drawn as trees (each element pointing at its parent, roots at the top), centred over
 * the parent array: element indices, then `parent[i]`, then (union by size or rank) `size[i]` or
 * `rank[i]`, each row titled on its left. The array starts at x = 0, so it holds still as sets merge.
 */
export function unionFindScene({ labels, parent, sizes, ranks, unionBy, size }: UnionFindLayoutProps): Scene {
	const m = getTreeMetrics(size)
	const metrics = { fontSize: m.fontSize, labelFontSize: m.labelFontSize, strokeWidth: m.strokeWidth }
	const n = parent.length
	if (!n) return { nodes: [], edges: [], metrics }
	const { cell, diameter, levelH, labelFontSize } = m
	const forest = forestPositions(parent, diameter, cell * 0.5, cell * 0.9)
	const left = (n * cell - forest.width) / 2
	const nodes: SceneNode[] = parent.map((_, i) => ({
		key: elementKey(i),
		kind: 'circle',
		x: left + forest.x[i],
		y: diameter / 2 + forest.depth[i] * levelH,
		w: diameter,
		h: diameter,
		value: labels[i] ?? String(i),
		editable: true,
		draggable: false,
	}))
	const edges: SceneEdge[] = parent.flatMap((p, i) => (p === i ? [] : [{ key: edgeKey(i), from: elementKey(i), to: elementKey(p), directed: true }]))

	const bottom = Math.max(...forest.depth) * levelH + diameter
	const indexY = bottom + cell * 0.75
	const parentY = indexY + labelFontSize * 0.9 + cell / 2
	const weightY = parentY + cell
	const label = (key: string, value: string, x: number, y: number): SceneNode => ({
		key,
		kind: 'label',
		x,
		y,
		w: Math.max(cell * 0.5, value.length * labelFontSize * 0.62),
		h: labelFontSize * 1.4,
		value,
		editable: false,
		draggable: false,
	})
	const cellNode = (key: string, value: string, i: number, y: number, editable: boolean): SceneNode => ({
		key,
		kind: 'box',
		x: i * cell + cell / 2,
		y,
		w: cell,
		h: cell,
		value,
		editable,
		draggable: false,
	})
	// Row titles sit left of the array, right-aligned against it (labels are drawn centred).
	const title = (key: string, value: string, y: number) => {
		const w = Math.max(cell * 0.5, value.length * labelFontSize * 0.62)
		return label(key, value, -cell * 0.25 - w / 2, y)
	}
	const weights = unionBy === 'naive' ? undefined : unionBy === 'size' ? sizes : ranks
	parent.forEach((p, i) => {
		nodes.push(label(`#i${i}`, String(i), i * cell + cell / 2, indexY))
		nodes.push(cellNode(parentKey(i), String(p), i, parentY, true))
		if (weights) nodes.push(cellNode(weightKey(i), String(weights[i] ?? ''), i, weightY, false))
	})
	nodes.push(title('#index', 'i', indexY), title('#parent', 'parent', parentY))
	if (weights) nodes.push(title('#weight', unionBy, weightY))
	return { nodes, edges, metrics }
}

/** Centre of element 0 (layout coordinates); the sketch tool keeps it under the drag origin. */
export function firstElementCentre(props: UnionFindLayoutProps) {
	const node = unionFindScene(props).nodes.find((n) => n.key === elementKey(0))
	return node ? { x: node.x, y: node.y } : { x: 0, y: 0 }
}
