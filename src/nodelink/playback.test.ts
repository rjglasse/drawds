import { describe, expect, it } from 'vitest'
import { shownFrame, stateAt, stepFrom, type Frame, type Position } from './playback'

describe('stateAt', () => {
	const frames: Frame[] = [
		{ flash: { a: 'red' }, badges: { a: '1' }, strips: [{ title: 'queue', items: ['a'] }] },
		{ flash: { b: 'orange', 'edge:e0': 'green' }, badges: { b: '2' } },
		{ flash: { a: 'blue', b: null }, strips: [{ title: 'queue', items: [] }] },
	]

	it('accumulates highlights and badges up to the step; later colours win, null clears', () => {
		expect(stateAt(frames, 0)).toEqual({ flash: { a: 'red' }, badges: { a: '1' }, strips: [{ title: 'queue', items: ['a'] }] })
		expect(stateAt(frames, 1).flash).toEqual({ a: 'red', b: 'orange', 'edge:e0': 'green' })
		expect(stateAt(frames, 2).flash).toEqual({ a: 'blue', 'edge:e0': 'green' })
		expect(stateAt(frames, 2).badges).toEqual({ a: '1', b: '2' })
	})

	it('keeps the latest strips until a step replaces them', () => {
		expect(stateAt(frames, 1).strips).toEqual([{ title: 'queue', items: ['a'] }])
		expect(stateAt(frames, 2).strips).toEqual([{ title: 'queue', items: [] }])
		expect(stateAt([{ caption: 'no strip' }], 0).strips).toBeUndefined()
	})

	it('keeps the latest dimmed elements and counts until a step replaces them', () => {
		const steps: Frame[] = [
			{ counts: { comparisons: 1 } },
			{ dim: ['0', '1'], caption: 'no counts' },
			{ dim: [], counts: { comparisons: 2, swaps: 1 } },
		]
		expect(stateAt(steps, 0)).toMatchObject({ dim: undefined, counts: { comparisons: 1 } })
		expect(stateAt(steps, 1)).toMatchObject({ dim: ['0', '1'], counts: { comparisons: 1 } })
		expect(stateAt(steps, 2)).toMatchObject({ dim: [], counts: { comparisons: 2, swaps: 1 } })
	})
})

describe('stepFrom', () => {
	const walk = (from: Position, dir: 1 | -1, presses: number, asks: boolean) => {
		const seen: (Position | undefined)[] = []
		let at: Position | undefined = from
		for (let i = 0; i < presses && at; i++) seen.push((at = stepFrom(at, dir, { steps: 3, asks })))
		return seen
	}

	it('steps one press a step when not asking, and stops at either end', () => {
		expect(walk({ step: 0, asking: false }, 1, 3, false)).toEqual([{ step: 1, asking: false }, { step: 2, asking: false }, undefined])
		expect(walk({ step: 2, asking: false }, -1, 3, false)).toEqual([{ step: 1, asking: false }, { step: 0, asking: false }, undefined])
	})

	it('in predict mode takes two presses a step: the question, then the reveal', () => {
		expect(walk({ step: 0, asking: true }, 1, 6, true)).toEqual([
			{ step: 0, asking: false },
			{ step: 1, asking: true },
			{ step: 1, asking: false },
			{ step: 2, asking: true },
			{ step: 2, asking: false },
			// Past the last step: the result.
			undefined,
		])
	})

	it('steps back one press at a time, asking each question again', () => {
		expect(walk({ step: 2, asking: false }, -1, 6, true)).toEqual([
			{ step: 2, asking: true },
			{ step: 1, asking: false },
			{ step: 1, asking: true },
			{ step: 0, asking: false },
			{ step: 0, asking: true },
			undefined,
		])
	})

	it('answers a question being asked even when no longer asking (played on, or predict switched off)', () => {
		expect(stepFrom({ step: 1, asking: true }, 1, { steps: 3, asks: false })).toEqual({ step: 1, asking: false })
		expect(stepFrom({ step: 1, asking: true }, -1, { steps: 3, asks: false })).toEqual({ step: 0, asking: false })
	})

	it('takes one press for a step with nothing to guess, either way', () => {
		const asks = (step: number) => step !== 1
		const forward: (Position | undefined)[] = []
		let at: Position | undefined = { step: 0, asking: true }
		while (at) forward.push((at = stepFrom(at, 1, { steps: 3, asks })))
		expect(forward).toEqual([{ step: 0, asking: false }, { step: 1, asking: false }, { step: 2, asking: true }, { step: 2, asking: false }, undefined])
		const back: (Position | undefined)[] = []
		at = { step: 2, asking: false }
		while (at) back.push((at = stepFrom(at, -1, { steps: 3, asks })))
		expect(back).toEqual([{ step: 2, asking: true }, { step: 1, asking: false }, { step: 0, asking: false }, { step: 0, asking: true }, undefined])
	})

	it('shows the step before while asking about one (-1: nothing yet)', () => {
		expect(shownFrame({ step: 2, asking: false })).toBe(2)
		expect(shownFrame({ step: 2, asking: true })).toBe(1)
		expect(shownFrame({ step: 0, asking: true })).toBe(-1)
	})
})
