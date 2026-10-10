import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import { appendAccounting, appendMany } from './operations'

// Lecture 7: ten appends to an array of capacity 1 that doubles when full.

const empty = { values: [''], marks: {} }
const ten = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

describe('amortised cost of appends (lecture 7)', () => {
	it("aggregate: the costs 1 2 3 1 5 1 1 1 9 1, 10 writes + 15 copies = 25, 2.5 each", () => {
		const op = appendMany(empty, 0, ten, 'double')
		const last = op.frames.at(-1)!
		expect(last.strips).toEqual([{ title: 'cost of each append', items: ['1', '2', '3', '1', '5', '1', '1', '1', '9', '1'] }])
		expect(last.caption).toBe('10 appends cost 10 writes + 15 copies = 25, 2.5 each: the copies (1 + 2 + 4 + …) add up to less than 2n, so n appends cost under 3n: amortised O(1)')
		expect(op.result?.values).toHaveLength(16)
	})

	it('growing by one instead: every append copies everything, 10 + 45 = 55', () => {
		expect(appendMany(empty, 0, ten, 'plus-one').frames.at(-1)!.caption).toMatch(/^10 appends cost 10 writes \+ 45 copies = 55, 5\.5 each/)
	})

	it('accounting: 3 kr an append, 2 saved on its cell; the savings pay each doubling, never in debt', () => {
		const op = appendAccounting(empty, 0, ten)
		const banks = op.frames.map((f) => f.counts?.['bank (kr)'] ?? 0)
		expect(Math.min(...banks)).toBeGreaterThanOrEqual(0)
		const last = op.frames.at(-1)!
		expect(last.caption).toBe('10 appends paid 30 kr for 10 writes and 15 copies, with 5 kr left: never in debt, so each append costs at most 3, amortised O(1)')
		// Just before doubling 8 to 16: the four values added since 4 → 8 hold 2 kr each, the 8 kr the 8 copies cost.
		const doubling = op.frames.findIndex((f) => f.caption?.startsWith('Append 9: full, so double to 16'))
		const badges = stateAt(op.frames, doubling).badges
		expect(Object.entries(badges).filter(([, v]) => v).map(([k]) => k)).toEqual(['4', '5', '6', '7'])
	})

	it('values already there count as appended this way: their savings are on their cells', () => {
		const op = appendAccounting({ values: ['1', '2', '3', ''], marks: {} }, 3, ['4'])
		expect(op.frames[0].badges).toEqual({ '2': '2 kr' })
		expect(op.frames[0].counts?.['bank (kr)']).toBe(2)
	})
})
