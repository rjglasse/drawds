import { describe, expect, it } from 'vitest'
import { matrixCells, setLabel, step } from './cells'
import { cellKey, getMatrixLayout, getMatrixMetrics, parseCellKey, parseHeaderKey, sketchPosition, sketchSize } from './layout'
import { matrixShapeMigrations, type MatrixShape } from './matrix-shape-types'
import { deleteCol, deleteRow, insertCol, insertRow, matrixValues, moveMarks, resize, shellIndex, shiftAt, shiftLabels, transpose } from './model'
import { isSortedMatrix, staircaseSearch, transposeSteps, traverse } from './operations'

const grid = (rows: number, cols: number) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => `${r}${c}`))

describe('matrix layout', () => {
	const m = getMatrixMetrics('m')

	it('puts cells past the row indices and under the column indices, all inside the box', () => {
		const layout = getMatrixLayout(3, 4, m)
		expect(layout.cellBox(0, 0)).toEqual({ x: m.origin.x, y: m.origin.y, w: m.cell, h: m.cell })
		expect(layout.rowIndexAt(1).x).toBeLessThan(m.origin.x)
		expect(layout.colIndexAt(2).y).toBeLessThan(m.origin.y)
		expect(layout.box).toEqual({ x: 0, y: 0, w: m.origin.x + 4 * m.cell, h: m.origin.y + 3 * m.cell })
		expect(layout.cellAt({ x: m.origin.x + 2.5 * m.cell, y: m.origin.y + 1.5 * m.cell })).toEqual([1, 2])
		expect(layout.cellAt({ x: 1, y: 1 })).toBeUndefined()
	})

	it('sketches a cell more each way for every cell dragged, keeping the pressed cell under the press', () => {
		expect(sketchSize({ x: 2.5 * m.cell, y: -0.5 * m.cell }, m.cell, 16)).toEqual({ rows: 1, cols: 3 })
		expect(sketchSize({ x: 99 * m.cell, y: 0 }, m.cell, 16).cols).toBe(16)
		// Dragged up and left: the pressed cell is the bottom-right one.
		const at = sketchPosition({ x: 500, y: 500 }, { x: -1, y: -1 }, { rows: 2, cols: 3 }, m)
		const pressed = getMatrixLayout(2, 3, m).cellBox(1, 2)
		expect([at.x + pressed.x + m.cell / 2, at.y + pressed.y + m.cell / 2]).toEqual([500, 500])
	})

	it('cell keys are r,c', () => {
		expect(cellKey(2, 10)).toBe('2,10')
		expect(parseCellKey('2,10')).toEqual([2, 10])
		expect(parseCellKey('row:2')).toBeUndefined()
		expect(parseHeaderKey('row:2')).toEqual(['row', 2])
		expect(parseHeaderKey('col:10')).toEqual(['col', 10])
		expect(parseHeaderKey('2,10')).toBeUndefined()
	})

	it('labels take the indices\' place; the row strip widens for the widest, a column label shrinks to fit', () => {
		const plain = getMatrixLayout(3, 2, m)
		expect(plain.rowHeader(1)).toEqual({ text: '1', labelled: false, fontSize: m.indexFontSize })
		const labelled = getMatrixLayout(3, 2, m, { rows: ['0x0000', '', '0x0002'], cols: ['a very long name'] })
		expect(labelled.rowHeader(0)).toMatchObject({ text: '0x0000', labelled: true })
		expect(labelled.rowHeader(1)).toMatchObject({ text: '1', labelled: false })
		expect(labelled.cells.x).toBeGreaterThan(plain.cells.x)
		const box = labelled.rowIndexBox(0)
		expect(box.x).toBeGreaterThan(0)
		expect(box.x + box.w).toBeLessThan(labelled.cells.x)
		expect(labelled.colHeader(0).fontSize).toBeLessThan(m.fontSize * 0.8)
		expect(labelled.colIndexBox(0).w).toBeLessThanOrEqual(m.cell)
		// Short labels (a graph's A, B, C) fit the strip an index has.
		expect(getMatrixLayout(3, 3, m, { rows: ['A', 'B', 'C'] }).cells.x).toBe(plain.cells.x)
	})

	it('finds the header beside a row or above a column', () => {
		const layout = getMatrixLayout(3, 2, m)
		expect(layout.headerAt(layout.rowIndexAt(2))).toBe('row:2')
		expect(layout.headerAt(layout.colIndexAt(1))).toBe('col:1')
		expect(layout.headerAt({ x: 1, y: 1 })).toBeUndefined()
		expect(layout.headerAt({ x: layout.cells.x + 1, y: layout.cells.y + 1 })).toBeUndefined()
	})
})

