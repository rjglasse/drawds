import type { Marks } from '../../cells/marks'
import { extendValues, fillValues, type FillMode, type FillRange } from '../../data/fill'
import { cellKey, parseCellKey } from './layout'
import { headerTexts } from './numbering'

export type Grid = string[][]

/**
 * A cell's place in a stream of values that doesn't depend on the matrix's size: cells in order of
 * the square they first appear in (0,0; then 0,1 1,1 1,0; then 0,2 1,2 2,2 2,1 2,0...). So a
 * sketch that grows keeps the values already shown, and a k x k matrix uses exactly k² of them.
 */
export function shellIndex(r: number, c: number): number {
	const k = Math.max(r, c)
	return c === k ? k * k + r : k * k + k + (k - c)
}

const SORTED: readonly FillMode[] = ['ascending', 'descending', 'nearly-sorted']

/**
 * A rows x cols matrix's values. Random fills (and letters) are stable per cell as the sketch
 * grows; sorted fills run row by row (row-major), so every row and every column is sorted too.
 */
export function matrixValues(fill: FillMode, seed: number, rows: number, cols: number, range: FillRange = 'medium'): Grid {
	if (SORTED.includes(fill)) {
		const flat = fillValues(fill, seed, rows * cols, { range })
		return Array.from({ length: rows }, (_, r) => flat.slice(r * cols, (r + 1) * cols))
	}
	const all = fillValues(fill, seed, Math.max(rows, cols) ** 2, { range })
	return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => all[shellIndex(r, c)]))
}

export const rowsOf = (grid: Grid) => grid.length
export const colsOf = (grid: Grid) => grid[0]?.length ?? 0

/** `count` new values for the fill mode, not already in the matrix (distinct fills). */
export function freshValues(grid: Grid, fill: FillMode, seed: number, range: FillRange, count: number): string[] {
	const flat = grid.flat()
	return extendValues(flat, fill, seed ^ 0x51ed27, flat.length + count, { range }).slice(flat.length)
}

/** The matrix with `rows` x `cols` cells: cells past the new edges go, new ones take `fresh` values in row order. */
export function resize(grid: Grid, rows: number, cols: number, fresh: (count: number) => string[]): Grid {
	const added = rows * cols - Math.min(rows, rowsOf(grid)) * Math.min(cols, colsOf(grid))
	const values = fresh(added)
	let k = 0
	return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => grid[r]?.[c] ?? values[k++] ?? ''))
}

/** A new row at index `at` (0..rows), with `fresh` values. */
export function insertRow(grid: Grid, at: number, fresh: string[]): Grid {
	return [...grid.slice(0, at), fresh.slice(0, colsOf(grid)), ...grid.slice(at)]
}

/** A new column at index `at` (0..cols), with `fresh` values (one per row). */
export function insertCol(grid: Grid, at: number, fresh: string[]): Grid {
	return grid.map((row, r) => [...row.slice(0, at), fresh[r] ?? '', ...row.slice(at)])
}

export function deleteRow(grid: Grid, at: number): Grid {
	return grid.filter((_, r) => r !== at)
}

export function deleteCol(grid: Grid, at: number): Grid {
	return grid.map((row) => row.filter((_, c) => c !== at))
}

/** Rows become columns: cell (r, c) moves to (c, r). */
export function transpose(grid: Grid): Grid {
	return Array.from({ length: colsOf(grid) }, (_, c) => grid.map((row) => row[c]))
}

/**
 * Marks keyed by cell moved with their cells (`move` gives a cell's new place, or undefined if it
 * goes). Other keys are dropped.
 */
export function moveMarks(marks: Marks, move: (r: number, c: number) => [number, number] | undefined): Marks {
	const out: Marks = {}
	for (const [key, color] of Object.entries(marks)) {
		const at = parseCellKey(key)
		const to = at && move(...at)
		if (to) out[cellKey(...to)] = color
	}
	return out
}

/** Where cells go when a row (or column) is inserted at `at`, or deleted from it. */
export const shiftAt = (at: number, by: 1 | -1) => (i: number) => (i < at ? i : by > 0 ? i + 1 : i === at ? undefined : i - 1)

/**
 * Row (or column) labels when one of `count` rows is inserted at `at` (by 1) or deleted from it (-1).
 * Labels move with their rows (a blank one for a new row), unless every header is numbered
 * (addresses 0x0, 0x1...): then they number the places, so they stay, and a new last one carries on.
 */
export function shiftLabels(labels: readonly string[], count: number, at: number, by: 1 | -1): string[] {
	if (headerTexts(labels, count).every((h) => h.numbered)) return labels.slice(0, count + by)
	if (by < 0) return labels.filter((_, i) => i !== at)
	return at < labels.length ? [...labels.slice(0, at), '', ...labels.slice(at)] : [...labels]
}
