import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../data/random'
import { everyRun, fisherYates, unfairShuffle } from './shuffles'

const array = (...values: (string | number)[]) => ({ values: values.map(String), marks: { '0': 'red' as const } })
const last = <T,>(xs: T[]) => xs[xs.length - 1]
/** Each order a shuffle's runs leave, and how many runs leave it. */
const tally = (runs: { result: string[] }[]) => {
	const counts: Record<string, number> = {}
	for (const { result } of runs) counts[result.join('')] = (counts[result.join('')] ?? 0) + 1
	return counts
}

describe('shuffles step by step (lecture 2)', () => {
	it('the unfair shuffle picks n from the whole array for every i: a pick, then a swap', () => {
		const op = unfairShuffle(array(1, 2, 3, 4, 5), mulberry32(7))
		const picks = op.frames.filter((f) => f.line === 'pick')
		expect(picks).toHaveLength(5)
		for (const f of picks) expect(Number(f.pointers!.find((p) => p.name === 'n')!.at)).toBeLessThanOrEqual(4)
		expect(op.frames.filter((f) => f.line === 'swap')).toHaveLength(5)
		expect(last(op.frames).counts?.['random picks']).toBe(5)
		expect(last(op.frames).caption).toContain("5^5 = 3,125 equally likely runs of picks make only 5! = 120 orders")
		expect(op.code).toBe('unfair-shuffle')
	})

	it('Fisher-Yates picks n from 0..i only, i from n - 1 down to 1: n - 1 picks', () => {
		const op = fisherYates(array(1, 2, 3, 4, 5), mulberry32(7))
		const picks = op.frames.filter((f) => f.line === 'pick')
		expect(picks.map((f) => f.pointers!.find((p) => p.name === 'i')!.at)).toEqual(['4', '3', '2', '1'])
		for (const f of picks) {
			const at = (name: string) => Number(f.pointers!.find((p) => p.name === name)!.at)
			expect(at('n')).toBeLessThanOrEqual(at('i'))
		}
		expect(last(op.frames).caption).toContain('5 · 4 · … · 2 = 5! = 120 runs of picks, one for each order')
	})

	it('the same seed shuffles the same way; the values are all still there, marks with them', () => {
		const a = fisherYates(array(1, 2, 3, 4, 5), mulberry32(42)).result!
		expect(fisherYates(array(1, 2, 3, 4, 5), mulberry32(42)).result).toEqual(a)
		expect([...a.values].sort()).toEqual(['1', '2', '3', '4', '5'])
		expect(a.marks).toEqual({ [a.values.indexOf('1')]: 'red' })
	})

	it('on [1, 2, 3]: 27 unfair runs for 6 orders, so some come up 5 times and others 4; Fisher-Yates 6 runs, one each', () => {
		const unfair = everyRun(['1', '2', '3'], 'unfair')
		expect(unfair).toHaveLength(27)
		expect(tally(unfair)).toEqual({ '123': 4, '132': 5, '213': 5, '231': 5, '312': 4, '321': 4 })
		const fair = everyRun(['1', '2', '3'], 'fisher-yates')
		expect(fair).toHaveLength(6)
		expect(tally(fair)).toEqual({ '123': 1, '132': 1, '213': 1, '231': 1, '312': 1, '321': 1 })
	})
})
