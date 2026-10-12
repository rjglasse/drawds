import { describe, expect, it } from 'vitest'
import { parseOtherKey } from '../../nodelink/playback'
import { crossSlides } from './swap'
import { canMergeValues, mergeArrays } from './merge'

const B = 'shape:b'
const room = { drop: 0, gap: 20 }
const merge = (a: string[], b: string[]) => mergeArrays({ values: a, marks: {} }, b, B, room)

describe('merging two sorted arrays', () => {
	it('copies the smaller of a[i] and b[j] into c[k], then the rest, counting comparisons and copies', () => {
		const op = merge(['1', '4', '7'], ['2', '3', '9'])
		expect(op.merged).toEqual(['1', '2', '3', '4', '7', '9'])
		const last = op.frames.at(-1)!
		// 1-2, 4-2, 4-3, 4-9, 7-9: then b's 9 is the rest.
		expect(last.counts).toEqual({ comparisons: 5, copies: 6 })
		expect(last.caption).toMatch(/^return c: 6 values copied into new space after 5 comparisons, a and b as they were/)
		expect(op.frames.map((f) => f.line)).toEqual(['alloc', 'start', 'left', 'right', 'right', 'left', 'left', 'rest-right', 'return'])
		// a stays as it was; c is the second row, filled a cell a step.
		expect(last.props).toMatchObject({ values: ['1', '4', '7'], aux: { values: ['1', '2', '3', '4', '7', '9'], ...room } })
		expect((op.frames[3].props as { aux: { values: string[] } }).aux.values).toEqual(['1', '2', '', '', '', ''])
	})

	it("points j at b's cells where b is, lights them there, and slides b's values into c", () => {
		const op = merge(['5'], ['2', '8'])
		const took = op.frames[2]
		expect(took.caption).toBe('b[0] = 2 < a[0] = 5: c[0] = b[0] = 2')
		expect(took.others).toEqual({ [B]: { 0: 'orange' } })
		expect(took.pointers?.map((p) => [p.name, p.at])).toEqual([
			['i', '0'],
			['j', `${B}#1`],
			['k', 'aux:1'],
		])
		expect(parseOtherKey(took.pointers![1].at)).toEqual({ id: B, cell: '1' })
		expect(crossSlides(took.moves).fromOther).toEqual({ 0: `${B}#0` })
		expect(op.frames[3].caption).toBe('a[0] = 5 ≤ b[1] = 8: c[1] = a[0] = 5')
		expect(op.frames[4].caption).toBe('a is used up (i = 1): c[2] = b[1] = 8')
	})

	it('keeps equal values in order, a first (a stable merge)', () => {
		const op = merge(['3'], ['3'])
		expect(op.frames[2].caption).toBe('a[0] = 3 ≤ b[0] = 3: c[0] = a[0] = 3')
	})

	it('merges with an empty array, and only sorted arrays', () => {
		expect(merge([], ['1', '2']).merged).toEqual(['1', '2'])
		expect(canMergeValues(['1', '3'], ['2'])).toBe(true)
		expect(canMergeValues(['3', '1'], ['2'])).toBe(false)
		expect(canMergeValues([], [])).toBe(false)
	})
})
