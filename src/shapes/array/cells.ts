import type { CellDirection, EditableCells } from '../../cells/editable-cells'
import { ARRAY_SHAPE_TYPE, type ArrayShape } from './array-shape-types'
import { isUsed, usedIndices, type ArrayAxis } from './kinds'
import { getArrayLayout, getArrayMetrics, indexAlong } from './layout'

/**
 * Array cells are keyed by their index. Only cells in use count: a fixed array's spare slots don't
 * (a circular buffer's values may wrap round the end).
 */
export const arrayCells: EditableCells<ArrayShape> = {
	cellAt(shape, point) {
		const { values } = shape.props
		const metrics = getArrayMetrics(shape.props)
		const { cells } = getArrayLayout(values.length, metrics)
		const inside =
			point.x >= cells.x && point.x <= cells.x + cells.w && point.y >= cells.y && point.y <= cells.y + cells.h
		if (!inside) return undefined
		const i = Math.max(0, Math.min(values.length - 1, indexAlong(point, values.length, metrics)))
		return isUsed(shape.props, i) ? String(i) : undefined
	},

	firstCell(shape) {
		const first = usedIndices(shape.props)[0]
		return first === undefined ? undefined : String(first)
	},

	cellBox(shape, key) {
		const metrics = getArrayMetrics(shape.props)
		const { x, y } = getArrayLayout(shape.props.values.length, metrics).cellAt(Number(key))
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
		const j = Number(key) + arrayStep(getArrayMetrics(shape.props).axis, direction)
		return j !== Number(key) && isUsed(shape.props, j) ? String(j) : undefined
	},
}

function arrayStep(axis: ArrayAxis, direction: CellDirection): number {
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
			return axis === 'vertical' ? -1 : axis === 'up' ? 1 : 0
		case 'down':
			return axis === 'vertical' ? 1 : axis === 'up' ? -1 : 0
	}
}