describe('matrix labels', () => {
	const shape = (props: Partial<MatrixShape['props']> = {}) =>
		({ id: 'shape:m', type: 'matrix', props: { values: grid(3, 2), size: 'm', rowLabels: [], colLabels: [], ...props } }) as unknown as MatrixShape

	it('edits a header like a cell: the index until a label is typed, blank brings the index back', () => {
		expect(matrixCells.getValue(shape(), 'row:1')).toBe('1')
		expect(matrixCells.setValue(shape(), 'row:1', '0x1').props).toEqual({ rowLabels: ['', '0x1', ''] })
		expect(matrixCells.setValue(shape(), 'col:0', ' addr ').props).toEqual({ colLabels: ['addr', ''] })
		expect(matrixCells.getValue(shape({ rowLabels: ['', '0x1'] }), 'row:1')).toBe('0x1')
		expect(setLabel(['a', 'b'], 3, 0, '')).toEqual(['', 'b', ''])
	})

	it('Tab and the arrows run down the row headers and along the column headers', () => {
		const s = shape()
		expect(matrixCells.neighbor(s, 'row:0', 'next')).toBe('row:1')
		expect(matrixCells.neighbor(s, 'row:1', 'up')).toBe('row:0')
		expect(matrixCells.neighbor(s, 'row:2', 'down')).toBeUndefined()
		expect(matrixCells.neighbor(s, 'row:0', 'right')).toBeUndefined()
		expect(matrixCells.neighbor(s, 'col:0', 'right')).toBe('col:1')
		expect(matrixCells.neighbor(s, 'col:1', 'prev')).toBe('col:0')
		expect(matrixCells.neighbor(s, 'col:1', 'next')).toBeUndefined()
	})

	it('labels move with their rows', () => {
		expect(shiftLabels(['a', 'b', 'c'], 1, 1)).toEqual(['a', '', 'b', 'c'])
		expect(shiftLabels(['a', 'b'], 5, 1)).toEqual(['a', 'b'])
		expect(shiftLabels(['a', 'b', 'c'], 1, -1)).toEqual(['a', 'c'])
	})

	it('matrices saved before labels existed get none', () => {
		const [addLabels] = matrixShapeMigrations.sequence
		if (!('up' in addLabels) || typeof addLabels.down !== 'function') throw new Error('expected a props migration')
		const props: Record<string, unknown> = { values: [['1']] }
		addLabels.up(props)
		expect(props).toMatchObject({ rowLabels: [], colLabels: [] })
		addLabels.down(props)
		expect(props).not.toHaveProperty('rowLabels')
		expect(props).not.toHaveProperty('colLabels')
	})
})

