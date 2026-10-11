import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../data/random'
import { bogosort, bozosort } from '../shapes/array/bogo'
import { SCALES, bassNotes, degreesOf, frequencyOf, pitches, sweep, touchedKeys } from './notes'

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
		// Each written out for the menu; all but the row rise.
		for (const scale of SCALES) {
			expect(scale.intervals.split(' ')).toHaveLength(scale.steps.length)
			if (scale.id !== 'twelve-tone') expect(scale.steps).toEqual([...scale.steps].sort((a, b) => a - b))
		}
	})

	it('the final boss: Schoenberg’s row, every note once, values climbing it leaping about; a tritone bass', () => {
		const row = SCALES.find((s) => s.id === 'twelve-tone')!
		expect([...row.steps].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
		const tuning = { scale: 'twelve-tone', key: 0 }
		const notes = Array.from({ length: 12 }, (_, d) => frequencyOf(d, tuning))
		expect(notes).not.toEqual([...notes].sort((a, b) => a - b))
		// The next row an octave up.
		expect(frequencyOf(12, tuning) / frequencyOf(0, tuning)).toBeCloseTo(2)
		const [e, bFlat] = bassNotes(tuning)
		expect(bFlat / e).toBeCloseTo(2 ** (6 / 12))
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
		expect(bozosort(state(['3', '2', '1']), mulberry32(1), 0).frames.at(-1)?.caption).toBe(
			'Still not sorted after 0 swaps. Bozosort needs on the order of n! = 6 on 3 values: drawds gives up'
		)
		// A shuffle moves every value that changes place, at once.
		const shuffle = op.frames.find((f) => f.line === 'shuffle')!
		expect(shuffle.moves?.length).toBeGreaterThan(0)
	})
})

describe('bozosort', () => {
	const state = (values: string[]) => ({ values, marks: {} })
	it('swaps two at random (maybe one with itself) until sorted, checking after each swap', () => {
		const op = bozosort(state(['3', '1', '2']), mulberry32(5))
		expect(op.result!.values).toEqual(['1', '2', '3'])
		expect(op.frames.at(-1)?.caption).toMatch(/^Sorted, after \d+ swaps?: luck$/)
		const swaps = op.frames.filter((f) => f.line === 'swap')
		expect(swaps.length).toBeGreaterThan(0)
		for (const f of swaps) expect(f.swaps?.length ?? 0).toBeLessThanOrEqual(1)
		expect(op.code).toBe('bozosort')
	})
})
