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
})
