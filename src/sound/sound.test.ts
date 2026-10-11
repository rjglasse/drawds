import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../data/random'
import { bogosort } from '../shapes/array/bogo'
import { SCALES, bassNotes, degreesOf, frequencyOf, pitches, scaleRun, sweep, touchedKeys } from './notes'

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
		expect(notes[3]).toBeCloseTo(frequencyOf(degreesOf({ scale: 'major-pentatonic', key: 0 }) - 1))
		expect(pitches(['K', 'C', 'X'])('C')).toBeLessThan(pitches(['K', 'C', 'X'])('K'))
		// A value it hasn't seen goes between its neighbours.
		expect(pitch('30')).toBeGreaterThan(pitch('19'))
		expect(pitch('30')).toBeLessThan(pitch('40'))
	})

	it('other scales and keys: their steps, two and a half octaves of them, keys kept near middle C', () => {
		const blues = { scale: 'blues', key: 0 }
		// C, E♭, F, G♭, G, B♭, then C an octave up.
		expect([0, 1, 2, 3, 4, 5, 6].map((d) => Math.round(12 * Math.log2(frequencyOf(d, blues) / frequencyOf(0, blues))))).toEqual([0, 3, 5, 6, 7, 10, 12])
		expect(degreesOf(blues)).toBe(16)
		expect(degreesOf({ scale: 'dorian', key: 0 })).toBe(19)
		// D is two semitones up; B is one down, not eleven up.
		expect(frequencyOf(0, { scale: 'dorian', key: 2 }) / frequencyOf(0)).toBeCloseTo(2 ** (2 / 12))
		expect(frequencyOf(0, { scale: 'dorian', key: 11 }) / frequencyOf(0)).toBeCloseTo(2 ** (-1 / 12))
		// Every scale's notes rise, and each is written out for the menu.
		for (const scale of SCALES) {
			const run = scaleRun({ scale: scale.id, key: 0 })
			expect(run.length).toBe(scale.steps.length * 2 + 1)
			expect(scale.intervals.split(' ')).toHaveLength(scale.steps.length)
		}
	})

	it('the bass: the root two octaves down, then its fifth (the whole tone scale’s ♯5)', () => {
		const [root, fifth] = bassNotes({ scale: 'major-pentatonic', key: 0 })
		expect(root).toBeCloseTo(261.63 / 4)
		expect(fifth / root).toBeCloseTo(2 ** (7 / 12))
		const [r, f] = bassNotes({ scale: 'whole-tone', key: 0 })
		expect(f / r).toBeCloseTo(2 ** (8 / 12))
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
