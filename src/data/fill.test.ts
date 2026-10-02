import { describe, expect, it } from 'vitest'
import { extendValues, fillValues, insertValue } from './fill'
import { mulberry32, randomInt } from './random'

const SEED = 1234
const nums = (values: string[]) => values.map(Number)

describe('mulberry32', () => {
	it('is deterministic per seed and differs across seeds', () => {
		const a = mulberry32(7)
		const b = mulberry32(7)
		const c = mulberry32(8)
		const seqA = [a(), a(), a()]
		expect([b(), b(), b()]).toEqual(seqA)
		expect([c(), c(), c()]).not.toEqual(seqA)
		expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true)
	})
})

describe('randomInt', () => {
	it('covers the inclusive range', () => {
		expect(randomInt(0, 99, () => 0)).toBe(0)
		expect(randomInt(0, 99, () => 0.999999)).toBe(99)
	})
})

describe('fillValues', () => {
	it('is deterministic per seed', () => {
		expect(fillValues('random', SEED, 8)).toEqual(fillValues('random', SEED, 8))
		expect(fillValues('random', SEED, 8)).not.toEqual(fillValues('random', SEED + 1, 8))
	})

	it('keeps already-drawn random values as the sketch grows', () => {
		const five = fillValues('random', SEED, 5)
		expect(fillValues('random', SEED, 9).slice(0, 5)).toEqual(five)
		expect(fillValues('random', SEED, 9, { reversed: true }).slice(-5)).toEqual([...five].reverse())
	})

	it('produces ints in 0..99 and letters A..Z', () => {
		expect(nums(fillValues('random', SEED, 50)).every((n) => Number.isInteger(n) && n >= 0 && n <= 99)).toBe(true)
		expect(fillValues('letters', SEED, 50).every((v) => /^[A-Z]$/.test(v))).toBe(true)
	})

	it('sorts ascending and descending', () => {
		const asc = nums(fillValues('ascending', SEED, 12))
		expect(asc).toEqual([...asc].sort((a, b) => a - b))
		expect(nums(fillValues('descending', SEED, 12))).toEqual([...asc].reverse())
	})

	it('nearly sorted is a light shuffle of the ascending values', () => {
		const asc = nums(fillValues('ascending', SEED, 20))
		const nearly = nums(fillValues('nearly-sorted', SEED, 20))
		expect([...nearly].sort((a, b) => a - b)).toEqual(asc)
		let inversions = 0
		for (let i = 0; i < nearly.length; i++)
			for (let j = i + 1; j < nearly.length; j++) if (nearly[i] > nearly[j]) inversions++
		expect(inversions).toBeLessThanOrEqual(4)
	})

	it('leaves cells empty', () => {
		expect(fillValues('empty', SEED, 3)).toEqual(['', '', ''])
	})
})

describe('extendValues', () => {
	it('keeps existing values, including typed ones', () => {
		expect(extendValues(['hd', '7'], 'random', SEED, 4).slice(0, 2)).toEqual(['hd', '7'])
		expect(extendValues(['1', '2', '3'], 'random', SEED, 2)).toEqual(['1', '2'])
	})

	it('continues the random stream, so growing matches a longer sketch', () => {
		const three = fillValues('random', SEED, 3)
		expect(extendValues(three, 'random', SEED, 7)).toEqual(fillValues('random', SEED, 7))
		expect(extendValues(fillValues('letters', SEED, 2), 'letters', SEED, 5)).toEqual(fillValues('letters', SEED, 5))
	})

	it('continues sorted runs from the last value', () => {
		const up = nums(extendValues(['10', '20'], 'ascending', SEED, 6))
		expect(up.slice(0, 2)).toEqual([10, 20])
		for (let i = 1; i < up.length; i++) expect(up[i]).toBeGreaterThan(up[i - 1])
		const down = nums(extendValues(['5'], 'descending', SEED, 4))
		for (let i = 1; i < down.length; i++) expect(down[i]).toBeLessThan(down[i - 1])
	})

	it('starts from 0 after a non-numeric value, and adds empty cells in empty mode', () => {
		expect(Number(extendValues(['x'], 'ascending', SEED, 2)[1])).toBeGreaterThan(0)
		expect(extendValues(['1'], 'empty', SEED, 3)).toEqual(['1', '', ''])
	})

	it('is deterministic', () => {
		expect(extendValues(['1'], 'ascending', SEED, 5)).toEqual(extendValues(['1'], 'ascending', SEED, 5))
	})

	it('grows and shrinks at the start', () => {
		const grown = extendValues(['a', 'b'], 'random', SEED, 5, { atStart: true })
		expect(grown).toHaveLength(5)
		expect(grown.slice(3)).toEqual(['a', 'b'])
		expect(extendValues(['a', 'b', 'c'], 'random', SEED, 1, { atStart: true })).toEqual(['c'])
	})

	it('keeps values stable as the start grows further, like the end does', () => {
		const four = extendValues(['x'], 'random', SEED, 4, { atStart: true })
		expect(extendValues(['x'], 'random', SEED, 6, { atStart: true }).slice(2)).toEqual(four)
	})

	it('keeps sorted runs sorted when growing at the start', () => {
		const up = nums(extendValues(['50', '60'], 'ascending', SEED, 6, { atStart: true }))
		for (let i = 1; i < up.length; i++) expect(up[i]).toBeGreaterThan(up[i - 1])
		const down = nums(extendValues(['50'], 'descending', SEED, 4, { atStart: true }))
		for (let i = 1; i < down.length; i++) expect(down[i]).toBeLessThan(down[i - 1])
	})
})

describe('insertValue', () => {
	it('keeps sorted runs sorted', () => {
		for (let salt = 0; salt < 20; salt++) {
			const v = Number(insertValue('10', '20', 'ascending', SEED, salt))
			expect(v).toBeGreaterThanOrEqual(10)
			expect(v).toBeLessThanOrEqual(20)
			const d = Number(insertValue('30', '20', 'descending', SEED, salt))
			expect(d).toBeGreaterThanOrEqual(20)
			expect(d).toBeLessThanOrEqual(30)
		}
	})

	it('continues the run at an end', () => {
		expect(Number(insertValue('10', undefined, 'ascending', SEED, 1))).toBeGreaterThan(10)
		expect(Number(insertValue(undefined, '10', 'ascending', SEED, 1))).toBeLessThan(10)
		expect(Number(insertValue('10', undefined, 'descending', SEED, 1))).toBeLessThan(10)
	})

	it('follows the other modes and is deterministic per salt', () => {
		expect(insertValue('1', '2', 'empty', SEED, 0)).toBe('')
		expect(insertValue('1', '2', 'letters', SEED, 0)).toMatch(/^[A-Z]$/)
		expect(Number(insertValue('1', '2', 'random', SEED, 3))).toBeLessThanOrEqual(99)
		expect(insertValue('1', '2', 'random', SEED, 3)).toBe(insertValue('1', '2', 'random', SEED, 3))
	})
})
