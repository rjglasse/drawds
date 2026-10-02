import { T } from 'tldraw'

/**
 * Colours a teacher can mark an element with, live, by pointing at it and pressing 1-4. The
 * meanings are suggestions shown in the menus; nothing enforces them.
 */
export const MARK_COLORS = ['red', 'orange', 'green', 'blue'] as const
export type MarkColor = (typeof MARK_COLORS)[number]

export const MARK_MEANINGS: Record<MarkColor, string> = {
	red: 'pivot',
	orange: 'comparing',
	green: 'sorted',
	blue: 'visited',
}

/** Marks on a shape's elements, keyed by cell key (array index, node id). */
export type Marks = Record<string, MarkColor>

export const marksValidator = T.dict(T.string, T.literalEnum(...MARK_COLORS))

/** Set an element's mark; setting the colour it already has (or null) clears it. */
export function toggleMark(marks: Marks, key: string, color: MarkColor | null): Marks {
	const next = { ...marks }
	if (color === null || next[key] === color) delete next[key]
	else next[key] = color
	return next
}

/** Drop marks on elements that no longer exist (ids can be reused, e.g. a tree's path ids). */
export function pruneMarks(marks: Marks, keep: Iterable<string>): Marks {
	const live = new Set(keep)
	return Object.fromEntries(Object.entries(marks).filter(([key]) => live.has(key)))
}

/** Exchange two elements' marks, so marks travel with values that swap places. */
export function swapMarks(marks: Marks, a: string, b: string): Marks {
	const next = { ...marks }
	delete next[a]
	delete next[b]
	if (marks[a]) next[b] = marks[a]
	if (marks[b]) next[a] = marks[b]
	return next
}
