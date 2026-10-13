import { describe, expect, it } from 'vitest'
import { CAPTION_SIZES, nextCaptionSize } from './caption-size'

describe('the caption size', () => {
	it('steps up and down through the sizes, staying within them', () => {
		expect(nextCaptionSize(13, 1)).toBe(16)
		expect(nextCaptionSize(16, -1)).toBe(13)
		expect(nextCaptionSize(13, -1)).toBe(13)
		const largest = CAPTION_SIZES[CAPTION_SIZES.length - 1]
		expect(nextCaptionSize(largest, 1)).toBe(largest)
		// A size between steps (stored by an older version) goes to the nearest step from it.
		expect(nextCaptionSize(18, 1)).toBe(24)
		expect(nextCaptionSize(18, -1)).toBe(16)
	})
})
