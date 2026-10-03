import type { CellDirection, EditableCells } from '../../cells/editable-cells'
import { ARRAY_SHAPE_TYPE, usedCount, type ArrayShape } from './array-shape-types'
import { getArrayLayout, getArrayMetrics } from './layout'

/** Array cells are keyed by their index. Only cells in use count: a fixed array's spare slots don't. */
export const arrayCells: EditableCells<ArrayShape> = {
	cellAt(shape, point) {
		const { values, direction } = shape.props
		const metrics = getArrayMetrics(shape.props)
		const { cells } = getArrayLayout(values.length, direction, metrics)
		const inside =
			point.x >= cells.x && point.x <= cells.x + cells.w && point.y >= cells.y && point.y <= cells.y + cells.h
		if (!inside) return undefined
		const along = direction === 'horizontal' ? point.x - cells.x : point.y - cells.y
		const i = Math.min(values.length - 1, Math.floor(along / metrics.cell))
		return i < usedCount(shape.props) ? String(i) : undefined
	},

	firstCell(shape) {
		return usedCount(shape.props) > 0 ? '0' : undefined
	},

	cellBox(shape, key) {
		const metrics = getArrayMetrics(shape.props)
		const { x, y } = getArrayLayout(shape.props.values.length, shape.props.direction, metrics).cellAt(Number(key))
		return { x, y, w: metrics.cell, h: metrics.cell }
	},

	getValue(shape, key) {
		return shape.props.values[Number(key)] ?? ''
	},

	setValue(shape, key, value) {
		const values = [...shape.props.values]
		values[Number(key)] = value
		return { id: shape.id, type: ARRAY_SHAPE_TYPE, props: { values } }
	},

	neighbor(shape, key, direction) {
		const j = Number(key) + arrayStep(shape.props.direction, direction)
		return j !== Number(key) && j >= 0 && j < usedCount(shape.props) ? String(j) : undefined
	},
}

function arrayStep(axis: ArrayShape['props']['direction'], direction: CellDirection): number {
	switch (direction) {
		case 'next':
			return 1
		case 'prev':
			return -1
		case 'left':
			return axis === 'horizontal' ? -1 : 0
		case 'right':
			return axis === 'horizontal' ? 1 : 0
		case 'up':
			return axis === 'vertical' ? -1 : 0
		case 'down':
			return axis === 'vertical' ? 1 : 0
	}
}
