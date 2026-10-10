import { describe, expect, it } from 'vitest'
import { outcomesLayout, outcomesTitle } from './layout'
import { everyOrder, everyRunOperation, manyRunsOperation, orderName, outcomeTree, simulate, tallyOf, tallySteps } from './outcomes'

const v = (...values: number[]) => values.map(String)

describe("a shuffle's outcomes (lecture 2)", () => {
	it('every run as a tree: a level per pick, 27 leaves for the unfair shuffle on 3 values, 6 for Fisher-Yates', () => {
		const unfair = outcomeTree(v(1, 2, 3), 'unfair')
		expect([unfair.depth, unfair.leaves.length]).toEqual([3, 27])
		expect([1, 2, 3].map((d) => unfair.nodes.filter((n) => n.depth === d).length)).toEqual([3, 9, 27])
		// i = 0 picks n = 1 first: a[0] and a[1] swap.
		expect(unfair.nodes[unfair.nodes[0].children[1]]).toMatchObject({ values: v(2, 1, 3), pick: 1 })
		const fair = outcomeTree(v(1, 2, 3), 'fisher-yates')
		expect([fair.depth, fair.leaves.length]).toEqual([2, 6])
		// i = 2 first, n from 0..2: three ways; then i = 1, n from 0..1: two each.
		expect(fair.nodes[0].children).toHaveLength(3)
		expect(fair.nodes[fair.nodes[0].children[0]].children).toHaveLength(2)
	})

	it('tallies every order, those no run left at 0', () => {
		expect(everyOrder(v(1, 2, 3)).map(orderName)).toEqual(['123', '132', '213', '231', '312', '321'])
		expect(tallyOf(v(1, 2), [v(2, 1), v(2, 1)])).toEqual([
			{ order: '12', count: 0 },
			{ order: '21', count: 2 },
		])
		expect(orderName(['10', '2'])).toBe('10 2')
	})

	it('many runs are seeded, and more runs go on from fewer', () => {
		const some = simulate(v(1, 2, 3), 'unfair', 7, 60)
		expect(simulate(v(1, 2, 3), 'unfair', 7, 600).slice(0, 60)).toEqual(some)
		expect(simulate(v(1, 2, 3), 'unfair', 8, 60)).not.toEqual(some)
		expect(tallySteps(3)).toEqual([6, 60, 600, 6000])
	})

	it('the unfair shuffle, run 6,000 times: 132, 213 and 231 well over a fair 1,000, the others well under', () => {
		const tally = tallyOf(v(1, 2, 3), simulate(v(1, 2, 3), 'unfair', 1, 6000))
		const counts = Object.fromEntries(tally.map((t) => [t.order, t.count]))
		for (const order of ['132', '213', '231']) expect(counts[order]).toBeGreaterThan(1040)
		for (const order of ['123', '312', '321']) expect(counts[order]).toBeLessThan(960)
	})

	it('every run plays a level at a time, then the tally says whether it is fair', () => {
		const op = everyRunOperation({ values: v(1, 2, 3), marks: {} }, 'unfair')
		expect(op.frames.map((f) => f.outcomes?.level)).toEqual([0, 1, 2, 3, 4])
		expect(op.frames.map((f) => f.caption)).toEqual([
			'Every run of the unfair shuffle on 123: before any pick',
			'i = 0: n can be any of 0..2, so each run so far branches 3 ways: 3 runs',
			'i = 1: n can be any of 0..2, so each run so far branches 3 ways: 9 runs',
			'i = 2: n can be any of 0..2, so each run so far branches 3 ways: 27 runs',
			'27 runs, 6 orders: 132, 213 and 231 come up 5 times, 123, 312 and 321 4. Not fair',
		])
		expect(op.result).toBeUndefined()
		const fair = everyRunOperation({ values: v(1, 2, 3), marks: {} }, 'fisher-yates')
		expect(fair.frames.at(-1)?.caption).toBe('6 runs, 6 orders: each order comes up once. Every order equally likely: fair')
	})

	it('many runs play ten times as many at each step', () => {
		const op = manyRunsOperation({ values: v(1, 2, 3), marks: {} }, 'fisher-yates', 3)
		expect(op.frames.map((f) => f.outcomes)).toEqual([6, 60, 600, 6000].map((runs) => ({ kind: 'fisher-yates', mode: 'tally', runs })))
		expect(op.frames.at(-1)?.caption).toMatch(/^6,000 runs: every order between [\d,]+ and [\d,]+ times, against 1,000 each if fair/)
	})

	it('lays the tree out over its leaves, the root over the middle, wide enough for its title', () => {
		const layout = outcomesLayout(v(1, 2, 3), 'unfair', 'tree', 'm')
		const { nodes, leaves } = layout.tree!
		const mid = (k: number) => nodes[k].box.x + nodes[k].box.w / 2
		expect(mid(0)).toBeCloseTo((mid(leaves[0]) + mid(leaves[leaves.length - 1])) / 2)
		expect(layout.bars.map((b) => b.order)).toEqual(['123', '132', '213', '231', '312', '321'])
		const tally = outcomesLayout(v(1, 2, 3), 'fisher-yates', 'tally', 'm')
		expect(tally.tree).toBeUndefined()
		expect(tally.box.w).toBeGreaterThanOrEqual(outcomesTitle('fisher-yates', 'tally', 6000).length * tally.fontSize * 0.6)
	})
})
