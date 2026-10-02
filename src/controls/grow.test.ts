import { describe, expect, it } from 'vitest'
import { MAX_ELEMENTS, grownCount } from './grow'

const RIGHT = { x: 1, y: 0 }
const UP = { x: 0, y: -1 }
const at = { x: 100, y: 0 }

describe('grownCount', () => {
	it('adds one element per step, from half a step', () => {
		expect(grownCount(3, at, { x: 123, y: 0 }, RIGHT, 48)).toBe(3)
		expect(grownCount(3, at, { x: 124, y: 0 }, RIGHT, 48)).toBe(4)
		expect(grownCount(3, at, { x: 100 + 48 * 2.4, y: 30 }, RIGHT, 48)).toBe(5)
	})

	it('removes elements when dragged back, keeping at least one', () => {
		expect(grownCount(3, at, { x: 100 - 48, y: 0 }, RIGHT, 48)).toBe(2)
		expect(grownCount(3, at, { x: -900, y: 0 }, RIGHT, 48)).toBe(1)
	})

	it('measures along the growth axis only', () => {
		expect(grownCount(2, at, { x: 100, y: -100 }, UP, 50)).toBe(4)
		expect(grownCount(2, at, { x: 300, y: 0 }, UP, 50)).toBe(2)
	})

	it('caps very long drags', () => {
		expect(grownCount(3, at, { x: 1e6, y: 0 }, RIGHT, 48)).toBe(MAX_ELEMENTS)
	})
})
