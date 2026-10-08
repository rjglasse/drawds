import type { TLDefaultSizeStyle, VecLike } from 'tldraw'
import type { Box } from '../../nodelink/geometry'
import { CELL_SIZES } from '../sizes'

// A matrix is a grid of cells with its column indices above and its row indices to the left, all
// inside the shape's box: the cells start at `origin`, past the indices.

export function getMatrixMetrics(size: TLDefaultSizeStyle) {
	const cell = CELL_SIZES[size]
	const indexFontSize = Math.max(10, cell * 0.26)
	return {
		cell,
		fontSize: cell * 0.42,
		indexFontSize,
		strokeWidth: Math.max(1.5, cell / 24),
		/** Where cell (0, 0)'s top-left corner is: past the row indices, under the column indices. */
		origin: { x: Math.round(cell * 0.6), y: Math.round(cell * 0.5) },
	}
}
export type MatrixMetrics = ReturnType<typeof getMatrixMetrics>

/** Text in place of the indices: row r's left of it, column c's above it ('' or missing: the index). */
export interface MatrixHeaders {
	rows?: readonly string[]
	cols?: readonly string[]
}

/** What a row's or column's header says: its label, else its index (smaller, fainter). */
export interface MatrixHeader {
	text: string
	labelled: boolean
	fontSize: number
}

/** A character's width as a share of the font size (mono's, the widest). */
const CHAR_W = 0.62

export interface MatrixLayout {
	rows: number
	cols: number
	/** All the cells together. */
	cells: Box
	/** Everything drawn: the cells and their indices. */
	box: Box
	cellBox(r: number, c: number): Box
	/** What row r's header (left of it) and column c's (above it) say. */
	rowHeader(r: number): MatrixHeader
	colHeader(c: number): MatrixHeader
	/** Centres of row r's index (left of the row) and column c's (above it). */
	rowIndexAt(r: number): VecLike
	colIndexAt(c: number): VecLike
	/** Small boxes round the indices, for pointers (i at a row, j at a column). */
	rowIndexBox(r: number): Box
	colIndexBox(c: number): Box
	/** The cell under a point, if any. */
	cellAt(point: VecLike): [number, number] | undefined
	/** The header under a point: the strip left of a row, above a column. */
	headerAt(point: VecLike): string | undefined
	/** The grips that add columns (right edge) and rows (bottom edge). */
	growCols: VecLike
	growRows: VecLike
}

/**
 * The grid and its headers. Labelled rows widen the strip on the left to fit the widest; a column's
 * label shrinks to fit over its cell.
 */
export function getMatrixLayout(rows: number, cols: number, metrics: MatrixMetrics, headers: MatrixHeaders = {}): MatrixLayout {
	const { cell, indexFontSize } = metrics
	const indexW = indexFontSize * 1.6
	const pad = indexFontSize * 0.6
	const header = (labels: readonly string[] | undefined, i: number, room = Infinity): MatrixHeader => {
		const label = labels?.[i]
		const text = label || String(i)
		const fontSize = label ? Math.min(metrics.fontSize * 0.8, (room - pad) / (text.length * CHAR_W)) : indexFontSize
		return { text, labelled: !!label, fontSize }
	}
	const textW = ({ text, fontSize }: MatrixHeader) => Math.max(indexW, text.length * fontSize * CHAR_W + pad)
	const rowHeader = (r: number) => header(headers.rows, r)
	const colHeader = (c: number) => header(headers.cols, c, cell)
	// The strip left of the rows: room for the widest header, as much either side of it as an index has.
	const gap = (metrics.origin.x - indexW) / 2
	const widest = Math.max(indexW, ...Array.from({ length: rows }, (_, r) => textW(rowHeader(r))))
	const origin = { x: Math.max(metrics.origin.x, widest + 2 * gap), y: metrics.origin.y }
	const cells = { x: origin.x, y: origin.y, w: cols * cell, h: rows * cell }
	const rowIndexAt = (r: number) => ({ x: origin.x / 2, y: origin.y + (r + 0.5) * cell })
	const colIndexAt = (c: number) => ({ x: origin.x + (c + 0.5) * cell, y: origin.y / 2 })
	const around = (at: VecLike, w: number) => ({ x: at.x - w / 2, y: at.y - indexFontSize * 0.7, w, h: indexFontSize * 1.4 })
	return {
		rows,
		cols,
		cells,
		box: { x: 0, y: 0, w: cells.x + cells.w, h: cells.y + cells.h },
		cellBox: (r, c) => ({ x: origin.x + c * cell, y: origin.y + r * cell, w: cell, h: cell }),
		rowHeader,
		colHeader,
		rowIndexAt,
		colIndexAt,
		rowIndexBox: (r) => around(rowIndexAt(r), textW(rowHeader(r))),
		colIndexBox: (c) => around(colIndexAt(c), Math.min(cell, textW(colHeader(c)))),
		cellAt(point) {
			const c = Math.floor((point.x - origin.x) / cell)
			const r = Math.floor((point.y - origin.y) / cell)
			return r >= 0 && r < rows && c >= 0 && c < cols ? [r, c] : undefined
		},
		headerAt(point) {
			const c = Math.floor((point.x - origin.x) / cell)
			const r = Math.floor((point.y - origin.y) / cell)
			if (point.x >= 0 && point.x < origin.x && r >= 0 && r < rows) return rowKey(r)
			if (point.y >= 0 && point.y < origin.y && c >= 0 && c < cols) return colKey(c)
			return undefined
		},
		growCols: { x: cells.x + cells.w + cell * 0.45, y: cells.y + cells.h / 2 },
		growRows: { x: cells.x + cells.w / 2, y: cells.y + cells.h + cell * 0.45 },
	}
}

/** Rows and columns for a sketch: one more for every cell the pointer has travelled each way. */
export function sketchSize(offset: VecLike, cell: number, max: number) {
	const count = (d: number) => Math.min(max, 1 + Math.floor(Math.abs(d) / cell))
	return { rows: count(offset.y), cols: count(offset.x) }
}

/**
 * Where a sketched matrix's layout starts (page space), so that the cell the drag started on stays
 * under the press point, whichever way the drag goes (up or left grows that way).
 */
export function sketchPosition(origin: VecLike, offset: VecLike, size: { rows: number; cols: number }, metrics: MatrixMetrics) {
	const { cell } = metrics
	const left = offset.x < 0 ? size.cols - 1 : 0
	const up = offset.y < 0 ? size.rows - 1 : 0
	return {
		x: origin.x - cell / 2 - left * cell - metrics.origin.x,
		y: origin.y - cell / 2 - up * cell - metrics.origin.y,
	}
}

export const cellKey = (r: number, c: number) => `${r},${c}`

/** A cell key's row and column, or undefined for anything else. */
export function parseCellKey(key: string): [number, number] | undefined {
	const m = /^(\d+),(\d+)$/.exec(key)
	return m ? [Number(m[1]), Number(m[2])] : undefined
}

/** A row's header and a column's: where step pointers i and j sit, marks that tint them, labels. */
export const rowKey = (r: number) => `row:${r}`
export const colKey = (c: number) => `col:${c}`

/** A header key's side and index, or undefined for anything else. */
export function parseHeaderKey(key: string): ['row' | 'col', number] | undefined {
	const m = /^(row|col):(\d+)$/.exec(key)
	return m ? [m[1] as 'row' | 'col', Number(m[2])] : undefined
}
