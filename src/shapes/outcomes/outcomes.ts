import { mulberry32, randomInt } from '../../data/random'
import { recorder, type ArrayOperation, type ArrayState } from '../array/operations'
import { pickTops, type ShuffleKind } from '../array/shuffles'

// Every run of a shuffle (lecture 2's "Draw: Unfair Permutations" / "FY Shuffle Permutations"): a
// tree whose levels are the loop's picks, a branch per value n can take, its leaves the orders the
// runs leave; then a tally of leaves per order. And the lecture's demo, "run a shuffle algorithm many
// times and show the distribution": seeded runs, tallied per order. Pure.

/** Which shuffle, and how its outcomes are shown: every run as a tree, or many runs tallied. */
export type OutcomesMode = 'tree' | 'tally'

/** The index the k-th pick swaps from (i): the unfair shuffle counts up from 0, Fisher-Yates down from len - 1. */
export const pickIndex = (kind: ShuffleKind, len: number, k: number) => (kind === 'unfair' ? k : len - 1 - k)

export interface OutcomeNode {
	/** The values after the picks so far (the root: as the array starts). */
	values: string[]
	depth: number
	/** The pick that led here (n), from the parent; undefined at the root. */
	pick?: number
	parent?: number
	children: number[]
}

/** Every run as a tree: the root, then a level per pick, a child per value n can take. */
export function outcomeTree(values: readonly string[], kind: ShuffleKind): { nodes: OutcomeNode[]; depth: number; leaves: number[] } {
	const tops = pickTops(kind, values.length)
	const nodes: OutcomeNode[] = [{ values: [...values], depth: 0, children: [] }]
	let level = [0]
	tops.forEach((top, k) => {
		const i = pickIndex(kind, values.length, k)
		const next: number[] = []
		for (const at of level) {
			for (let n = 0; n <= top; n++) {
				const after = [...nodes[at].values]
				;[after[i], after[n]] = [after[n], after[i]]
				nodes.push({ values: after, depth: k + 1, pick: n, parent: at, children: [] })
				nodes[at].children.push(nodes.length - 1)
				next.push(nodes.length - 1)
			}
		}
		level = next
	})
	return { nodes, depth: tops.length, leaves: level }
}

/** An order's name: its values run together if each is one character, else spaced. */
export const orderName = (values: readonly string[]) => (values.every((v) => v.length === 1) ? values.join('') : values.join(' '))

/** Every order of the values (by where each starting value ends up), in a fixed order: the first one is as they start. */
export function everyOrder(values: readonly string[]): string[][] {
	if (values.length <= 1) return [[...values]]
	return values.flatMap((v, k) => everyOrder([...values.slice(0, k), ...values.slice(k + 1)]).map((rest) => [v, ...rest]))
}

/** How many runs left each order (by `orderName`), every order listed (0 if none). */
export function tallyOf(values: readonly string[], results: readonly (readonly string[])[]): { order: string; count: number }[] {
	const counts = new Map(everyOrder(values).map((o) => [orderName(o), 0]))
	for (const r of results) counts.set(orderName(r), (counts.get(orderName(r)) ?? 0) + 1)
	return [...counts].map(([order, count]) => ({ order, count }))
}

/** One run of a shuffle (just the result), its picks from `rng`. */
function shuffleOnce(values: readonly string[], kind: ShuffleKind, rng: () => number): string[] {
	const a = [...values]
	pickTops(kind, a.length).forEach((top, k) => {
		const i = pickIndex(kind, a.length, k)
		const n = randomInt(0, top, rng)
		;[a[i], a[n]] = [a[n], a[i]]
	})
	return a
}

const simulated = new Map<string, string[][]>()

/** The first `runs` runs of a shuffle from `seed` (one generator throughout, so more runs extend fewer). */
export function simulate(values: readonly string[], kind: ShuffleKind, seed: number, runs: number): string[][] {
	const key = `${kind}:${seed}:${values.join('\u0000')}`
	let done = simulated.get(key)
	if (!done || done.length < runs) {
		const rng = mulberry32(seed)
		done = Array.from({ length: Math.max(runs, done?.length ?? 0) }, () => shuffleOnce(values, kind, rng))
		simulated.set(key, done)
	}
	return done.slice(0, runs)
}

/** n! for small n. */
export const factorial = (n: number) => Array.from({ length: n }, (_, k) => k + 1).reduce((p, k) => p * k, 1)

