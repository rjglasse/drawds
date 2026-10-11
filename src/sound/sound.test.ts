import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../data/random'
import { bogosort } from '../shapes/array/bogo'
import { DEGREES, frequencyOf, pitches, sweep, touchedKeys } from './notes'

describe('notes', () => {
	it('a major pentatonic scale from C4: C D E G A, then C5', () => {
		expect(frequencyOf(0)).toBeCloseTo(261.63, 1)
		expect(frequencyOf(3) / frequencyOf(0)).toBeCloseTo(2 ** (7 / 12))
		expect(frequencyOf(5)).toBeCloseTo(2 * frequencyOf(0))
		expect(frequencyOf(-5)).toBeCloseTo(frequencyOf(0) / 2)
	})

	it('values by rank, low to high over the whole scale; letters alphabetically; equal values one note', () => {
		const pitch = pitches(['40', '7', '19', '7', '100'])
		const notes = ['7', '19', '40', '100'].map(pitch)
		expect(notes).toEqual([...notes].sort((a, b) => a - b))
		expect(notes[0]).toBeCloseTo(frequencyOf(0))
		expect(notes[3]).toBeCloseTo(frequencyOf(DEGREES - 1))
		expect(pitches(['K', 'C', 'X'])('C')).toBeLessThan(pitches(['K', 'C', 'X'])('K'))
		// A value it hasn't seen goes between its neighbours.
		expect(pitch('30')).toBeGreaterThan(pitch('19'))
		expect(pitch('30')).toBeLessThan(pitch('40'))
	})

	it('a step’s notes: what it lights, swaps, moves to; edges and labels make none', () => {
		expect(touchedKeys({ flash: { 2: 'orange', 3: null, 'edge:e1': 'green' }, swaps: [['0', '1']], moves: [['4', '2']] })).toEqual(['2', '0', '1'])
		expect(sweep(['3', '1', '2'])).toEqual(['1', '2', '3'].map(pitches(['3', '1', '2'])))
	})
})

describe('bogosort', () => {
	const state = (values: string[]) => ({ values, marks: {} })
	it('shuffles until sorted, checking pairs left to right, stopping at the first out of order', () => {
		const op = bogosort(state(['2', '1']), mulberry32(3))
		expect(op.result!.values).toEqual(['1', '2'])
		expect(op.frames.at(-1)?.caption).toMatch(/^Sorted, after \d+ shuffles?: luck$/)
		expect(op.frames.filter((f) => f.line === 'shuffle').length).toBeGreaterThan(0)
	})

	it('gives up after its batch of shuffles, saying how many bogosort expects', () => {
		const op = bogosort(state(['8', '7', '6', '5', '4', '3', '2', '1']), mulberry32(1), 20)
		expect(op.frames.filter((f) => f.line === 'shuffle')).toHaveLength(20)
		expect(op.frames.at(-1)?.caption).toBe('Still not sorted after 20 shuffles. Bogosort expects n! = 40,320 on 8 values: drawds gives up')
		// A shuffle moves every value that changes place, at once.
		const shuffle = op.frames.find((f) => f.line === 'shuffle')!
		expect(shuffle.moves?.length).toBeGreaterThan(0)
	})
})
