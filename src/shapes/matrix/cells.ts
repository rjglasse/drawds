import type { CellDirection, EditableCells } from '../../cells/editable-cells'
import { cellKey, getMatrixLayout, getMatrixMetrics, parseCellKey } from './layout'
import { MATRIX_SHAPE_TYPE, type MatrixShape } from './matrix-shape-types'
import { colsOf, rowsOf } from './model'

const layoutOf = (shape: MatrixShape) =>
	getMatrixLayout(rowsOf(shape.props.values), colsOf(shape.props.values), getMatrixMetrics(shape.props.size))

/** Matrix cells are keyed `r,c`. Tab runs along a row, then on to the next; arrows move either way. */
export const matrixCells: EditableCells<MatrixShape> = {
	cellAt(shape, point) {
		const at = layoutOf(shape).cellAt(point)
		return at && cellKey(...at)
	},

	firstCell(shape) {
		return shape.props.values.length && shape.props.values[0].length ? cellKey(0, 0) : undefined
	},

	cellBox(shape, key) {
		const at = parseCellKey(key)
		return at ? layoutOf(shape).cellBox(...at) : { x: 0, y: 0, w: 0, h: 0 }
	},

	getValue(shape, key) {
		const at = parseCellKey(key)
		return (at && shape.props.values[at[0]]?.[at[1]]) ?? ''
	},

	setValue(shape, key, value) {
		const at = parseCellKey(key)
		if (!at) return { id: shape.id, type: MATRIX_SHAPE_TYPE }
		const values = shape.props.values.map((row, r) => (r === at[0] ? row.map((v, c) => (c === at[1] ? value : v)) : row))
		return { id: shape.id, type: MATRIX_SHAPE_TYPE, props: { values } }
	},

	neighbor(shape, key, direction) {
		const at = parseCellKey(key)
		if (!at) return undefined
		const next = step(at, direction, rowsOf(shape.props.values), colsOf(shape.props.values))
		return next && cellKey(...next)
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
