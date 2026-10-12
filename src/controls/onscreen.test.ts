import { describe, expect, it } from 'vitest'
import { cameraToShow } from './onscreen'

// tldraw's screen point is (page + camera) × zoom.
const onScreen = (c: { x: number; y: number; z: number }, box: { x: number; y: number; w: number; h: number }) => ({
	x: (box.x + c.x) * c.z,
	y: (box.y + c.y) * c.z,
	w: box.w * c.z,
	h: box.h * c.z,
})

describe('keeping what an operation opens on screen', () => {
	const room = { x: 16, y: 56, w: 1200, h: 650 }
	it('nothing to do when it all shows', () => {
		expect(cameraToShow({ x: 0, y: 0, z: 1 }, room, { x: 100, y: 100, w: 800, h: 300 })).toBeUndefined()
	})

	it('panned as little as can be when it fits at this zoom', () => {
		const box = { x: 200, y: 100, w: 1100, h: 300 }
		const c = cameraToShow({ x: 0, y: 0, z: 1 }, room, box)!
		expect(c.z).toBe(1)
		const s = onScreen(c, box)
		expect(s.x + s.w).toBeCloseTo(room.x + room.w)
		expect(s.y).toBe(100)
	})

	it('zoomed out to fit when it can’t, top-aligned and centred; never zoomed in, nor out past 0.4', () => {
		const box = { x: 200, y: 100, w: 1500, h: 300 }
		const c = cameraToShow({ x: 0, y: 0, z: 1 }, room, box)!
		expect(c.z).toBeCloseTo(1200 / 1500)
		const s = onScreen(c, box)
		expect(s.x).toBeCloseTo(room.x)
		expect(s.y).toBeCloseTo(room.y)
		expect(cameraToShow({ x: 0, y: 0, z: 0.5 }, room, { x: 100, y: 200, w: 100, h: 100 })).toBeUndefined()
		expect(cameraToShow({ x: 0, y: 0, z: 1 }, room, { x: 0, y: 0, w: 10000, h: 100 })!.z).toBe(0.4)
	})
})
