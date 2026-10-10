import { describe, expect, it } from 'vitest'
import { newSeed } from './random'
import { parseSeed, pinSeed, pinnedSeed, seedForSketch } from './seed'

describe('seeds', () => {
	it('new seeds are short enough to note down', () => {
		for (let i = 0; i < 200; i++) {
			const seed = newSeed()
			expect(Number.isInteger(seed) && seed >= 1 && seed <= 9999).toBe(true)
		}
	})

	it('reads a typed seed: digits (spaces ignored), up to 32 bits', () => {
		expect(parseSeed('42')).toBe(42)
		expect(parseSeed(' 4 2 ')).toBe(42)
		expect(parseSeed('0')).toBe(0)
		expect(parseSeed('4294967295')).toBe(4294967295)
		expect(parseSeed('4294967296')).toBeUndefined()
		expect(parseSeed('')).toBeUndefined()
		expect(parseSeed('-3')).toBeUndefined()
		expect(parseSeed('4.2')).toBeUndefined()
	})

	it('a pinned seed goes to every new sketch until unpinned', () => {
		pinSeed(42)
		expect([pinnedSeed(), seedForSketch(), seedForSketch()]).toEqual([42, 42, 42])
		pinSeed(null)
		expect(pinnedSeed()).toBeNull()
		expect(seedForSketch()).toBeGreaterThanOrEqual(1)
	})
})
