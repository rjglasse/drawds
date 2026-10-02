import type { Box, Point } from '../nodelink/geometry'
import type { Pointer } from './pointers'

/** Which side of its element a pointer is drawn on (it points from there towards the element). */
export type PointerSide = 'above' | 'below' | 'left' | 'right'

/** Where pointers at an element go: the element's box (shape space) and the side they come from. */
export interface PointerAnchor {
	box: Box
	side: PointerSide
}

/** A pointer laid out: its label box (top-left corner) and its arrow from `tail` to `tip`. */
export interface PlacedPointer {
	pointer: Pointer
	label: Box
	tail: Point
	tip: Point
}

export function pointerLabelSize(name: string, fontSize: number) {
	return { w: Math.max(fontSize * 1.4, name.length * fontSize * 0.62 + fontSize * 0.7), h: fontSize * 1.45 }
}

/**
 * Lay out every pointer whose element has an anchor. Pointers sharing an element sit side by side
 * (above / below) or stacked (left / right), each with its own short arrow onto the element.
 */
export function placePointers(
	pointers: readonly Pointer[],
	anchorOf: (key: string) => PointerAnchor | undefined,
	fontSize: number
): PlacedPointer[] {
	const groups = new Map<string, Pointer[]>()
	for (const p of pointers) groups.set(p.at, [...(groups.get(p.at) ?? []), p])
	const gap = fontSize * 0.3
	const arrow = fontSize * 1.15
	const placed: PlacedPointer[] = []
	for (const [key, group] of groups) {
		const anchor = anchorOf(key)
		if (!anchor) continue
		const { box, side } = anchor
		const sizes = group.map((p) => pointerLabelSize(p.name, fontSize))
		if (side === 'above' || side === 'below') {
			const total = sizes.reduce((sum, s) => sum + s.w, 0) + gap * (group.length - 1)
			let x = box.x + box.w / 2 - total / 2
			group.forEach((pointer, i) => {
				const { w, h } = sizes[i]
				const tip = { x: box.x + (box.w * (i + 1)) / (group.length + 1), y: side === 'above' ? box.y : box.y + box.h }
				const y = side === 'above' ? box.y - arrow - h : box.y + box.h + arrow
				const tail = { x: x + w / 2, y: side === 'above' ? y + h : y }
				placed.push({ pointer, label: { x, y, w, h }, tail, tip })
				x += w + gap
			})
		} else {
			const total = sizes.reduce((sum, s) => sum + s.h, 0) + gap * (group.length - 1)
			let y = box.y + box.h / 2 - total / 2
			group.forEach((pointer, i) => {
				const { w, h } = sizes[i]
				const tip = { x: side === 'left' ? box.x : box.x + box.w, y: box.y + (box.h * (i + 1)) / (group.length + 1) }
				const x = side === 'left' ? box.x - arrow - w : box.x + box.w + arrow
				const tail = { x: side === 'left' ? x + w : x, y: y + h / 2 }
				placed.push({ pointer, label: { x, y, w, h }, tail, tip })
				y += h + gap
			})
		}
	}
	return placed
}

/** The placed pointer whose label contains `p`, if any (topmost last). */
export function pointerAt(placed: readonly PlacedPointer[], p: Point): PlacedPointer | undefined {
	return [...placed]
		.reverse()
		.find(({ label }) => p.x >= label.x && p.x <= label.x + label.w && p.y >= label.y && p.y <= label.y + label.h)
}
