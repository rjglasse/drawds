import { describe, expect, it } from 'vitest'
import { barSpot, barSpots, MIN_BAR_WIDTH } from './placement'

// The play bar keeps close under its structure when it fits beside what follows it (dds-9hm).

describe('where the play bar goes', () => {
	// An array 0..400 wide ending at y = 100; a recursion tree beside it to 400 deep, a tall code box past it.
	const tree = { x: 460, y: 0, w: 300, h: 400 }
	const code = { x: 820, y: 0, w: 500, h: 1400 }
	const spots = barSpots(0, 120, [tree, code], 20)
	const placement = { strip: { x: 0, y: 120 }, bar: { x: 0, y: 1420 }, spots }

	it('spots: under the structure, then under each box in turn, each as wide as the room before the next box down', () => {
		expect(spots).toEqual([
			{ x: 0, y: 120, room: 440 },
			{ x: 0, y: 420, room: 800 },
			{ x: 0, y: 1420, room: Infinity },
		])
	})

	it('the highest spot the bar fits at this zoom, never under the code box if there is room beside it', () => {
		// At 100%, 440 px is too narrow (< MIN_BAR_WIDTH), 800 px fits: under the tree, beside the code.
		expect(MIN_BAR_WIDTH).toBeGreaterThan(440)
		expect(barSpot(placement, 1)).toEqual({ x: 0, y: 420, maxWidth: 800 })
		// Zoomed in, the room under the array is enough.
		expect(barSpot(placement, 1.2)).toEqual({ x: 0, y: 120, maxWidth: 528 })
		// Zoomed far out, nothing beside fits: under everything.
		expect(barSpot(placement, 0.3)).toEqual({ x: 0, y: 1420 })
		// Nothing beside: right under the structure, as wide as it likes.
		expect(barSpot({ ...placement, spots: barSpots(0, 120, [], 20) }, 1)).toEqual({ x: 0, y: 120 })
	})
})
