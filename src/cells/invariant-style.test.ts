import { describe, expect, it } from 'vitest'
import { heapShapeMigrations } from '../shapes/heap/heap-shape-types'
import { treeShapeMigrations } from '../shapes/tree/tree-shape-types'

describe('invariant migrations', () => {
	for (const [name, sequence] of Object.entries({ treeShapeMigrations, heapShapeMigrations })) {
		it(`${name}: shapes saved before the check existed get it on`, () => {
			const step = sequence.sequence.find((s) => {
				if (!('up' in s)) return false
				const props: Record<string, unknown> = {}
				s.up(props)
				return 'invariant' in props
			})
			if (!step || !('up' in step) || typeof step.down !== 'function') throw new Error('expected a props migration')
			const props: Record<string, unknown> = {}
			step.up(props)
			expect(props.invariant).toBe('check')
			step.down(props)
			expect(props).not.toHaveProperty('invariant')
		})
	}
})

describe('fill range migrations', () => {
	it('arrays, lists, trees and heaps saved before ranges draw from 0-99', async () => {
		const { arrayShapeMigrations } = await import('../shapes/array/array-shape-types')
		const { listShapeMigrations } = await import('../shapes/list/list-shape-types')
		for (const sequence of [arrayShapeMigrations, listShapeMigrations, treeShapeMigrations, heapShapeMigrations]) {
			const step = sequence.sequence.find((s) => {
				if (!('up' in s)) return false
				const props: Record<string, unknown> = { values: [], marks: {} }
				s.up(props)
				return 'range' in props
			})
			if (!step || !('up' in step) || typeof step.down !== 'function') throw new Error('expected a range migration')
			const props: Record<string, unknown> = {}
			step.up(props)
			expect(props.range).toBe('medium')
			step.down(props)
			expect(props).not.toHaveProperty('range')
		}
	})
})
