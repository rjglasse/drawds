import type { CellDirection, EditableCells } from '../../cells/editable-cells'
import { cellKey, colKey, getMatrixLayout, getMatrixMetrics, parseCellKey, parseHeaderKey, rowKey } from './layout'
import { MATRIX_SHAPE_TYPE, type MatrixShape } from './matrix-shape-types'
import { colsOf, rowsOf } from './model'

export const layoutOf = (shape: MatrixShape) =>
	getMatrixLayout(rowsOf(shape.props.values), colsOf(shape.props.values), getMatrixMetrics(shape.props.size), {
		rows: shape.props.rowLabels,
		cols: shape.props.colLabels,
	})

/** `labels` with label `i` set, as long as the rows (or columns) it labels. */
export function setLabel(labels: readonly string[], count: number, i: number, value: string): string[] {
	return Array.from({ length: count }, (_, k) => (k === i ? value : (labels[k] ?? '')))
}

/**
 * Matrix cells are keyed `r,c`. Tab runs along a row, then on to the next; arrows move either way.
 * The headers can be edited too (`row:<r>`, `col:<c>`): a label in place of the index; Tab and the
 * arrows run down the row headers, along the column headers.
 */
export const matrixCells: EditableCells<MatrixShape> = {
	cellAt(shape, point) {
		const layout = layoutOf(shape)
		const at = layout.cellAt(point)
		return at ? cellKey(...at) : layout.headerAt(point)
	},

	firstCell(shape) {
		return shape.props.values.length && shape.props.values[0].length ? cellKey(0, 0) : undefined
	},

	cellBox(shape, key) {
		const layout = layoutOf(shape)
		const at = parseCellKey(key)
		if (at) return layout.cellBox(...at)
		// A header's input fills its strip: left of the row, above the column.
		const header = parseHeaderKey(key)
		if (!header) return { x: 0, y: 0, w: 0, h: 0 }
		const [side, i] = header
		const { cells } = layout
		return side === 'row' ? { ...layout.cellBox(i, 0), x: 0, w: cells.x } : { ...layout.cellBox(0, i), y: 0, h: cells.y }
	},

	getValue(shape, key) {
		const at = parseCellKey(key)
		if (at) return shape.props.values[at[0]]?.[at[1]] ?? ''
		const header = parseHeaderKey(key)
		if (!header) return ''
		const layout = layoutOf(shape)
		return header[0] === 'row' ? layout.rowHeader(header[1]).text : layout.colHeader(header[1]).text
	},

	setValue(shape, key, value) {
		const { values, rowLabels, colLabels } = shape.props
		const at = parseCellKey(key)
		if (at) {
			const next = values.map((row, r) => (r === at[0] ? row.map((v, c) => (c === at[1] ? value : v)) : row))
			return { id: shape.id, type: MATRIX_SHAPE_TYPE, props: { values: next } }
		}
		const header = parseHeaderKey(key)
		if (!header) return { id: shape.id, type: MATRIX_SHAPE_TYPE }
		const [side, i] = header
		return {
			id: shape.id,
			type: MATRIX_SHAPE_TYPE,
			props:
				side === 'row'
					? { rowLabels: setLabel(rowLabels, rowsOf(values), i, value.trim()) }
					: { colLabels: setLabel(colLabels, colsOf(values), i, value.trim()) },
		}
	},

	neighbor(shape, key, direction) {
		const [rows, cols] = [rowsOf(shape.props.values), colsOf(shape.props.values)]
		const at = parseCellKey(key)
		if (at) {
			const next = step(at, direction, rows, cols)
			return next && cellKey(...next)
		}
		const header = parseHeaderKey(key)
		if (!header) return undefined
		const [side, i] = header
		const along = side === 'row' ? { next: 1, down: 1, prev: -1, up: -1 } : { next: 1, right: 1, prev: -1, left: -1 }
		const by = along[direction as keyof typeof along]
		const to = by === undefined ? -1 : i + by
		return to >= 0 && to < (side === 'row' ? rows : cols) ? (side === 'row' ? rowKey(to) : colKey(to)) : undefined
	},
}

/** The cell one step away, in row-major order for next / prev. */
export function step([r, c]: [number, number], direction: CellDirection, rows: number, cols: number): [number, number] | undefined {
	const i = r * cols + c
	const to: [number, number] | undefined =
		direction === 'next'
			? [Math.floor((i + 1) / cols), (i + 1) % cols]
			: direction === 'prev'
				? [Math.floor((i - 1) / cols), (((i - 1) % cols) + cols) % cols]
				: direction === 'left'
					? [r, c - 1]
					: direction === 'right'
						? [r, c + 1]
						: direction === 'up'
							? [r - 1, c]
							: [r + 1, c]
	return to[0] >= 0 && to[0] < rows && to[1] >= 0 && to[1] < cols ? to : undefined
}
