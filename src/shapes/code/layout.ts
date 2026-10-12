import type { TLDefaultSizeStyle, VecLike } from 'tldraw'
import type { Box } from '../../nodelink/geometry'
import { CELL_SIZES } from '../sizes'

// A code box: the code in a monospace font, one line per row, in a box sized to it (never smaller
// than a short line, so an empty one can be clicked), line numbers in a gutter on the left if shown.
// Pointers at lines (pc) come from the left: the box starts past the room they take. The in-place
// editor is laid over the text exactly, so both use these numbers.

/**
 * tldraw's mono font (IBM Plex Mono) moves 0.6 em a character: the code's columns exactly, so what is
 * drawn at a column (a test's box, values after a line) sits on its characters.
 */
const MONO_ADVANCE = 0.6

/** Spaces a tab becomes (typed Tab indents by as much). */
export const INDENT = '    '

/** Columns an empty box is wide enough for. */
const MIN_COLUMNS = 16

export function getCodeMetrics(size: TLDefaultSizeStyle) {
	const fontSize = Math.round(CELL_SIZES[size] * 0.36 * 10) / 10
	return {
		fontSize,
		/** A column's width (the mono font's advance, a little over). */
		charW: fontSize * MONO_ADVANCE,
		lineH: Math.round(fontSize * 1.5 * 10) / 10,
		padX: Math.round(fontSize * 0.75),
		padY: Math.round(fontSize * 0.5),
		strokeWidth: Math.max(1.5, CELL_SIZES[size] / 32),
	}
}
export type CodeMetrics = ReturnType<typeof getCodeMetrics>

/** Lines from..to (inclusive) folded away: one row in their place says how many. */
export interface Fold {
	from: number
	to: number
}

/** The rows a box beside a structure shows at most before its long code folds (`foldsFor`). */
export const FOLD_LINES = 16

/** What a fold's row says. */
export const foldText = ({ from, to }: Fold) => `⋯ ${to - from + 1} lines`

/** A fold saves this many rows at least (a run of two would save one). */
const MIN_FOLD = 3

/**
 * The folds that keep `count` lines within `rows`. `reached`: the lines a step can light or show a
 * value on (an algorithm's tagged lines), which stay; the longest runs of other lines fold first, as
 * many as it takes (a helper function's body, say). Without it (a transcript, every move a line): the
 * first line (where the structure is made), a fold, then the latest lines.
 */
export function foldsFor(count: number, rows = FOLD_LINES, reached?: ReadonlySet<number>): Fold[] {
	if (count <= rows) return []
	if (!reached) return [{ from: 1, to: count - (rows - 2) - 1 }]
	const runs: Fold[] = []
	for (let i = 0; i < count; i++) {
		if (reached.has(i)) continue
		const from = i
		while (i + 1 < count && !reached.has(i + 1)) i++
		if (i - from + 1 >= MIN_FOLD) runs.push({ from, to: i })
	}
	const folds: Fold[] = []
	let shown = count
	for (const run of runs.sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from)) {
		if (shown <= rows) break
		folds.push(run)
		shown -= run.to - run.from
	}
	return folds.sort((a, b) => a.from - b.from)
}

export interface CodeLayout {
	box: Box
	/** Where line i's text starts (left edge, vertical middle of its row). */
	lineAt(i: number): VecLike
	/** Where line i's text ends (vertical middle of its row). */
	endOf(i: number): VecLike
	/** Row i across the box, for a line's mark. */
	rowBox(i: number): Box
	/** Line numbers' right edge (when shown), and the text's left edge. */
	gutterRight: number
	/** The right edge of a column kept at the right (`right`), or of the text. */
	columnRight: number
	textX: number
	/** Top of the first row. */
	top: number
	lines: number
	/** Whether line i is folded away (not drawn: its row is the fold's). */
	hidden(i: number): boolean
	/** The folds, each with where its row's text starts. */
	folds: (Fold & { at: VecLike })[]
	/** The line and column under a point (clamped into the code; a fold's row is its first line). */
	caretAt(point: VecLike): { line: number; column: number }
}

/** The code split into lines (tabs as spaces). */
export const codeLines = (code: string) => code.replace(/\t/g, INDENT).split('\n')

/**
 * `left`: room before the box for pointers at its lines. `after`: columns kept free after some lines
 * (by line), for what is shown there (a variable's value). `right`: columns for a column of its own
 * at the right (how many times each line has run). `folds`: runs of lines drawn as one row each.
 */
export function getCodeLayout(
	code: string,
	metrics: CodeMetrics,
	{
		lineNumbers = false,
		left = 0,
		after = {},
		right = 0,
		folds = [],
	}: { lineNumbers?: boolean; left?: number; after?: Record<number, number>; right?: number; folds?: readonly Fold[] } = {}
): CodeLayout {
	const { charW, lineH, padX, padY } = metrics
	const lines = codeLines(code)
	// Each line's row: a folded line's is its fold's.
	const foldOf = (i: number) => folds.find((f) => i >= f.from && i <= f.to)
	const rowOf: number[] = []
	const lineOfRow: number[] = []
	for (let i = 0; i < lines.length; i++) {
		const fold = foldOf(i)
		if (!fold || i === fold.from) lineOfRow.push(i)
		rowOf.push(lineOfRow.length - 1)
	}
	const hidden = (i: number) => foldOf(i) !== undefined
	const digits = String(lines.length).length
	const gutterW = lineNumbers ? (digits + 1.5) * charW : 0
	const textX = left + padX + gutterW
	const indent = (f: Fold) => lines.slice(f.from, f.to + 1).find((l) => l.trim())?.search(/\S/) ?? 0
	const columns =
		Math.max(
			MIN_COLUMNS,
			...lines.map((l, i) => (hidden(i) ? 0 : l.length + (after[i] ?? 0))),
			...folds.map((f) => indent(f) + foldText(f).length)
		) + right
	const box = { x: left, y: 0, w: padX + gutterW + columns * charW + padX, h: padY * 2 + lineOfRow.length * lineH }
	const rowY = (i: number) => padY + ((rowOf[i] ?? i - lines.length + lineOfRow.length) + 0.5) * lineH
	return {
		box,
		lineAt: (i) => ({ x: textX, y: rowY(i) }),
		endOf: (i) => ({ x: textX + (lines[i]?.length ?? 0) * charW, y: rowY(i) }),
		rowBox: (i) => ({ x: left, y: rowY(i) - lineH / 2, w: box.w, h: lineH }),
		gutterRight: textX - charW * 1.2,
		columnRight: textX + columns * charW,
		textX,
		top: padY,
		lines: lines.length,
		hidden,
		folds: folds.map((f) => ({ ...f, at: { x: textX + indent(f) * charW, y: rowY(f.from) } })),
		caretAt(point) {
			const row = Math.min(lineOfRow.length - 1, Math.max(0, Math.floor((point.y - padY) / lineH)))
			const line = lineOfRow[row]
			const column = Math.min(lines[line].length, Math.max(0, Math.round((point.x - textX) / charW)))
			return { line, column }
		},
	}
}

/** The offset in the code of a line and column. */
export function offsetOf(code: string, { line, column }: { line: number; column: number }): number {
	const lines = code.split('\n')
	let offset = 0
	for (let k = 0; k < line && k < lines.length; k++) offset += lines[k].length + 1
	return offset + Math.min(column, lines[line]?.length ?? 0)
}
