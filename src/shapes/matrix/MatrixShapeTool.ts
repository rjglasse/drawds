import { createDragTool } from '../../sketch/LineSketchTool'
import { getMatrixMetrics, sketchPosition, sketchSize } from './layout'
import { MATRIX_SHAPE_TYPE, MAX_MATRIX, type MatrixShape } from './matrix-shape-types'
import { matrixValues } from './model'

interface MatrixSketch {
	rows: number
	cols: number
	/** Which way the drag went: the pressed cell stays the corner it started from. */
	left: boolean
	up: boolean
}

/** Press and drag a rectangle: a row or column appears for every cell the pointer travels. */
export const MatrixShapeTool = createDragTool<MatrixShape, MatrixSketch>({
	type: MATRIX_SHAPE_TYPE,
	initial: { rows: 1, cols: 1, left: false, up: false },
	next(shape, offset) {
		const { cell } = getMatrixMetrics(shape.props.size)
		return { ...sketchSize(offset, cell, MAX_MATRIX), left: offset.x < 0, up: offset.y < 0 }
	},
	same: (a, b) => a.rows === b.rows && a.cols === b.cols && a.left === b.left && a.up === b.up,
	layout(shape, origin, sketch) {
		const { fill, seed, range, size } = shape.props
		const offset = { x: sketch.left ? -1 : 1, y: sketch.up ? -1 : 1 }
		return {
			...sketchPosition(origin, offset, sketch, getMatrixMetrics(size)),
			props: { values: matrixValues(fill, seed, sketch.rows, sketch.cols, range) },
		}
	},
})
