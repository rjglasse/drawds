import type { TLDefaultSizeStyle } from 'tldraw'
import type { Scene, SceneEdge, SceneNode } from '../../nodelink/scene'
import { CELL_SIZES } from '../sizes'
import { bucketKey, chainNodeKeys, entriesOf, isTombstone, slotKey } from './hash'
import type { HashShapeProps } from './hash-shape-types'

/** Keys of the annotation nodes: bucket indices `i<n>`, and the load line under the table. */
export const indexKey = (i: number) => `i${i}`
export const LOAD_KEY = '#load'

export function getHashMetrics(size: TLDefaultSizeStyle) {
	const cell = CELL_SIZES[size]
	const pointerW = cell * 0.5
	return {
		cell,
		pointerW,
		/** A chained entry: [key | next]; a probing slot is wider, for key:value entries. */
		nodeW: cell * 1.3 + pointerW,
		nodeH: cell * 0.8,
		slotW: cell * 1.9,
		gap: cell * 0.75,
		indexW: cell * 0.6,
		fontSize: cell * 0.42,
		labelFontSize: Math.max(10, cell * 0.28),
		strokeWidth: Math.max(1.5, cell / 24),
	}
}

type LayoutProps = Pick<HashShapeProps, 'buckets' | 'strategy' | 'size'>

/**
 * The table as a scene: bucket indices down the left, then the buckets one under another. Chaining:
 * each bucket is a pointer cell whose chain of [key | next] nodes runs to the right. Probing: each
 * slot holds its key (a deleted one shows ×). The load factor is written underneath.
 */
export function hashScene({ buckets, strategy, size }: LayoutProps): Scene {
	const m = getHashMetrics(size)
	const nodes: SceneNode[] = []
	const edges: SceneEdge[] = []
	const label = (key: string, x: number, y: number, value: string, w: number): SceneNode => ({
		key,
		kind: 'label',
		x,
		y,
		w,
		h: m.labelFontSize * 1.6,
		value,
		editable: false,
		draggable: false,
	})
	const column = m.indexW
	const rowY = (i: number) => (i + 0.5) * m.cell
	buckets.forEach((bucket, i) => {
		nodes.push(label(indexKey(i), m.indexW / 2, rowY(i), String(i), m.indexW))
		if (strategy === 'probing') {
			const entry = bucket[0]
			nodes.push({
				key: slotKey(i),
				kind: 'box',
				x: column + m.slotW / 2,
				y: rowY(i),
				w: m.slotW,
				h: m.cell,
				value: entry === undefined ? '' : isTombstone(entry) ? '×' : entry,
				editable: !isTombstone(entry),
				draggable: false,
			})
		}
	})
	if (strategy === 'chaining') {
		const keys = chainNodeKeys(buckets)
		buckets.forEach((chain, i) => {
			const bucketX = column + m.pointerW / 2
			nodes.push({
				key: bucketKey(i),
				kind: 'list-node',
				x: bucketX,
				y: rowY(i),
				w: m.pointerW,
				h: m.cell,
				value: '',
				pointer: { side: 'right', width: m.pointerW },
				editable: false,
				draggable: false,
			})
			chain.forEach((entry, j) => {
				nodes.push({
					key: keys[i][j],
					kind: 'list-node',
					x: column + m.pointerW + m.gap + m.nodeW / 2 + j * (m.nodeW + m.gap),
					y: rowY(i),
					w: m.nodeW,
					h: m.nodeH,
					value: entry,
					pointer: { side: 'right', width: m.pointerW },
					editable: true,
					draggable: false,
				})
				edges.push({ key: `${j ? keys[i][j - 1] : bucketKey(i)}->`, from: j ? keys[i][j - 1] : bucketKey(i), to: keys[i][j], directed: true, fromPointer: true })
			})
		})
	}
	const width = strategy === 'probing' ? m.slotW : m.pointerW
	const n = entriesOf(buckets).length
	const text = `n = ${n}, m = ${buckets.length}, load ${(n / buckets.length).toFixed(2)}`
	const loadW = text.length * m.labelFontSize * 0.6
	nodes.push(label(LOAD_KEY, column + Math.max(width, loadW) / 2, buckets.length * m.cell + m.labelFontSize * 1.2, text, loadW))
	return { nodes, edges, metrics: { fontSize: m.fontSize, labelFontSize: m.labelFontSize, strokeWidth: m.strokeWidth } }
}
