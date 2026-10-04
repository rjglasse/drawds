import { describe, expect, it } from 'vitest'
import { arrayShapeMigrations } from './array-shape-types'

describe('array shape migrations', () => {
	const [addFillAndSeed] = arrayShapeMigrations.sequence

	it('adds fill and seed to arrays saved before they existed', () => {
		const props: Record<string, unknown> = { values: ['1', '2'], direction: 'horizontal', showIndices: true }
		if (!('up' in addFillAndSeed)) throw new Error('expected a props migration')
		addFillAndSeed.up(props)
		expect(props).toMatchObject({ fill: 'random', seed: 0, values: ['1', '2'] })
		if (typeof addFillAndSeed.down !== 'function') throw new Error('expected a down migration')
		addFillAndSeed.down(props)
		expect(props).not.toHaveProperty('fill')
		expect(props).not.toHaveProperty('seed')
	})

	it('arrays saved before fixed capacity existed grow, every value in use', () => {
		const addSizing = arrayShapeMigrations.sequence[3]
		if (!('up' in addSizing) || typeof addSizing.down !== 'function') throw new Error('expected a props migration')
		const props: Record<string, unknown> = { values: ['1', '2', '3'] }
		addSizing.up(props)
		expect(props).toMatchObject({ sizing: 'grows', used: 3 })
		addSizing.down(props)
		expect(props).not.toHaveProperty('sizing')
		expect(props).not.toHaveProperty('used')
	})

	it('arrays saved before stacks and queues existed are plain arrays', () => {
		const addKind = arrayShapeMigrations.sequence[4]
		if (!('up' in addKind) || typeof addKind.down !== 'function') throw new Error('expected a props migration')
		const props: Record<string, unknown> = { values: ['1'] }
		addKind.up(props)
		expect(props).toMatchObject({ kind: 'array', front: 0 })
		addKind.down(props)
		expect(props).not.toHaveProperty('kind')
	})
})
