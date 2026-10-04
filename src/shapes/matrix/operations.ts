import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { Frame, Strip } from '../../nodelink/playback'
import type { Pointer } from '../../pointers/pointers'
import { cellKey } from './layout'
import { colsOf, rowsOf, transpose, type Grid } from './model'

// Matrix operations, step by step: the loops a teacher writes (for i, for j), with i on a row and
// j on a column, the cell they reach lit, and where that cell sits in memory (row-major: i * cols + j).

const LOOK: MarkColor = 'orange'
const VISITED: MarkColor = 'blue'
const FOUND: MarkColor = 'green'

/** Pointer i at a row (its index on the left), j at a column (its index above). */
export const rowKey = (r: number) => `row:${r}`
export const colKey = (c: number) => `col:${c}`
const ij = (r: number, c: number): Pointer[] => [
	{ id: '#i', name: 'i', at: rowKey(r) },
	{ id: '#j', name: 'j', at: colKey(c) },
]

export interface MatrixOperation {
	frames: Frame[]
	/** The matrix afterwards, if the operation changes it. */
	values?: Grid
	finalFlash?: Record<string, MarkColor>
}

/**
 * Visit every cell: row by row (for i, for j) or column by column (for j, for i). Each step shows
 * the cell's place in memory, where a matrix is stored row after row: row order walks through it
 * one cell at a time, column order jumps a whole row each time.
 */
export function traverse(values: Grid, order: 'row' | 'col'): MatrixOperation {
	const [rows, cols] = [rowsOf(values), colsOf(values)]
	const cells: [number, number][] = []
	if (order === 'row') for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([r, c])
	else for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) cells.push([r, c])
	const loops = order === 'row' ? `for i in 0..${rows - 1}, for j in 0..${cols - 1}` : `for j in 0..${cols - 1}, for i in 0..${rows - 1}`
	const visited: string[] = []
	const offsets: string[] = []
	const strips = (): Strip[] => [
		{ title: 'visited', items: [...visited] },
		{ title: 'place in memory (row-major: i·cols + j)', items: [...offsets] },
	]
	const frames: Frame[] = []
	let previous: number | undefined
	for (const [k, [r, c]] of cells.entries()) {
		const offset = r * cols + c
		visited.push(values[r][c])
		offsets.push(String(offset))
		const jump = previous === undefined ? 0 : offset - previous
		const gap = previous === undefined ? '' : jump === 1 ? ': next door' : jump > 0 ? `: ${jump} cells on` : `: back ${-jump} cells`
		frames.push({
			pointers: ij(r, c),
			flash: { [cellKey(r, c)]: LOOK, ...(k ? { [cellKey(...cells[k - 1])]: VISITED } : {}) },
			strips: strips(),
			counts: { visited: k + 1 },
			caption: `${k === 0 ? `${loops}: ` : ''}a[${r}][${c}] = ${values[r][c]}, at ${r}·${cols} + ${c} = ${offset} in memory${gap}`,
		})
		previous = offset
	}
	const last = cells[cells.length - 1]
	frames.push({
		pointers: ij(...last),
		flash: { [cellKey(...last)]: VISITED },
		caption:
			order === 'row'
				? `All ${cells.length} cells, in memory order: row-major traversal reads memory straight through`
				: `All ${cells.length} cells, but jumping ${cols} cells through memory each step: slower on real hardware (caches)`,
	})
	return { frames }
}

/**
 * Transpose a square matrix in place: for each cell above the diagonal, swap it with its mirror
 * below. The diagonal stays put.
 */
