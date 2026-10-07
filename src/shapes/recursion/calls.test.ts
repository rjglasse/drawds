import { describe, expect, it } from 'vitest'
import type { Frame } from '../../nodelink/playback'
import {
	callDepth,
	callHighlights,
	callRun,
	callStates,
	callTreeLayout,
	callsSignature,
	callsTitle,
	hasCalls,
	resultText,
	type Call,
} from './calls'

// fib(2): fib(1) and fib(0) are base cases, made and returned in one step each.
const frames: Frame[] = [
	{ caption: 'fib(2)', calls: [{ call: 'fib(2)' }] },
	{ caption: 'fib(1)', calls: [{ call: 'fib(1)' }, { returns: '1' }] },
	{ caption: 'fib(0)', calls: [{ call: 'fib(0)' }, { returns: '0' }] },
	{ caption: 'add', calls: [{ returns: '1' }] },
	{ caption: 'done' },
]

describe('call run', () => {
	it('replays the calls on a stack: each call is made by the one running, returns pop it', () => {
		const run = callRun(frames)
		expect(run.calls).toEqual([
			{ label: 'fib(2)', parent: -1, result: '1' },
			{ label: 'fib(1)', parent: 0, result: '1' },
			{ label: 'fib(0)', parent: 0, result: '0' },
		])
		expect(run.opened).toEqual([0, 1, 2])
		expect(run.returned).toEqual([3, 1, 2])
		expect(hasCalls(frames)).toBe(true)
		expect(hasCalls([{ caption: 'no calls' }])).toBe(false)
	})

	it('a call that never returns has no result', () => {
		const run = callRun([{ calls: [{ call: 'hello()' }] }, { calls: [{ call: 'hello()' }] }])
		expect(run.calls).toEqual([
			{ label: 'hello()', parent: -1 },
			{ label: 'hello()', parent: 0 },
		])
		expect(run.returned).toEqual([undefined, undefined])
		expect(resultText(run.calls[0].result)).toBe('= ?')
		expect(resultText('')).toBe('done')
		expect(resultText('12')).toBe('= 12')
	})

	it('the same calls and results sign the same; a different result signs differently', () => {
		const calls = callRun(frames).calls
		expect(callsSignature(calls)).toBe(callsSignature(calls.map((c) => ({ ...c }))))
		expect(callsSignature(calls)).not.toBe(callsSignature([{ ...calls[0], result: '2' }, ...calls.slice(1)]))
	})
})

describe('call states', () => {
	const run = callRun(frames)

	it('the newest open call runs, the ones under it wait; calls not made yet are left out', () => {
		expect([...callStates(run, 0)]).toEqual([[0, 'running']])
	})

	it('a call returning at this step is the one running; the call that made it waits', () => {
		expect(Object.fromEntries(callStates(run, 1))).toEqual({ 0: 'waiting', 1: 'running' })
		expect(Object.fromEntries(callStates(run, 2))).toEqual({ 0: 'waiting', 1: 'returned', 2: 'running' })
		expect(Object.fromEntries(callStates(run, 3))).toEqual({ 0: 'running', 1: 'returned', 2: 'returned' })
		expect(Object.fromEntries(callStates(run, 4))).toEqual({ 0: 'returned', 1: 'returned', 2: 'returned' })
	})

	it('lights running red, waiting orange with the edge up to its caller, returned blue', () => {
		expect(callHighlights(run, callStates(run, 2))).toEqual({ c0: 'orange', c1: 'blue', c2: 'red', 'edge:e2': 'orange' })
	})
})

describe('recursion tree layout', () => {
	const calls: Call[] = [
		{ label: 'sum(0, 3)', parent: -1, result: '10' },
		{ label: 'sum(0, 1)', parent: 0, result: '3' },
		{ label: 'sum(0, 0)', parent: 1, result: '1' },
		{ label: 'sum(1, 1)', parent: 1, result: '2' },
		{ label: 'sum(2, 3)', parent: 0, result: '7' },
		{ label: 'sum(2, 2)', parent: 4, result: '3' },
		{ label: 'sum(3, 3)', parent: 4, result: '4' },
	]

	it('heads the tree with its calls and depth', () => {
		expect(callDepth(calls)).toBe(3)
		expect(callsTitle('sum by halves', calls)).toBe('sum by halves: 7 calls, 3 deep')
		expect(callsTitle('f', calls.slice(0, 1))).toBe('f: 1 call, 1 deep')
	})

	it('centres each call over the calls it made, a level per depth, leaves apart, all inside the box', () => {
		const { boxes, box, scene } = callTreeLayout(calls, 'm', 'sum by halves')
		expect(boxes[0].x).toBeCloseTo((boxes[1].x + boxes[4].x) / 2)
		expect(boxes[1].x).toBeCloseTo((boxes[2].x + boxes[3].x) / 2)
		expect(new Set([boxes[1].y, boxes[4].y]).size).toBe(1)
		expect(boxes[2].y).toBeGreaterThan(boxes[1].y + boxes[1].h)
		const leaves = [2, 3, 5, 6].map((i) => boxes[i])
		for (let k = 1; k < leaves.length; k++) expect(leaves[k].x - leaves[k].w / 2).toBeGreaterThan(leaves[k - 1].x + leaves[k - 1].w / 2)
		for (const b of boxes) {
			expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0)
			expect(b.x + b.w / 2).toBeLessThanOrEqual(box.w + 1e-9)
			expect(b.y + b.h / 2).toBeLessThanOrEqual(box.h + 1e-9)
		}
		expect(scene.edges.map((e) => `${e.from}-${e.to}`)).toEqual(['c0-c1', 'c1-c2', 'c1-c3', 'c0-c4', 'c4-c5', 'c4-c6'])
	})

	it('with colour cues each box keeps room on its left for the badge, and its text moves right to match', () => {
		const plain = callTreeLayout(calls, 'm', 'sum', 'draw')
		const cued = callTreeLayout(calls, 'm', 'sum', 'draw', true)
		expect(plain.textShift).toBe(0)
		expect(cued.textShift).toBeGreaterThan(0)
		expect(cued.boxes[0].w - plain.boxes[0].w).toBeCloseTo(cued.textShift * 2)
		// Text a mono font needs more room than the handwriting font.
		expect(callTreeLayout(calls, 'm', 'sum', 'mono').boxes[0].w).toBeGreaterThan(plain.boxes[0].w)
	})

	it('a stick goes straight down; first calls (a forest) sit side by side', () => {
		const stick: Call[] = [0, 1, 2].map((k) => ({ label: `f(${k})`, parent: k - 1 }))
		const { boxes } = callTreeLayout(stick, 'm', 'f')
		expect(new Set(boxes.map((b) => b.x)).size).toBe(1)
		const forest: Call[] = [
			{ label: 'dfs(A)', parent: -1 },
			{ label: 'dfs(B)', parent: 0 },
			{ label: 'dfs(C)', parent: -1 },
		]
		const placed = callTreeLayout(forest, 'm', 'dfs').boxes
		expect(placed[2].y).toBe(placed[0].y)
		expect(placed[2].x - placed[2].w / 2).toBeGreaterThan(placed[0].x + placed[0].w / 2)
	})
})
