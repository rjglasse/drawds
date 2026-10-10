import type { TLDefaultSizeStyle } from 'tldraw'
import { CHAR_WIDTH } from '../recursion/calls'
import { CELL_SIZES } from '../sizes'
import type { CountedSort } from '../array/sort-counts'
import { GROWTH_ORDERS, GROWTH_SIZES, ORDER_TITLES, growthTable, showCount, showFactor, sortTitle } from './growth'

// Where a counts table draws things: a title, then a grid: a header row (the inputs), a row per n
// (each count over the factor it grew by) and a last row saying how each column grows. Laid out with
// every row's text, so it holds still while the steps fill it in. Pure.

export interface GrowthLayout {
	fontSize: number
	strokeWidth: number
	box: { w: number; h: number }
	title: { x: number; y: number; text: string }
	/** Column edges: the n column, then one per input order. */
	cols: { x: number; w: number }[]
	/** Row edges: the header, a row per n, then how each grows. */
	rows: { y: number; h: number }[]
}

/** What the n column says in each row. */
export const N_COLUMN = ['n', ...GROWTH_SIZES.map(showCount), 'grows as']

export const growthTitle = (sort: CountedSort, cutoff: number) => `${sortTitle(sort, cutoff)}: comparisons as n grows`

export function growthLayout(sort: CountedSort, seed: number, cutoff: number, size: TLDefaultSizeStyle): GrowthLayout {
	const fontSize = Math.round(CELL_SIZES[size] * 0.3)
	const strokeWidth = Math.max(1.25, CELL_SIZES[size] / 40)
	const charW = fontSize * CHAR_WIDTH.mono
	const pad = fontSize * 0.7
	const table = growthTable(sort, seed, cutoff)
	const widest = (texts: string[]) => Math.max(...texts.map((t) => t.length)) * charW + pad * 2
	const nW = widest(N_COLUMN)
	const colW = Math.max(
		...GROWTH_ORDERS.map((order, col) =>
			widest([ORDER_TITLES[order], ...table.counts.map((row) => showCount(row[col])), ...table.factors.flatMap((row) => (row[col] ? [showFactor(row[col]!)] : [])), table.growth[col]])
		)
	)
	const title = growthTitle(sort, cutoff)
	const top = fontSize * 2
	const heights = [fontSize * 1.8, ...GROWTH_SIZES.map((_, k) => fontSize * (k === 0 ? 1.8 : 2.6)), fontSize * 1.8]
	const rows = heights.map((h, k) => ({ y: top + heights.slice(0, k).reduce((a, b) => a + b, 0), h }))
	const cols = [{ x: 0, w: nW }, ...GROWTH_ORDERS.map((_, k) => ({ x: nW + k * colW, w: colW }))]
	const gridW = nW + GROWTH_ORDERS.length * colW
	const last = rows[rows.length - 1]
	return {
		fontSize,
		strokeWidth,
		box: { w: Math.max(gridW, title.length * charW) + strokeWidth, h: last.y + last.h + strokeWidth },
		title: { x: 0, y: fontSize * 0.8, text: title },
		cols,
		rows,
	}
}
