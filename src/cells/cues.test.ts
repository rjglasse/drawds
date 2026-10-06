import { describe, expect, it } from 'vitest'
import { CUE_GLYPHS, CUE_SHAPES, cueBadgeAt, cueDash } from './cues'
import { MARK_COLORS } from './marks'

describe('colour-blind cues', () => {
	it('gives every mark colour its own shape, glyph and line pattern', () => {
		expect(new Set(MARK_COLORS.map((c) => CUE_SHAPES[c])).size).toBe(MARK_COLORS.length)
		expect(new Set(MARK_COLORS.map((c) => CUE_GLYPHS[c])).size).toBe(MARK_COLORS.length)
		expect(new Set(MARK_COLORS.map((c) => cueDash(c, 4) ?? 'solid')).size).toBe(MARK_COLORS.length)
	})

	it('scales line patterns with the stroke', () => {
		expect(cueDash('red', 2)).toBe('4.8 3.6')
		expect(cueDash('red', 4)).toBe('9.6 7.2')
		expect(cueDash('green', 4)).toBeUndefined()
	})

	const inside = (b: { x: number; y: number; r: number }, box: { x: number; y: number; w: number; h: number }) =>
		b.x - b.r >= box.x - 1e-9 && b.y - b.r >= box.y - 1e-9 && b.x + b.r <= box.x + box.w + 1e-9 && b.y + b.r <= box.y + box.h + 1e-9

	it("puts a box's badge inside its top-left corner, clear of the outline", () => {
		const node = { x: 24, y: 24, w: 48, h: 48 }
		const b = cueBadgeAt(node, false, 2)
		expect(inside(b, { x: 2, y: 2, w: 44, h: 44 })).toBe(true)
		expect(b.x).toBeLessThan(24)
		expect(b.y).toBeLessThan(24)
		const right = cueBadgeAt(node, false, 2, true)
		expect(right.x).toBeCloseTo(48 - b.x)
		expect(right.y).toBe(b.y)
	})

	it("puts a circle's badge on its rim, inside the circle's bounding box (so inside the shape)", () => {
		const node = { x: 30, y: 30, w: 48, h: 48 }
		const box = { x: 6, y: 6, w: 48, h: 48 }
		for (const right of [false, true]) {
			const b = cueBadgeAt(node, true, 2, right)
			expect(inside(b, box)).toBe(true)
			expect(Math.hypot(b.x - node.x, b.y - node.y)).toBeCloseTo(24)
			expect(Math.sign(b.x - node.x)).toBe(right ? 1 : -1)
		}
	})
})
