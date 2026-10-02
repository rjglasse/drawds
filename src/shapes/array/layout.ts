import type { TLDefaultSizeStyle } from 'tldraw'
import type { Point } from '../../nodelink/geometry'
import { POINTER_FONT_SCALE, pointerReach } from '../../pointers/layout'
import type { Pointer } from '../../pointers/pointers'
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
	/**
	 * Where the array starts in shape space: room above for pointers (beside a vertical array they
	 * go on the right), and one cell before for a pointer at index -1, so nothing is drawn left of
	 * or above the shape's origin.
	 */
	origin: Point
}

export function getArrayMetrics({
	size,
	showIndices,
	direction = 'horizontal',
	pointers = [],
}: {
	size: TLDefaultSizeStyle
	showIndices: boolean
	direction?: ArrayDirection
	pointers?: readonly Pointer[]
}): ArrayMetrics {
	const cell = CELL_SIZES[size]
	const fontSize = cell * 0.42
	const before = pointers.some((p) => p.at === '-1') ? cell : 0
	const above = direction === 'horizontal' && pointers.length ? pointerReach(fontSize * POINTER_FONT_SCALE) : 0
	return {
		cell,
		gutter: showIndices ? Math.round(cell * 0.5) : 0,
		fontSize,
		indexFontSize: Math.max(10, cell * 0.26),
		strokeWidth: Math.max(1.5, cell / 24),
		origin: direction === 'horizontal' ? { x: before, y: above } : { x: 0, y: before },
	}
}

export interface ArrayLayout {
	/** Size of the array itself (cells and indices), which starts at the metrics' origin. */
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
	{ cell, gutter, origin }: ArrayMetrics
): ArrayLayout {
	const n = Math.max(1, count)
	const { x: ox, y: oy } = origin
	if (direction === 'horizontal') {
		return {
			width: n * cell,
			height: cell + gutter,
			cells: { x: ox, y: oy, w: n * cell, h: cell },
			cellAt: (i) => ({ x: ox + i * cell, y: oy }),
			indexAt: (i) => ({ x: ox + i * cell + cell / 2, y: oy + cell + gutter / 2 }),
		}
	}
	return {
		width: gutter + cell,
		height: n * cell,
		cells: { x: ox + gutter, y: oy, w: cell, h: n * cell },
		cellAt: (i) => ({ x: ox + gutter, y: oy + i * cell }),
		indexAt: (i) => ({ x: ox + gutter / 2, y: oy + i * cell + cell / 2 }),
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
