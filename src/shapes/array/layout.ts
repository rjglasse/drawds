import type { TLDefaultSizeStyle } from 'tldraw'
import type { Point } from '../../nodelink/geometry'
import { POINTER_FONT_SCALE, pointerReach } from '../../pointers/layout'
import type { Pointer } from '../../pointers/pointers'
import type { SketchState } from '../../sketch/line-sketch'
import { CELL_SIZES } from '../sizes'
import type { ArrayDirection, ArrayKind, ArraySizing } from './array-shape-types'
import { arrayAxis, arrayMarkers, type ArrayAxis } from './kinds'

export interface ArrayMetrics {
	/** How the cells run: along a row, down a column, or up a column (a stack, index 0 at the bottom). */
	axis: ArrayAxis
	cell: number
	/** Space reserved for index labels: below a horizontal array, left of a vertical one. */
	gutter: number
	fontSize: number
	indexFontSize: number
	strokeWidth: number
	/** Room under the array for "size 5 · capacity 8" (fixed capacity only). */
	footer: number
	/**
	 * Where index 0's cell starts in shape space. Room is made above for pointers (beside a vertical
	 * array they go on the right) and for a pointer one past the start (index -1: before a row, above
	 * a column) or, upright, past the top, so nothing is drawn left of or above the shape's origin. An
	 * upright array's cells stack up from here, so it moves as cells come and go, keeping index 0 put.
	 */
	origin: Point
}

export function getArrayMetrics({
	size,
	showIndices,
	direction = 'horizontal',
	pointers = [],
	sizing = 'grows',
	kind = 'array',
	used,
	front,
	values = [],
}: {
	size: TLDefaultSizeStyle
	showIndices: boolean
	direction?: ArrayDirection
	pointers?: readonly Pointer[]
	sizing?: ArraySizing
	kind?: ArrayKind
	used?: number
	front?: number
	values?: readonly string[]
}): ArrayMetrics {
	const axis = arrayAxis({ kind, direction })
	const cell = CELL_SIZES[size]
	const fontSize = cell * 0.42
	// The structure's own markers (a stack's top, a queue's front and rear) take room like pointers.
	const all = [...pointers, ...arrayMarkers({ kind, sizing, used, front, values })]
	const n = Math.max(1, values.length)
	const before = all.some((p) => p.at === '-1') ? cell : 0
	const above = axis === 'horizontal' && all.length ? pointerReach(fontSize * POINTER_FONT_SCALE) : 0
	const pastTop = all.some((p) => p.at === String(values.length)) ? cell : 0
	const indexFontSize = Math.max(10, cell * 0.26)
	return {
		axis,
		cell,
		gutter: showIndices ? Math.round(cell * 0.5) : 0,
		fontSize,
		indexFontSize,
		strokeWidth: Math.max(1.5, cell / 24),
		footer: sizing === 'fixed' ? Math.round(indexFontSize * 1.9) : 0,
		origin:
			axis === 'horizontal' ? { x: before, y: above } : axis === 'vertical' ? { x: 0, y: before } : { x: 0, y: pastTop + (n - 1) * cell },
	}
}

export interface ArrayLayout {
	/** Size of the array itself (cells, indices, footer). */
	width: number
	height: number
	/** Where the array itself (cells, indices, footer) lies, in shape space. */
	box: { x: number; y: number; w: number; h: number }
	/** The rectangle holding the cells, in shape space. */
	cells: { x: number; y: number; w: number; h: number }
	/** Top-left corner of cell i, in shape space. */
	cellAt(i: number): { x: number; y: number }
	/** Centre of the index label for cell i, in shape space. */
	indexAt(i: number): { x: number; y: number }
	/**
	 * The line between cells k - 1 and k: its x for a row, its y for a column (upright: the bottom
	 * of cell k, which is the top of cell k - 1).
	 */
	boundaryAt(k: number): number
	/** Left end of the footer line ("size 5 · capacity 8"), vertically centred. */
	footerAt: { x: number; y: number }
}

/** Cells for `count` values, as the metrics (axis, origin) say. */
export function getArrayLayout(count: number, { axis, cell, gutter, origin, footer }: ArrayMetrics): ArrayLayout {
	const n = Math.max(1, count)
	const { x: ox, y: oy } = origin
	if (axis === 'horizontal') {
		return {
			width: n * cell,
			height: cell + gutter + footer,
			box: { x: ox, y: oy, w: n * cell, h: cell + gutter + footer },
			cells: { x: ox, y: oy, w: n * cell, h: cell },
			cellAt: (i) => ({ x: ox + i * cell, y: oy }),
			indexAt: (i) => ({ x: ox + i * cell + cell / 2, y: oy + cell + gutter / 2 }),
			boundaryAt: (k) => ox + k * cell,
			footerAt: { x: ox, y: oy + cell + gutter + footer / 2 },
		}
	}
	// Down a column: index 0 at the top; up a column: at the bottom, at the origin.
	const top = axis === 'vertical' ? oy : oy - (n - 1) * cell
	const rowY = (i: number) => (axis === 'vertical' ? oy + i * cell : oy - i * cell)
	return {
		width: gutter + cell,
		height: n * cell + footer,
		box: { x: ox, y: top, w: gutter + cell, h: n * cell + footer },
		cells: { x: ox + gutter, y: top, w: cell, h: n * cell },
		cellAt: (i) => ({ x: ox + gutter, y: rowY(i) }),
		indexAt: (i) => ({ x: ox + gutter / 2, y: rowY(i) + cell / 2 }),
		boundaryAt: (k) => (axis === 'vertical' ? rowY(k) : rowY(k) + cell),
		footerAt: { x: ox, y: top + n * cell + footer / 2 },
	}
}

