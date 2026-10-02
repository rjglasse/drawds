import { describe, expect, it } from 'vitest'
import { arrayKey, heapScene, heapTreeNodes, indexOfKey } from './layout'

describe('heap layout', () => {
	const values = ['1', '3', '2', '7', '4']

	it('links index i to children 2i+1 and 2i+2', () => {
		expect(heapTreeNodes(values).map((n) => n.children)).toEqual([
			['1', '2'],
			['3', '4'],
			[null, null],
			[null, null],
			[null, null],
		])
	})

	it('draws the tree with the array below, cells in index order', () => {
		const scene = heapScene({ values, size: 'm' })
		const at = (k: string) => scene.nodes.find((n) => n.key === k)!
		const lowestNode = Math.max(...values.map((_, i) => at(String(i)).y))
		expect(at(arrayKey(0)).y).toBeGreaterThan(lowestNode)
		expect(at(arrayKey(1)).x).toBeGreaterThan(at(arrayKey(0)).x)
		expect(at(arrayKey(3)).value).toBe('7')
		expect(Math.min(...scene.nodes.map((n) => n.x - n.w / 2))).toBeCloseTo(0)
	})

	it('maps both views of an index to the same slot', () => {
		expect(indexOfKey('3')).toBe(3)
		expect(indexOfKey('a3')).toBe(3)
		expect(indexOfKey('#index3')).toBeUndefined()
	})
})
