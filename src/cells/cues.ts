import { persistedFlag } from '../data/persisted'
import type { MarkColor } from './marks'

/**
 * Colour-blind cues, a per-browser preference (off by default): every mark and highlight also gets a
 * shape, so a student who can't tell orange from green on the board still can. Elements (cells,
 * nodes) carry a small badge in their top-left corner, edges a line pattern. The shapes stand for
 * the colour, not a meaning: a colour means different things in different operations (red is a
 * pivot, the current node, or a value on its way out).
 */
export const CUE_SHAPES = {
	red: 'triangle',
	orange: 'diamond',
	green: 'square',
	blue: 'circle',
} as const satisfies Record<MarkColor, string>

export type CueShape = (typeof CUE_SHAPES)[MarkColor]

/** The same shapes as text, for menus (a legend beside each colour). */
export const CUE_GLYPHS: Record<MarkColor, string> = { red: '▲', orange: '◆', green: '■', blue: '●' }

const cues = persistedFlag('colour cues', 'drawds:colour-cues')

/** Whether marks and highlights carry shapes as well as colours. Reactive. */
export const showsColourCues = () => cues.get()

export const setColourCues = (on: boolean) => cues.set(on)

/**
 * The line pattern of a marked or highlighted edge drawn `width` wide, with round caps: green
 * solid, red dashes, orange dots, blue dash-dot.
 */
export function cueDash(color: MarkColor, width: number): string | undefined {
	switch (color) {
		case 'green':
			return undefined
		case 'red':
			return `${width * 2.4} ${width * 1.8}`
		case 'orange':
			return `0.01 ${width * 2}`
		case 'blue':
			return `${width * 2.4} ${width * 1.6} 0.01 ${width * 1.6}`
	}
}

export interface CueBadgeAt {
	x: number
	y: number
	r: number
}

/**
 * Where an element's badge goes: inside a box's top-left corner (`inset` clear of its outline), or
 * on a circle's rim at the top left, small enough to stay inside the circle's bounding box (so
 * inside the shape). `right`: the top-right instead, when something else sits at the top left.
 * Boxes are given by centre and size, as scene nodes are.
 */
export function cueBadgeAt(node: { x: number; y: number; w: number; h: number }, round: boolean, inset: number, right = false): CueBadgeAt {
	const side = right ? 1 : -1
	if (round) {
		// On the rim of a circle, or of a stadium's end (a long value).
		const R = Math.min(node.w, node.h) / 2
		const rim = R * Math.SQRT1_2
		return { x: node.x + side * (node.w / 2 - R + rim), y: node.y - rim, r: R * 0.28 }
	}
	const r = Math.min(node.w, node.h) * 0.14
	return { x: node.x + side * (node.w / 2 - inset - r), y: node.y - node.h / 2 + inset + r, r }
}
