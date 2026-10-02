import { describe, expect, it } from 'vitest'
import { stateAt, type Frame } from './playback'

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
})