/** The tree is drawn for up to three values (27 leaves); the tally for up to four (24 orders). */
export const TREE_MAX = 3
export const TALLY_MAX = 4

/** Runs after each step of the "many times" demo: one, ten, a hundred, a thousand per order. */
export const tallySteps = (len: number) => [1, 10, 100, 1000].map((k) => k * factorial(len))

const shuffleName = (kind: ShuffleKind) => (kind === 'unfair' ? 'the unfair shuffle' : 'Fisher-Yates')
const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)
const count = (n: number) => n.toLocaleString('en')

/**
 * Every run of a shuffle as steps: the tree a level (a pick) at a time, then its leaves by order and
 * their tally, which says whether every order is as likely. The array itself doesn't change.
 */
export function everyRunOperation(start: ArrayState, kind: ShuffleKind): ArrayOperation {
	const { values } = start
	const len = values.length
	const tree = outcomeTree(values, kind)
	const r = recorder(start, {})
	const outcomes = (level: number) => ({ kind, mode: 'tree' as const, level })
	r.step(`Every run of ${shuffleName(kind)} on ${orderName(values)}: before any pick`, { ask: false })
	r.frames[r.frames.length - 1].outcomes = outcomes(0)
	let runs = 1
	pickTops(kind, len).forEach((top, k) => {
		const i = pickIndex(kind, len, k)
		runs *= top + 1
		r.step(`i = ${i}: n can be any of 0..${top}, so each run so far branches ${top + 1} ways: ${count(runs)} runs`, {
			ask: `i = ${i}: n can be any of 0..${top}. How many runs now?`,
		})
		r.frames[r.frames.length - 1].outcomes = outcomes(k + 1)
	})
	const tally = tallyOf(values, tree.leaves.map((leaf) => tree.nodes[leaf].values))
	const most = Math.max(...tally.map((t) => t.count))
	const least = Math.min(...tally.map((t) => t.count))
	r.step(
		most === least
			? `${count(runs)} runs, ${tally.length} orders: each order comes up ${most === 1 ? 'once' : `${most} times`}. Every order equally likely: fair`
			: `${count(runs)} runs, ${tally.length} orders: ${list(tally.filter((t) => t.count === most).map((t) => t.order))} come up ${most} times, ${list(tally.filter((t) => t.count === least).map((t) => t.order))} ${least}. Not fair`,
		{ ask: `${count(runs)} equally likely runs, ${tally.length} orders: does each order come up as often?` }
	)
	r.frames[r.frames.length - 1].outcomes = outcomes(tree.depth + 1)
	return { frames: r.frames }
}

/**
 * The lecture's demo: run a shuffle many times and show the distribution. Each step runs ten times
 * as many (one per order, then 10, 100, 1000 per order), the bars each order's share against a fair
 * one: Fisher-Yates' settle on it, the unfair shuffle's don't.
 */
export function manyRunsOperation(start: ArrayState, kind: ShuffleKind, seed: number): ArrayOperation {
	const { values } = start
	const r = recorder(start, {})
	const steps = tallySteps(values.length)
	const orders = new Set(everyOrder(values).map(orderName)).size
	const fair = (runs: number) => runs / orders
	steps.forEach((runs, k) => {
		const tally = tallyOf(values, simulate(values, kind, seed, runs))
		const last = k === steps.length - 1
		const top = tally.reduce((a, b) => (b.count > a.count ? b : a))
		const bottom = tally.reduce((a, b) => (b.count < a.count ? b : a))
		r.step(
			!last
				? `${shuffleName(kind)[0].toUpperCase()}${shuffleName(kind).slice(1)}, run ${count(runs)} times: a fair shuffle would give each order ${count(fair(runs))}`
				: kind === 'fisher-yates'
					? `${count(runs)} runs: every order between ${count(bottom.count)} and ${count(top.count)} times, against ${count(fair(runs))} each if fair: that is chance. Fair`
					: `${count(runs)} runs: ${top.order} came up ${count(top.count)} times and ${bottom.order} ${count(bottom.count)}, against ${count(fair(runs))} each if fair. The bars don't even out: some orders are likelier`,
			{ ask: k === 0 ? false : `${count(runs)} runs: do the bars even out?` }
		)
		r.frames[r.frames.length - 1].outcomes = { kind, mode: 'tally', runs }
	})
	return { frames: r.frames }
}
