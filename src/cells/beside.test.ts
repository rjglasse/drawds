import { describe, expect, it } from 'vitest'
import { spotBeside } from './beside'

describe('where a shape beside a structure goes (the code beside it, its memory)', () => {
	const structure = { x: 0, y: 0, w: 100, h: 50 }
	const box = { x: 116, y: 0, w: 200, h: 40 }
	it('to its right, if nothing is in the way', () => {
		expect(spotBeside(structure, box, [])).toEqual({ x: 0, y: 0 })
		expect(spotBeside(structure, box, [{ x: 0, y: 200, w: 400, h: 50 }])).toEqual({ x: 0, y: 0 })
		// Half the gap clear of anything else is enough.
		expect(spotBeside(structure, box, [{ x: 324, y: 0, w: 50, h: 50 }])).toEqual({ x: 0, y: 0 })
	})
	it('else under it, past anything in the way there, or further right, whichever is nearer', () => {
		// Another structure to its right: it goes straight under it.
		expect(spotBeside(structure, box, [{ x: 200, y: 0, w: 100, h: 40 }])).toEqual({ x: -116, y: 66 })
		// A wide one to its right, and something under it too, reaching lower: under that.
		expect(spotBeside(structure, box, [{ x: 200, y: 0, w: 600, h: 40 }, { x: 0, y: 90, w: 120, h: 160 }])).toEqual({ x: -116, y: 258 })
		// A tall box beside a short structure, another structure below them both: right, past it.
		const tall = { x: 116, y: 0, w: 200, h: 250 }
		expect(spotBeside(structure, tall, [{ x: 0, y: 200, w: 400, h: 150 }])).toEqual({ x: 292, y: 0 })
	})
})
