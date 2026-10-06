import { describe, expect, it } from 'vitest'
import { fillValues } from '../../data/fill'
import { buildByInsertion, buildHeapSteps, heapInsert, heapRemoveAt, heapViolations, heapify, siftDown } from './heap'

const valid = (values: string[], type: 'min' | 'max' = 'min') => heapViolations(values, type).size === 0

describe('heap', () => {
	it('builds valid min and max heaps by insertion and by heapify', () => {
		for (let seed = 0; seed < 20; seed++) {
			const stream = fillValues('random', seed, 15)
			expect(valid(buildByInsertion(stream, 'min'))).toBe(true)
			expect(valid(buildByInsertion(stream, 'max'), 'max')).toBe(true)
			expect(valid(heapify(stream, 'min').values)).toBe(true)
		}
	})

	it('inserts with sift-up, reporting each swap and the final position', () => {
		const s = heapInsert(['1', '5', '3', '7', '9'], '2', 'min')
		expect(s.values).toEqual(['1', '5', '2', '7', '9', '3'])
		expect(s.swaps).toEqual([[5, 2]])
		expect(s.path).toEqual([5, 2])
		expect(s.at).toBe(2)
	})

	it('extracts the root: last takes its place and sifts down', () => {
		const s = heapRemoveAt(['1', '5', '3', '7', '9', '4'], 0, 'min')
		expect(s.removed).toBe('1')
		expect(s.values).toEqual(['3', '5', '4', '7', '9'])
		// The last value (4) moves to the root and swaps once with its smaller child (3, at index 2).
		expect(s.swaps).toEqual([[0, 2]])
		expect(s.path).toEqual([0, 2])
		expect(valid(s.values)).toBe(true)
	})

	it('removes the last value without any swaps', () => {
		expect(heapRemoveAt(['1', '5', '3'], 2, 'min')).toMatchObject({ values: ['1', '5'], swaps: [], removed: '3' })
	})

	it('removing from the middle may sift up instead of down', () => {
		const s = heapRemoveAt(['1', '10', '2', '11', '12', '3', '4'], 4, 'min')
		expect(valid(s.values)).toBe(true)
		expect(s.removed).toBe('12')
	})

	it('flags children that break the heap property', () => {
		expect([...heapViolations(['5', '3', '8'], 'min')]).toEqual([1])
		expect(siftDown(['9', '1', '2'], 0, 'min').values).toEqual(['1', '9', '2'])
	})
})

describe('buildHeapSteps', () => {
	it('ends with the same heap as heapify, the green growing from the leaves to the root', () => {
		const start = ['9', '4', '7', '1', '8', '2', '3']
		const { frames, values, swaps } = buildHeapSteps(start, 'min')
		expect(values).toEqual(heapify(start, 'min').values)
		expect(swaps).toEqual(heapify(start, 'min').swaps)
		expect(frames[0].caption).toBe('The leaves (index 3 on) are heaps on their own. Sift down each parent, from the last (index 2) back to the root')
		expect(Object.keys(frames[0].flash ?? {})).toEqual(['3', '4', '5', '6'])
		expect(frames.at(-1)?.caption).toBe(`Every parent ≤ its children: a min heap, after ${swaps.length} swaps`)
		expect(frames.at(-1)?.counts).toEqual({ swaps: swaps.length })
		expect(heapViolations(values, 'min').size).toBe(0)
	})

	it('narrates each sift, swapping with the smaller child', () => {
		const { frames } = buildHeapSteps(['5', '1', '2'], 'min')
		expect(frames.map((f) => f.caption)).toEqual([
			'The leaves (index 1 on) are heaps on their own. Sift down each parent, from the last (index 0) back to the root',
			'i = 0: sift 5 down until it ≤ its children',
			'1 < 5: 1 is the smaller child, so swap them',
			'5 has no children: the subtree at index 0 is a heap',
			'Every parent ≤ its children: a min heap, after 1 swap',
		])
		expect(frames[2].swaps).toEqual([['0', '1']])
	})

	it('a single value is a heap already', () => {
		expect(buildHeapSteps(['4'], 'max').frames[0].caption).toBe('A single value is a heap already')
	})
})

describe("build heap's predict questions", () => {
	it('asks "swap with one, or stop?" at every step of a sift, the value and its children in focus', () => {
		const { frames } = buildHeapSteps(['1', '9', '8', '2', '7'], 'max')
		const sifting = frames.filter((f) => / is the larger child, so swap them$|: the subtree at index \d is a heap$/.test(f.caption ?? ''))
		expect(sifting.length).toBeGreaterThan(2)
		for (const f of sifting) expect(f.ask === false || /swap with one, or stop\?$/.test(String(f.ask))).toBe(true)
		expect(frames[0].ask).toBe('Build a heap bottom-up (Floyd): where does it start?')
		expect(frames.at(-1)!.ask).toBe(false)
	})
})
