import { colsOf, deleteCol, deleteRow, insertCol, insertRow, rowsOf, transpose, type Grid } from '../shapes/matrix/model'

// A matrix's moves, as its transcript keeps them (as `array-moves.ts` for arrays): its values, row
// by row. Row and column labels are how it is drawn (addresses), not what it holds: they log nothing.

export type MatrixMove =
	| { op: 'new'; name: string; values: Grid }
	| { op: 'set'; r: number; c: number; v: string }
	/** A row after the last (a grip dragged down), or at `at`. */
	| { op: 'appendRow'; values: string[] }
	| { op: 'insertRow'; at: number; values: string[] }
	| { op: 'deleteRow'; at: number }
	/** A column after the last (one value per row), or at `at`. */
	| { op: 'appendCol'; values: string[] }
	| { op: 'insertCol'; at: number; values: string[] }
	| { op: 'deleteCol'; at: number }
	| { op: 'transpose' }
	/** New values all at once. */
	| { op: 'assign'; values: Grid }

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i])

export const sameGrid = (a: Grid, b: Grid) => a.length === b.length && a.every((row, r) => same(row, b[r]))

const column = (grid: Grid, c: number) => grid.map((row) => row[c])

/**
 * The moves that take a matrix from `prev` to `next`: a value typed, rows or columns added at the end
 * (a grip) or put in, taken off the end or out, the matrix transposed; else the new values at once.
 */
export function diffGrid(prev: Grid, next: Grid): MatrixMove[] {
	if (sameGrid(prev, next)) return []
	const [rows, cols, r2, c2] = [rowsOf(prev), colsOf(prev), rowsOf(next), colsOf(next)]
	if (r2 === cols && c2 === rows && sameGrid(transpose(prev), next)) return [{ op: 'transpose' }]
	if (r2 === rows && c2 === cols) {
		const changed = prev.flatMap((row, r) => row.flatMap((v, c) => (v === next[r][c] ? [] : [[r, c] as const])))
		if (changed.length === 1) {
			const [[r, c]] = changed
			return [{ op: 'set', r, c, v: next[r][c] }]
		}
	}
	// Rows: added at the end, put in, taken off the end, taken out.
	if (c2 === cols && r2 !== rows) {
		if (r2 > rows && sameGrid(next.slice(0, rows), prev)) return next.slice(rows).map((values) => ({ op: 'appendRow', values: [...values] }))
		if (r2 < rows && sameGrid(prev.slice(0, r2), next)) return Array.from({ length: rows - r2 }, (_, k) => ({ op: 'deleteRow', at: rows - 1 - k }))
		if (r2 === rows + 1) for (let at = 0; at < rows; at++) if (sameGrid(insertRow(prev, at, next[at]), next)) return [{ op: 'insertRow', at, values: [...next[at]] }]
		if (r2 === rows - 1) for (let at = 0; at < rows; at++) if (sameGrid(deleteRow(prev, at), next)) return [{ op: 'deleteRow', at }]
	}
	// Columns, the same way.
	if (r2 === rows && c2 !== cols && rows > 0) {
		const kept = (grid: Grid, n: number) => grid.map((row) => row.slice(0, n))
		if (c2 > cols && sameGrid(kept(next, cols), prev)) return Array.from({ length: c2 - cols }, (_, k) => ({ op: 'appendCol', values: column(next, cols + k) }))
		if (c2 < cols && sameGrid(kept(prev, c2), next)) return Array.from({ length: cols - c2 }, (_, k) => ({ op: 'deleteCol', at: cols - 1 - k }))
		if (c2 === cols + 1) for (let at = 0; at < cols; at++) if (sameGrid(insertCol(prev, at, column(next, at)), next)) return [{ op: 'insertCol', at, values: column(next, at) }]
		if (c2 === cols - 1) for (let at = 0; at < cols; at++) if (sameGrid(deleteCol(prev, at), next)) return [{ op: 'deleteCol', at }]
	}
	return [{ op: 'assign', values: next.map((row) => [...row]) }]
}

/** The values a log leaves the matrix with. */
export function replayGrid(moves: readonly MatrixMove[]): Grid {
	let m: Grid = []
	for (const move of moves) {
		switch (move.op) {
			case 'new':
			case 'assign':
				m = move.values.map((row) => [...row])
				break
			case 'set':
				m = m.map((row, r) => (r === move.r ? row.map((v, c) => (c === move.c ? move.v : v)) : row))
				break
			case 'appendRow':
				m = insertRow(m, rowsOf(m), move.values)
				break
			case 'insertRow':
				m = insertRow(m, move.at, move.values)
				break
			case 'deleteRow':
				m = deleteRow(m, move.at)
				break
			case 'appendCol':
				m = insertCol(m, colsOf(m), move.values)
				break
			case 'insertCol':
				m = insertCol(m, move.at, move.values)
				break
			case 'deleteCol':
				m = deleteCol(m, move.at)
				break
			case 'transpose':
				m = transpose(m)
				break
		}
	}
	return m
}
