import type { TLDefaultFontStyle, TLDefaultSizeStyle } from 'tldraw'
import { CELL_SIZES } from '../sizes'
import { CHAR_WIDTH } from './calls'
import { FUNCTIONS, type CodeLine, type StackFrameView, type Trace, type Traced } from './tracer'

// Where a tracer draws things: a title, the call stack (an outline with room for the deepest the
// run goes, main in the bottom slot), and the function's code under it. Sized once for the whole
// run (every frame's text at every step), so nothing moves while it plays. Shape space: the box
// starts at 0,0; `offset` is where main's slot starts, which `layoutOffset` keeps still on the page
// when a new call needs a taller stack.

export interface Box {
	x: number
	y: number
	w: number
	h: number
}

export interface CodeLineLayout {
	text: string
	note?: string
	line?: CodeLine
	/** Vertical centre. */
	y: number
}

export interface TracerLayout {
	fontSize: number
	strokeWidth: number
	/** Slots the stack has room for, main's included. */
	slots: number
	/** Slot i (0: main, at the bottom). */
	slotBox(i: number): Box
	/** How wide a frame's call is; the rest of the frame is its work. */
	callW: number
	title: { x: number; y: number }
	stack: Box
	code: { box: Box; fontSize: number; lineH: number; padX: number; noteX: number; lines: CodeLineLayout[] }
	box: Box
	offset: { x: number; y: number }
}

export function tracerLayout(
	{ fn, size, font }: { fn: Traced; size: TLDefaultSizeStyle; font: TLDefaultFontStyle },
	call: string,
	trace: Trace | undefined
): TracerLayout {
	const cell = CELL_SIZES[size]
	const fontSize = cell * 0.3
	const charW = fontSize * CHAR_WIDTH[font]
	const pad = fontSize * 0.6
	const strokeWidth = Math.max(1.5, cell / 24)
	// The stack fills up when it overflows; otherwise one slot to spare above the deepest call.
	const slots = trace ? (trace.overflowed ? trace.depth : trace.depth + 1) : 2
	const texts: StackFrameView[] = [{ call: 'main', work: call }, ...(trace?.texts ?? [])]
	const callW = Math.max(...texts.map((t) => t.call.length)) * charW + pad * 2
	const workW = Math.max(fontSize * 4, Math.max(...texts.map((t) => t.work.length)) * charW + pad * 2)
	const frameH = fontSize * 2.2
	const titleH = fontSize * 1.8

	const { code: lines } = FUNCTIONS[fn]
	const codeFont = fontSize * 0.85
	const codeCharW = codeFont * CHAR_WIDTH.mono
	const noteFont = codeFont * 0.85
	const lineH = codeFont * 1.6
	const padX = codeFont * 0.7
	const padY = codeFont * 0.4
	const noteX = padX + Math.max(...lines.map((l) => l.text.length)) * codeCharW + codeFont * 1.5
	const codeW = noteX + Math.max(0, ...lines.map((l) => (l.note ? l.note.length + 3 : 0))) * noteFont * CHAR_WIDTH.mono + padX
	// Frames as wide as the code under them (or wider, for long values): one card.
	const frameW = Math.max(callW + workW, codeW)
	const stack = { x: 0, y: titleH, w: frameW, h: slots * frameH }
	const slotBox = (i: number): Box => ({ x: 0, y: titleH + (slots - 1 - i) * frameH, w: frameW, h: frameH })
	const codeY = stack.y + stack.h + fontSize * 0.9
	const code = {
		box: { x: 0, y: codeY, w: frameW, h: lines.length * lineH + padY * 2 },
		fontSize: codeFont,
		lineH,
		padX,
		noteX,
		lines: lines.map((l, k) => ({ ...l, y: codeY + padY + (k + 0.5) * lineH })),
	}
	return {
		fontSize,
		strokeWidth,
		slots,
		slotBox,
		callW,
		title: { x: 0, y: titleH * 0.45 },
		stack,
		code,
		box: { x: 0, y: 0, w: frameW, h: code.box.y + code.box.h },
		offset: { x: 0, y: slotBox(0).y },
	}
}
