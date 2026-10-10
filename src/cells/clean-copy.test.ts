import { describe, expect, it } from 'vitest'
import { freeTopBelow } from './clean-copy'

describe('clean copy placement', () => {
	const box = { x: 100, y: 100, w: 200, h: 50 }

	it('goes straight under the structure when there is room', () => {
		expect(freeTopBelow(box, [], 40)).toBe(190)
		// Beside it (no overlap across) doesn't count.
		expect(freeTopBelow(box, [{ x: 320, y: 180, w: 100, h: 100 }], 40)).toBe(190)
	})

	it('moves further down past anything in the way, until the copy fits', () => {
		const below = { x: 150, y: 200, w: 50, h: 30 }
		expect(freeTopBelow(box, [below], 40)).toBe(270)
		// A second one just under the first: past that too; a gap big enough between them is used.
		expect(freeTopBelow(box, [below, { x: 0, y: 300, w: 500, h: 20 }], 40)).toBe(360)
		expect(freeTopBelow(box, [below, { x: 0, y: 500, w: 500, h: 20 }], 40)).toBe(270)
	})
})
