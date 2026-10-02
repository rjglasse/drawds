import { describe, expect, it } from 'vitest'
import type { ArrayShape } from './array-shape-types'
import { arrayCells } from './cells'
import { getArrayMetrics } from './layout'

function arrayShape(values: string[], direction: 'horizontal' | 'vertical' = 'horizontal') {
	return {
		id: 'shape:test',
		type: 'array',
		props: { values, direction, showIndices: true, color: 'black', size: 'm', font: 'mono' },
	} as unknown as ArrayShape
}

const CELL = getArrayMetrics({ size: 'm', showIndices: true }).cell

describe('arrayCells.cellAt', () => {
	const shape = arrayShape(['3', '1', '4', '1'])

	it('finds the cell under a point', () => {
		expect(arrayCells.cellAt(shape, { x: 5, y: 5 })).toBe('0')
		expect(arrayCells.cellAt(shape, { x: CELL * 2.5, y: CELL / 2 })).toBe('2')
		expect(arrayCells.cellAt(shape, { x: CELL * 4, y: CELL / 2 })).toBe('3')
	})

	it('ignores the index gutter', () => {
		expect(arrayCells.cellAt(shape, { x: 5, y: CELL + 5 })).toBeUndefined()
	})

	it('accounts for the gutter on the left of vertical arrays', () => {
		const vertical = arrayShape(['3', '1', '4'], 'vertical')
		const gutter = getArrayMetrics({ size: 'm', showIndices: true }).gutter
		expect(arrayCells.cellAt(vertical, { x: gutter / 2, y: 5 })).toBeUndefined()
		expect(arrayCells.cellAt(vertical, { x: gutter + 5, y: CELL * 1.5 })).toBe('1')
	})
})

describe('arrayCells.neighbor', () => {
	const row = arrayShape(['a', 'b', 'c'])
	const column = arrayShape(['a', 'b', 'c'], 'vertical')

	it('moves along the array in reading order', () => {
		expect(arrayCells.neighbor(row, '0', 'next')).toBe('1')
		expect(arrayCells.neighbor(row, '1', 'prev')).toBe('0')
	})

	it('stops at the ends', () => {
		expect(arrayCells.neighbor(row, '2', 'next')).toBeUndefined()
		expect(arrayCells.neighbor(row, '0', 'prev')).toBeUndefined()
	})

	it('follows arrows only along the array axis', () => {
		expect(arrayCells.neighbor(row, '1', 'right')).toBe('2')
		expect(arrayCells.neighbor(row, '1', 'down')).toBeUndefined()
		expect(arrayCells.neighbor(column, '1', 'down')).toBe('2')
		expect(arrayCells.neighbor(column, '1', 'left')).toBeUndefined()
	})
})

describe('arrayCells.setValue', () => {
	it('replaces one value without touching the others', () => {
		const shape = arrayShape(['3', '1', '4'])
		expect(arrayCells.setValue(shape, '0', '42')).toEqual({
			id: shape.id,
			type: 'array',
			props: { values: ['42', '1', '4'] },
		})
		expect(shape.props.values).toEqual(['3', '1', '4'])
	})
})
