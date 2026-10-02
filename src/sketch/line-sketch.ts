/** Where a drag-to-grow sketch currently is: which way it grows and how many items it has. */
export interface SketchState {
	direction: 'horizontal' | 'vertical'
	/** +1 grows right/down from the first item, -1 grows left/up. */
	sign: 1 | -1
	count: number
}

export const INITIAL_SKETCH: SketchState = { direction: 'horizontal', sign: 1, count: 1 }

/**
 * Advance a sketch given the pointer's offset (dx, dy) from where the drag started.
 *
 * The first item is centred on the drag origin, and a new item appears as soon as the pointer
 * crosses into the next item's footprint (`step` apart), so the pointer always sits inside the
 * last item. While the sketch is a single item its axis and sign follow the drag; once it has
 * grown, the axis is locked until the pointer comes back to the first item.
 */
export function nextSketchState(prev: SketchState, dx: number, dy: number, step: number): SketchState {
	let { direction, sign } = prev
	if (prev.count <= 1) {
		if (Math.abs(dx) >= Math.abs(dy)) {
			direction = 'horizontal'
			sign = dx < 0 ? -1 : 1
		} else {
			direction = 'vertical'
			sign = dy < 0 ? -1 : 1
		}
	}
	const along = (direction === 'horizontal' ? dx : dy) * sign
	const count = Math.max(1, Math.floor(along / step + 1.5))
	return { direction, sign, count }
}

export function sameSketch(a: SketchState, b: SketchState) {
	return a.count === b.count && a.direction === b.direction && a.sign === b.sign
}
