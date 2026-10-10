import type { TLDefaultSizeStyle, VecLike } from 'tldraw'
import type { Box } from '../../nodelink/geometry'
import { CHAR_WIDTH } from '../recursion/calls'
import { CELL_SIZES } from '../sizes'

// A code box: the code in a monospace font, one line per row, in a box sized to it (never smaller
// than a short line, so an empty one can be clicked), line numbers in a gutter on the left if shown.
// Pointers at lines (pc) come from the left: the box starts past the room they take. The in-place
// editor is laid over the text exactly, so both use these numbers.

/** Spaces a tab becomes (typed Tab indents by as much). */
export const INDENT = '    '

/** Columns an empty box is wide enough for. */
const MIN_COLUMNS = 16

export function getCodeMetrics(size: TLDefaultSizeStyle) {
	const fontSize = Math.round(CELL_SIZES[size] * 0.36 * 10) / 10
	return {
		fontSize,
		/** A column's width (the mono font's advance, a little over). */
		charW: fontSize * CHAR_WIDTH.mono,
		lineH: Math.round(fontSize * 1.5 * 10) / 10,
		padX: Math.round(fontSize * 0.75),
		padY: Math.round(fontSize * 0.5),
		strokeWidth: Math.max(1.5, CELL_SIZES[size] / 32),
	}
}
export type CodeMetrics = ReturnType<typeof getCodeMetrics>

export interface CodeLayout {
	box: Box
	/** Where line i's text starts (left edge, vertical middle of its row). */
	lineAt(i: number): VecLike
	/** Row i across the box, for a line's mark. */
	rowBox(i: number): Box
	/** Line numbers' right edge (when shown), and the text's left edge. */
	gutterRight: number
	textX: number
	/** Top of the first row. */
	top: number
	lines: number
	/** The line and column under a point (clamped into the code). */
	caretAt(point: VecLike): { line: number; column: number }
}

/** The code split into lines (tabs as spaces). */
export const codeLines = (code: string) => code.replace(/\t/g, INDENT).split('\n')

/** `left`: room before the box for pointers at its lines. */
export function getCodeLayout(code: string, metrics: CodeMetrics, { lineNumbers = false, left = 0 } = {}): CodeLayout {
	const { charW, lineH, padX, padY } = metrics
	const lines = codeLines(code)
	const digits = String(lines.length).length
	const gutterW = lineNumbers ? (digits + 1.5) * charW : 0
	const textX = left + padX + gutterW
	const columns = Math.max(MIN_COLUMNS, ...lines.map((l) => l.length))
	const box = { x: left, y: 0, w: padX + gutterW + columns * charW + padX, h: padY * 2 + lines.length * lineH }
	return {
		box,
		lineAt: (i) => ({ x: textX, y: padY + (i + 0.5) * lineH }),
		rowBox: (i) => ({ x: left, y: padY + i * lineH, w: box.w, h: lineH }),
		gutterRight: textX - charW * 1.2,
		textX,
		top: padY,
		lines: lines.length,
		caretAt(point) {
			const line = Math.min(lines.length - 1, Math.max(0, Math.floor((point.y - padY) / lineH)))
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