/** The way index k + 1 lies from index k: right, down, or (upright) up. */
export function arrayStepVector(axis: ArrayAxis): Point {
	return axis === 'horizontal' ? { x: 1, y: 0 } : axis === 'vertical' ? { x: 0, y: 1 } : { x: 0, y: -1 }
}

/** The index a point falls in along the array (may be -1 or past the end), from the cells' rectangle. */
export function indexAlong(point: Point, count: number, metrics: ArrayMetrics): number {
	const { cells } = getArrayLayout(count, metrics)
	if (metrics.axis === 'horizontal') return Math.floor((point.x - cells.x) / metrics.cell)
	const fromTop = Math.floor((point.y - cells.y) / metrics.cell)
	return metrics.axis === 'vertical' ? fromTop : Math.max(1, count) - 1 - fromTop
}

/** Centre of the grow grip: where the next cell would go, in shape space. */
export function getArrayGrowPoint(count: number, metrics: ArrayMetrics) {
	const { x, y } = getArrayLayout(count, metrics).cellAt(count)
	return { x: x + metrics.cell / 2, y: y + metrics.cell / 2 }
}

/**
 * Top-left of the shape (page space) so that the first sketched cell stays centred on `origin`, in
 * layout coordinates: the sketch tool moves the shape back by the metrics' origin itself. An
 * upright array (a stack) grows up from it whichever way the drag goes.
 */
export function getSketchPosition(
	origin: { x: number; y: number },
	{ direction, sign, count }: SketchState,
	{ cell, gutter, axis }: ArrayMetrics
): { x: number; y: number } {
	const half = cell / 2
	if (axis === 'up') return { x: origin.x - half - gutter, y: origin.y - half }
	const back = sign < 0 ? (count - 1) * cell : 0
	return direction === 'horizontal'
		? { x: origin.x - half - back, y: origin.y - half }
		: { x: origin.x - half - gutter, y: origin.y - half - back }
}

/**
 * The cell under `point` (shape space), its box grown by `reach` so it stays hovered on the way to
 * its buttons, and the cell boundary nearest the point: `boundary` k is just before cell k (n is
 * past the end). In the band where each cell's x button sits on its corner (above a horizontal
 * array: top-right; right of a vertical one: top-right too), the cell whose corner is nearest, so
 * the button doesn't jump to the neighbour on the way to it. (Plain arrays only: rows and columns
 * running down.)
 */
export function hoveredCell(point: Point, count: number, metrics: ArrayMetrics, reach: number): { index: number; boundary: number } | undefined {
	const { cells } = getArrayLayout(count, metrics)
	const horizontal = metrics.axis === 'horizontal'
	const [along, across, extent] = horizontal ? [point.x - cells.x, point.y - cells.y, cells.h] : [point.y - cells.y, point.x - cells.x, cells.w]
	if (across < -reach || across > extent + reach || along < -reach || along > count * metrics.cell + reach) return undefined
	const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v))
	const boundary = clamp(Math.round(along / metrics.cell), count)
	const index = horizontal && across < 0 ? boundary - 1 : !horizontal && across > extent ? boundary : Math.floor(along / metrics.cell)
	return { index: clamp(index, count - 1), boundary }
}

/**
 * Where a second row of `count` cells goes during an operation (a new array being filled): under
 * a horizontal array, with its title above it; right of a column, clear of its pointers, running
 * the same way. Cells line up with the array's, so a[i] -> newArr[i] is a straight move.
 */
export function getAuxLayout(count: number, metrics: ArrayMetrics, main: ArrayLayout) {
	const { cell, gutter, origin, indexFontSize, fontSize, axis } = metrics
	const title = indexFontSize * 1.8
	const n = Math.max(1, count)
	if (axis === 'horizontal') {
		const top = main.box.y + main.box.h + fontSize * 0.6
		const y = top + title
		return {
			titleAt: { x: origin.x, y: top + title / 2 },
			cells: { x: origin.x, y, w: n * cell, h: cell },
			cellAt: (i: number) => ({ x: origin.x + i * cell, y }),
			indexAt: (i: number) => ({ x: origin.x + i * cell + cell / 2, y: y + cell + gutter / 2 }),
			bounds: { x: origin.x, y: top, w: n * cell, h: title + cell + gutter },
		}
	}
	const x = main.box.x + main.box.w + cell * 2.2
	if (axis === 'up') {
		// Upright like the stack, bottom aligned: cells past the stack's top rise above it for a moment.
		const rowY = (i: number) => origin.y - i * cell
		return {
			titleAt: { x, y: origin.y + cell + title / 2 },
			cells: { x, y: rowY(n - 1), w: cell, h: n * cell },
			cellAt: (i: number) => ({ x, y: rowY(i) }),
			indexAt: (i: number) => ({ x: x + cell + gutter / 2, y: rowY(i) + cell / 2 }),
			bounds: { x, y: Math.max(0, rowY(n - 1)), w: cell + gutter + cell * 3, h: origin.y + cell + title - Math.max(0, rowY(n - 1)) },
		}
	}
	const y0 = main.box.y + title
	return {
		titleAt: { x, y: main.box.y + title / 2 },
		cells: { x, y: y0, w: cell, h: n * cell },
		cellAt: (i: number) => ({ x, y: y0 + i * cell }),
		indexAt: (i: number) => ({ x: x + cell + gutter / 2, y: y0 + i * cell + cell / 2 }),
		bounds: { x, y: main.box.y, w: cell + gutter + cell * 3, h: title + n * cell },
	}
}
