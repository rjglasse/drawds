import type { TLDefaultSizeStyle } from 'tldraw'
import type { SketchState } from '../../sketch/line-sketch'
import { CELL_SIZES } from '../sizes'
import type { ArrayDirection } from './array-shape-types'

export interface ArrayMetrics {
	cell: number
	/** Space reserved for index labels: below a horizontal array, left of a vertical one. */
	gutter: number
	fontSize: number
	indexFontSize: number
	strokeWidth: number
}

export function getArrayMetrics({
	size,
	showIndices,
}: {
	size: TLDefaultSizeStyle
	showIndices: boolean
}): ArrayMetrics {
	const cell = CELL_SIZES[size]
	return {
		cell,
		gutter: showIndices ? Math.round(cell * 0.5) : 0,
		fontSize: cell * 0.42,
		indexFontSize: Math.max(10, cell * 0.26),
		strokeWidth: Math.max(1.5, cell / 24),
	}
}

export interface ArrayLayout {
	width: number
	height: number
	/** The rectangle holding the cells, in shape space. */
	cells: { x: number; y: number; w: number; h: number }
	/** Top-left corner of cell i, in shape space. */
	cellAt(i: number): { x: number; y: number }
	/** Centre of the index label for cell i, in shape space. */
	indexAt(i: number): { x: number; y: number }
}

export function getArrayLayout(
	count: number,
	direction: ArrayDirection,
	{ cell, gutter }: ArrayMetrics
): ArrayLayout {
	const n = Math.max(1, count)
	if (direction === 'horizontal') {
		return {
			width: n * cell,
			height: cell + gutter,
			cells: { x: 0, y: 0, w: n * cell, h: cell },
			cellAt: (i) => ({ x: i * cell, y: 0 }),
			indexAt: (i) => ({ x: i * cell + cell / 2, y: cell + gutter / 2 }),
		}
	}
	return {
		width: gutter + cell,
		height: n * cell,
		cells: { x: gutter, y: 0, w: cell, h: n * cell },
		cellAt: (i) => ({ x: gutter, y: i * cell }),
		indexAt: (i) => ({ x: gutter / 2, y: i * cell + cell / 2 }),
	}
}

/** Centre of the grow grip: where the next cell would go, in shape space. */
export function getArrayGrowPoint(count: number, direction: ArrayDirection, metrics: ArrayMetrics) {
	const { x, y } = getArrayLayout(count, direction, metrics).cellAt(count)
	return { x: x + metrics.cell / 2, y: y + metrics.cell / 2 }
}

/** Top-left of the shape (page space) so that the first sketched cell stays centred on `origin`. */
export function getSketchPosition(
	origin: { x: number; y: number },
	{ direction, sign, count }: SketchState,
	{ cell, gutter }: ArrayMetrics
): { x: number; y: number } {
	const half = cell / 2
	const back = sign < 0 ? (count - 1) * cell : 0
	return direction === 'horizontal'
		? { x: origin.x - half - back, y: origin.y - half }
		: { x: origin.x - half - gutter, y: origin.y - half - back }
}