export function transposeSteps(values: Grid): MatrixOperation {
	const n = rowsOf(values)
	let grid = values.map((row) => [...row])
	const frames: Frame[] = [
		{
			flash: Object.fromEntries(Array.from({ length: n }, (_, i) => [cellKey(i, i), VISITED])),
			caption: `for i, for j > i: swap a[i][j] with a[j][i]. The diagonal (i = j) stays put`,
		},
	]
	let lit: string[] = []
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const [a, b] = [cellKey(i, j), cellKey(j, i)]
			grid = grid.map((row) => [...row])
			;[grid[i][j], grid[j][i]] = [grid[j][i], grid[i][j]]
			frames.push({
				props: { values: grid },
				swaps: [[a, b]],
				pointers: ij(i, j),
				flash: { ...Object.fromEntries(lit.map((k) => [k, null])), [a]: LOOK, [b]: LOOK },
				caption: `swap a[${i}][${j}] and a[${j}][${i}]: ${grid[j][i]} and ${grid[i][j]} trade places across the diagonal`,
			})
			lit = [a, b]
		}
	}
	frames.push({
		props: { values: grid },
		flash: Object.fromEntries(lit.map((k) => [k, null])),
		caption: `Transposed: row i is now column i (${(n * (n - 1)) / 2} swaps)`,
	})
	return { frames, values: grid }
}

/** Whether every row and every column is in order (smallest top-left), as staircase search needs. */
export function isSortedMatrix(values: Grid): boolean {
	const [rows, cols] = [rowsOf(values), colsOf(values)]
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (c + 1 < cols && compareKeys(values[r][c], values[r][c + 1]) > 0) return false
			if (r + 1 < rows && compareKeys(values[r][c], values[r + 1][c]) > 0) return false
		}
	}
	return true
}

/**
 * Staircase search in a matrix sorted along its rows and columns: start top-right, where a value is
 * the largest in its row and the smallest in its column. Too big: the rest of its column is bigger
 * still, so go left; too small: the rest of its row is smaller, so go down. Each step rules out a
 * row or a column (faded), so at most rows + cols - 1 steps.
 */
export function staircaseSearch(values: Grid, target: string): MatrixOperation {
	const [rows, cols] = [rowsOf(values), colsOf(values)]
	const frames: Frame[] = []
	const out: string[] = []
	let [r, c] = [0, cols - 1]
	let steps = 0
	let previous: string | undefined
	while (r < rows && c >= 0) {
		steps++
		const v = values[r][c]
		const cmp = compareKeys(v, target)
		const here = cellKey(r, c)
		const how = steps === 1 ? `Start top-right: a[0][${c}] = ${v}, the largest in its row, the smallest in its column. ` : ''
		const flash = { ...(previous ? { [previous]: null } : {}), [here]: cmp === 0 ? FOUND : LOOK }
		if (cmp === 0) {
			frames.push({ pointers: ij(r, c), flash, dim: [...out], counts: { steps }, caption: `${how}a[${r}][${c}] = ${target}: found in ${steps} step${steps === 1 ? '' : 's'}` })
			return { frames, finalFlash: { [here]: FOUND } }
		}
		if (cmp > 0) {
			for (let i = r; i < rows; i++) out.push(cellKey(i, c))
			frames.push({
				pointers: ij(r, c),
				flash,
				// The cell compared stays bright this step; its row or column fades from the next.
				dim: out.filter((k) => k !== here),
				counts: { steps },
				caption: `${how}${v} > ${target}: the rest of column ${c} is bigger still, so ${target} isn't there. Go left`,
			})
			c--
		} else {
			for (let j = 0; j <= c; j++) out.push(cellKey(r, j))
			frames.push({
				pointers: ij(r, c),
				flash,
				// The cell compared stays bright this step; its row or column fades from the next.
				dim: out.filter((k) => k !== here),
				counts: { steps },
				caption: `${how}${v} < ${target}: the rest of row ${r} is smaller still, so ${target} isn't there. Go down`,
			})
			r++
		}
		previous = here
	}
	frames.push({
		flash: previous ? { [previous]: null } : {},
		dim: [...out],
		counts: { steps },
		caption: `Off the edge: ${target} is not in the matrix, found out in ${steps} steps (never more than ${rows} + ${cols} - 1)`,
	})
	return { frames }
}

export { transpose }
