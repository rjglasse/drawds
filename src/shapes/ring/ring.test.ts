import { describe, expect, it } from 'vitest'
import { ringLayout } from './model'

describe('a circular buffer as a ring', () => {
	it('its cells round a circle, index 0 at the top and on clockwise, about a cell long each', () => {
		const ring = ringLayout(8, 48)
		expect(ring.cells).toHaveLength(8)
		const { x: cx, y: cy } = ring.centre
		const middle = (ring.outer + ring.inner) / 2
		for (const c of ring.cells) expect(Math.hypot(c.centre.x - cx, c.centre.y - cy)).toBeCloseTo(middle)
		// Cell 0 just right of the top, cell 2 right of the centre, cell 4 below, cell 6 left: clockwise.
		expect(ring.cells[0].centre.y).toBeLessThan(cy)
		expect(ring.cells[0].centre.x).toBeGreaterThan(cx)
		expect(ring.cells[2].centre.x).toBeGreaterThan(cx)
		expect(ring.cells[4].centre.y).toBeGreaterThan(cy)
		expect(ring.cells[6].centre.x).toBeLessThan(cx)
		expect((2 * Math.PI * middle) / 8).toBeCloseTo(48, 0)
		expect(ring.outer - ring.inner).toBe(48)
	})

	it('a marker points at its cell from outside; everything lies in the box', () => {
		const ring = ringLayout(5, 48)
		const { x: cx, y: cy } = ring.centre
		const { from, to, label } = ring.marker(3)
		const dist = (p: { x: number; y: number }) => Math.hypot(p.x - cx, p.y - cy)
		expect(dist(to)).toBeGreaterThan(ring.outer)
		expect(dist(from)).toBeGreaterThan(dist(to))
		expect(dist(label)).toBeGreaterThan(dist(from))
		// Along the line through cell 3's middle.
		const a = ring.cells[3].mid
		expect(Math.atan2(to.y - cy, to.x - cx)).toBeCloseTo(Math.atan2(Math.sin(a), Math.cos(a)))
		for (const p of [from, to, label]) {
			expect(p.x).toBeGreaterThan(0)
			expect(p.x).toBeLessThan(ring.size.w)
			expect(p.y).toBeGreaterThan(0)
			expect(p.y).toBeLessThan(ring.size.h)
		}
		// Small buffers still make a ring of a sensible size; one cell is the whole ring.
		expect(ringLayout(2, 48).outer).toBe(72)
		expect(ringLayout(1, 48).cells[0].path).toContain('A')
	})
})