describe('matrix model', () => {
	it('shell order: each k x k square takes the first k² places', () => {
		const places = (k: number) => Array.from({ length: k }, (_, r) => Array.from({ length: k }, (_, c) => shellIndex(r, c))).flat().sort((a, b) => a - b)
		expect(places(3)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
		expect(shellIndex(0, 1)).toBe(1)
		expect(shellIndex(1, 0)).toBe(3)
	})

	it('random values stay put as the sketch grows; sorted fills run along rows and down columns', () => {
		const small = matrixValues('random', 7, 2, 3)
		const big = matrixValues('random', 7, 4, 5)
		expect(big.slice(0, 2).map((row) => row.slice(0, 3))).toEqual(small)
		expect(new Set(matrixValues('random', 7, 10, 10).flat()).size).toBe(100)
		expect(isSortedMatrix(matrixValues('ascending', 7, 4, 4))).toBe(true)
		expect(within(matrixValues('random', 7, 3, 3, 'small').flat(), 0, 9)).toBe(true)
	})

	it('resizes keeping cells, filling new ones in row order', () => {
		let k = 0
		const fresh = (n: number) => Array.from({ length: n }, () => `new${k++}`)
		expect(resize(grid(2, 2), 3, 3, fresh)).toEqual([
			['00', '01', 'new0'],
			['10', '11', 'new1'],
			['new2', 'new3', 'new4'],
		])
		expect(resize(grid(3, 3), 2, 1, fresh)).toEqual([['00'], ['10']])
	})

	it('inserts and deletes rows and columns; marks move with their cells', () => {
		expect(insertRow(grid(2, 2), 1, ['a', 'b'])).toEqual([['00', '01'], ['a', 'b'], ['10', '11']])
		expect(insertCol(grid(2, 2), 0, ['a', 'b'])).toEqual([['a', '00', '01'], ['b', '10', '11']])
		expect(deleteRow(grid(3, 2), 1)).toEqual([['00', '01'], ['20', '21']])
		expect(deleteCol(grid(2, 3), 2)).toEqual([['00', '01'], ['10', '11']])
		const marks = { '0,0': 'red', '1,1': 'green', '2,0': 'blue' } as const
		expect(moveMarks(marks, (r, c) => [shiftAt(1, 1)(r)!, c])).toEqual({ '0,0': 'red', '2,1': 'green', '3,0': 'blue' })
		expect(
			moveMarks(marks, (r, c) => {
				const to = shiftAt(1, -1)(r)
				return to === undefined ? undefined : [to, c]
			})
		).toEqual({ '0,0': 'red', '1,0': 'blue' })
		expect(transpose(grid(2, 3))).toEqual([['00', '10'], ['01', '11'], ['02', '12']])
	})

	it('Tab runs along a row and on to the next; arrows stop at the edges', () => {
		expect(step([0, 2], 'next', 2, 3)).toEqual([1, 0])
		expect(step([1, 0], 'prev', 2, 3)).toEqual([0, 2])
		expect(step([1, 2], 'next', 2, 3)).toBeUndefined()
		expect(step([0, 1], 'down', 2, 3)).toEqual([1, 1])
		expect(step([0, 0], 'left', 2, 3)).toBeUndefined()
	})
})

describe('matrix operations', () => {
	const offsets = (op: ReturnType<typeof traverse>) => op.frames.at(-2)!.strips![1].items

	it('row-major reads memory straight through; column-major jumps a row at a time', () => {
		const rows = traverse(grid(2, 3), 'row')
		expect(offsets(rows)).toEqual(['0', '1', '2', '3', '4', '5'])
		expect(rows.frames[1].caption).toBe('a[0][1] = 01, at 0·3 + 1 = 1 in memory: next door')
		const cols = traverse(grid(2, 3), 'col')
		expect(offsets(cols)).toEqual(['0', '3', '1', '4', '2', '5'])
		expect(cols.frames[1].caption).toBe('a[1][0] = 10, at 1·3 + 0 = 3 in memory: 3 cells on')
		expect(cols.frames[2].caption).toBe('a[0][1] = 01, at 0·3 + 1 = 1 in memory: back 2 cells')
		expect(cols.frames[2].pointers).toEqual([
			{ id: '#i', name: 'i', at: 'row:0' },
			{ id: '#j', name: 'j', at: 'col:1' },
		])
	})

	it('transpose swaps each cell above the diagonal with its mirror', () => {
		const op = transposeSteps(grid(3, 3))
		expect(op.values).toEqual(transpose(grid(3, 3)))
		expect(op.frames.filter((f) => f.swaps).map((f) => f.swaps![0])).toEqual([
			['0,1', '1,0'],
			['0,2', '2,0'],
			['1,2', '2,1'],
		])
		expect(op.frames.at(-1)!.caption).toBe('Transposed: row i is now column i (3 swaps)')
	})

	it('staircase search rules out a row or a column a step, from the top-right', () => {
		const sorted = [
			['1', '4', '7'],
			['2', '5', '8'],
			['3', '6', '9'],
		]
		expect(isSortedMatrix(sorted)).toBe(true)
		const found = staircaseSearch(sorted, '5')
		expect(found.frames.map((f) => f.pointers?.map((p) => p.at).join(' '))).toEqual(['row:0 col:2', 'row:0 col:1', 'row:1 col:1'])
		expect(found.finalFlash).toEqual({ '1,1': 'green' })
		expect(found.frames[0].dim).toEqual(['1,2', '2,2'])
		const missing = staircaseSearch(sorted, '10')
		expect(missing.frames.at(-1)!.caption).toBe('Off the edge: 10 is not in the matrix, found out in 3 steps (never more than 3 + 3 - 1)')
		expect(isSortedMatrix([['2', '1']])).toBe(false)
	})
})

function within(values: string[], lo: number, hi: number) {
	return values.every((v) => Number(v) >= lo && Number(v) <= hi)
}

describe("staircase search's predict questions", () => {
	it('asks "found it, go left, or go down?" at every cell, whatever the answer', () => {
		const grid = [
			['1', '4', '7'],
			['2', '5', '8'],
			['3', '6', '9'],
		]
		for (const target of ['5', '10', '0']) {
			const { frames } = staircaseSearch(grid, target)
			const compared = frames.filter((f) => f.askFocus)
			expect(compared.length).toBeGreaterThan(0)
			for (const f of compared) expect(f.ask).toMatch(/^(Start top-right: )?a\[\d\]\[\d\] = \d vs \d+: found it, go left, or go down\?$/)
		}
	})
})
