import { describe, expect, it } from 'vitest'
import { heapShapeMigrations } from '../shapes/heap/heap-shape-types'
import { treeShapeMigrations } from '../shapes/tree/tree-shape-types'

describe('invariant migrations', () => {
	for (const [name, sequence] of Object.entries({ treeShapeMigrations, heapShapeMigrations })) {
		it(`${name}: shapes saved before the check existed get it on`, () => {
			const step = sequence.sequence.at(-1)!
			if (!('up' in step) || typeof step.down !== 'function') throw new Error('expected a props migration')
			const props: Record<string, unknown> = {}
			step.up(props)
			expect(props.invariant).toBe('check')
			step.down(props)
			expect(props).not.toHaveProperty('invariant')
		})
	}
})
