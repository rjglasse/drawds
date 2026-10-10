import type { CodeLanguage } from './highlight'
import { INDENT } from './layout'

// What the code box's keys do to the text, as one range replaced (so the browser's own undo in the
// editor keeps up) and where the selection goes after it.

export interface CodeEdit {
	/** Replace text[from, to) with `insert`... */
	from: number
	to: number
	insert: string
	/** ...then select [selStart, selEnd) of the new text. */
	selStart: number
	selEnd: number
}

const lineStartOf = (text: string, at: number) => text.lastIndexOf('\n', at - 1) + 1
const lineEndOf = (text: string, at: number) => {
	const end = text.indexOf('\n', at)
	return end < 0 ? text.length : end
}

/**
 * Tab and Shift+Tab: with the caret in a line (no selection) Tab inserts an indent there; with a
 * selection, or Shift+Tab, every line it touches moves in or out by one indent.
 */
export function indentEdit(text: string, start: number, end: number, out: boolean): CodeEdit {
	if (!out && start === end) return { from: start, to: end, insert: INDENT, selStart: start + INDENT.length, selEnd: start + INDENT.length }
	// A selection ending at the start of a line doesn't take that line in.
	const last = end > start && text[end - 1] === '\n' ? end - 1 : end
	const from = lineStartOf(text, start)
	const to = lineEndOf(text, last)
	const lines = text.slice(from, to).split('\n')
	const moved = lines.map((line) => (out ? line.replace(new RegExp(`^ {1,${INDENT.length}}`), '') : INDENT + line))
	const shift = (k: number) => moved[k].length - lines[k].length
	const insert = moved.join('\n')
	// The selection keeps its text: its start moves with its line (not before that line's start).
	const selStart = Math.max(from, start + shift(0))
	const selEnd = Math.max(from, end + (insert.length - (to - from)))
	return { from, to, insert, selStart: start === end ? selEnd : selStart, selEnd }
}

/**
 * Enter: a new line indented like this one, one more after a line opening a block ('{', or ':' in
 * Python); between '{' and '}' the brace goes onto a line of its own under the new one.
 */
export function newlineEdit(text: string, start: number, end: number, language: CodeLanguage): CodeEdit {
	const from = lineStartOf(text, start)
	const before = text.slice(from, start)
	const indent = /^ */.exec(before)![0]
	const opens = language === 'python' ? /:\s*(#.*)?$/.test(before) : /\{\s*$/.test(before)
	const inner = opens ? indent + INDENT : indent
	const closes = opens && language !== 'python' && /^\s*\}/.test(text.slice(end, lineEndOf(text, end)))
	const insert = '\n' + inner + (closes ? '\n' + indent : '')
	const caret = start + 1 + inner.length
	return { from: start, to: end, insert, selStart: caret, selEnd: caret }
}

/** A '}' typed on a line with nothing but spaces before it closes the block: it moves out one indent. */
export function closeBraceEdit(text: string, start: number, end: number): CodeEdit | undefined {
	const from = lineStartOf(text, start)
	const before = text.slice(from, start)
	if (start !== end || !/^ +$/.test(before)) return undefined
	const indent = before.slice(0, Math.max(0, before.length - INDENT.length))
	return { from, to: start, insert: indent + '}', selStart: from + indent.length + 1, selEnd: from + indent.length + 1 }
}

/** The text after an edit. */
export const applyEdit = (text: string, edit: CodeEdit) => text.slice(0, edit.from) + edit.insert + text.slice(edit.to)
