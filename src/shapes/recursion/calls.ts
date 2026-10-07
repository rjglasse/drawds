import type { TLDefaultFontStyle, TLDefaultSizeStyle } from 'tldraw'
import type { MarkColor, Marks } from '../../cells/marks'
import type { Frame } from '../../nodelink/playback'
import { edgeCellKey, type Scene, type SceneEdge, type SceneNode } from '../../nodelink/scene'
import { CELL_SIZES } from '../sizes'

// A recursive operation's calls, rebuilt from its frames (each frame says which calls it makes and
// returns), and drawn as a recursion tree: each call a box under the call that made it, what it
// was called with on top and what it returned underneath. Pure, so the tree beside the structure
// can follow the steps: calls appear as they are made, the running one red, the ones waiting for
// it orange (the call stack is the path up from it to the first call), returned ones blue.

/** A call: what it was called with, the call that made it (-1: none, a first call), what it returned. */
export interface Call {
	label: string
	parent: number
	/** What it returned ('' for nothing); left out while it hasn't returned (or if it never did). */
	result?: string
}

/** A run's calls in the order they were made, the step each was made at, and the step each returned at. */
export interface CallRun {
	calls: Call[]
	opened: number[]
	returned: (number | undefined)[]
}

export const hasCalls = (frames: readonly Frame[]) => frames.some((f) => f.calls?.length)

const runs = new WeakMap<readonly Frame[], CallRun>()

/** The calls the frames make, replaying their call / return events on a stack. Cached per frames array. */
export function callRun(frames: readonly Frame[]): CallRun {
	const cached = runs.get(frames)
	if (cached) return cached
	const run: CallRun = { calls: [], opened: [], returned: [] }
	const stack: number[] = []
	frames.forEach((frame, step) => {
		for (const event of frame.calls ?? []) {
			if ('call' in event) {
				run.calls.push({ label: event.call, parent: stack.at(-1) ?? -1 })
				run.opened.push(step)
				run.returned.push(undefined)
				stack.push(run.calls.length - 1)
			} else {
				const top = stack.pop()
				if (top === undefined) continue
				run.calls[top].result = event.returns
				run.returned[top] = step
			}
		}
	})
	runs.set(frames, run)
	return run
}

/** Two runs with the same calls (and results) draw the same tree: one tree can show either. */
export const callsSignature = (calls: readonly Call[]) => JSON.stringify(calls.map((c) => [c.label, c.parent, c.result ?? null]))

/**
 * - running: what the step is about: the call returning at this step, else the newest call open
 * - waiting: made, not returned yet, waiting for a call it made (on the stack)
 * - returned: returned at an earlier step
 */
export type CallState = 'running' | 'waiting' | 'returned'

/** The state of each call made by step `step` (calls not made yet are left out). */
export function callStates(run: CallRun, step: number): Map<number, CallState> {
	const states = new Map<number, CallState>()
	const open: number[] = []
	const returning: number[] = []
	run.calls.forEach((_, i) => {
		if (run.opened[i] > step) return
		const r = run.returned[i]
		if (r === undefined || r > step) open.push(i)
		else if (r === step) returning.push(i)
		else states.set(i, 'returned')
	})
	// Open calls are the stack, oldest at the bottom: each was made by the one before it.
	open.forEach((i, k) => states.set(i, !returning.length && k === open.length - 1 ? 'running' : 'waiting'))
	for (const i of returning) states.set(i, 'running')
	return states
}

const STATE_COLORS: Record<CallState, MarkColor> = { running: 'red', waiting: 'orange', returned: 'blue' }
/** A repeated call, once it has returned (and on the whole run): work done again. */
const REPEAT: MarkColor = 'green'

export const callKey = (i: number) => `c${i}`
export const callEdgeKey = (i: number) => `e${i}`

/** Highlights for the states: on the calls' boxes, and on the stack's edges (the path up to the first call). */
export function callHighlights(run: CallRun, states: Map<number, CallState>): Marks {
	const marks: Marks = {}
	const repeats = repeatedCalls(run.calls)
	for (const [i, state] of states) {
		marks[callKey(i)] = state === 'returned' && repeats.has(i) ? REPEAT : STATE_COLORS[state]
		if (state !== 'returned' && run.calls[i].parent >= 0) marks[edgeCellKey(callEdgeKey(i))] = 'orange'
	}
	return marks
}

/**
 * Calls made again: the same call (same arguments) already made and finished elsewhere in the tree,
 * not one still waiting further up the stack (sayHello calling itself is recursion, not a repeat).
 * fib's overlapping subproblems: work done twice.
 */
export function repeatedCalls(calls: readonly Call[]): Set<number> {
	const repeats = new Set<number>()
	const seen = new Map<string, number[]>()
	calls.forEach((c, i) => {
		const ancestors = new Set<number>()
		for (let p = c.parent; p >= 0; p = calls[p].parent) ancestors.add(p)
		if ((seen.get(c.label) ?? []).some((j) => !ancestors.has(j))) repeats.add(i)
		seen.set(c.label, [...(seen.get(c.label) ?? []), i])
	})
	return repeats
}

/** Whether some call makes more than one call: the run is a tree, not a chain (a chain is just the stack). */
export function branches(calls: readonly Call[]): boolean {
	const made = new Map<number, number>()
	for (const c of calls) if (c.parent >= 0) made.set(c.parent, (made.get(c.parent) ?? 0) + 1)
	return [...made.values()].some((n) => n > 1)
}

/** The whole run's repeats, marked (the tree when it isn't following a run). */
export const repeatMarks = (calls: readonly Call[]): Marks => Object.fromEntries([...repeatedCalls(calls)].map((i) => [callKey(i), REPEAT]))

/** How many calls deep the run goes: the most on the stack at once. */
export function callDepth(calls: readonly Call[]): number {
	const depth: number[] = []
	calls.forEach((c, i) => (depth[i] = c.parent >= 0 ? depth[c.parent] + 1 : 1))
	return Math.max(0, ...depth)
}

/** The tree's heading: the operation, how many calls it made, how deep they went, how many were repeats. */
export function callsTitle(title: string, calls: readonly Call[]) {
	const n = calls.length
	const repeats = repeatedCalls(calls).size
	return `${title}: ${n} call${n === 1 ? '' : 's'}, ${callDepth(calls)} deep${repeats ? `, ${repeats} repeated` : ''}`
}

export interface CallBox {
	x: number
	y: number
	w: number
	h: number
}

export interface CallTreeLayout {
	/** Every call's box and the lines from each call to the calls it made (shape space, from 0,0). */
	scene: Scene
	boxes: CallBox[]
	/** Where the heading starts (its left end, vertical centre), and the font size of the heading and the calls' text. */
	title: { x: number; y: number }
	fontSize: number
	/** How far right of a box's centre its text is centred (clear of a colour cue's badge in the top-left corner). */
	textShift: number
	box: { x: number; y: number; w: number; h: number }
}

/** The text under a call: what it returned (done: nothing), or a question mark while it waits. */
export const resultText = (result: string | undefined) => (result === undefined ? '= ?' : result === '' ? 'done' : `= ${result}`)

/** About how wide a character is in each font, as a fraction of the font size (a little over, to be safe). */
export const CHAR_WIDTH: Record<TLDefaultFontStyle, number> = { mono: 0.62, sans: 0.57, serif: 0.55, draw: 0.56 }

/**
 * The whole run's tree, laid out once so it holds still while it grows: each call centred over the
 * calls it made (in the order made), first calls side by side, the heading above. With colour `cues` each
 * box keeps room on its left for the badge a highlight puts in its top-left corner.
 */
export function callTreeLayout(
	calls: readonly Call[],
	size: TLDefaultSizeStyle,
	title: string,
	font: TLDefaultFontStyle = 'mono',
	cues = false
): CallTreeLayout {
	const cell = CELL_SIZES[size]
	const fontSize = cell * 0.3
	const charW = fontSize * CHAR_WIDTH[font]
	const pad = fontSize * 0.6
	const boxH = fontSize * 3
	const sep = fontSize * 0.9
	const levelGap = fontSize * 1.6
	const treeGap = fontSize * 2
	const titleH = fontSize * 2.2
	const strokeWidth = Math.max(1.5, cell / 24)
	// A cue badge: radius 0.14 of the box's height, inset by 1.2 strokes (SceneSvg's cueBadgeAt).
	const padLeft = cues ? Math.max(pad, boxH * 0.28 + strokeWidth * 1.2 + fontSize * 0.3) : pad
	const widths = calls.map((c) => Math.max(c.label.length, resultText(c.result).length, resultText(undefined).length) * charW + padLeft + pad)
	const children: number[][] = calls.map(() => [])
	calls.forEach((c, i) => c.parent >= 0 && children[c.parent].push(i))
	const span: number[] = []
	const spanOf = (i: number): number => {
		const kids = children[i]
		const below = kids.reduce((s, k) => s + spanOf(k), 0) + sep * Math.max(0, kids.length - 1)
		return (span[i] = Math.max(widths[i], below))
	}
	const boxes: CallBox[] = []
	const place = (i: number, left: number, depth: number) => {
		const kids = children[i]
		const y = titleH + depth * (boxH + levelGap) + boxH / 2
		if (!kids.length) {
			boxes[i] = { x: left + span[i] / 2, y, w: widths[i], h: boxH }
			return
		}
		const below = kids.reduce((s, k) => s + span[k], 0) + sep * (kids.length - 1)
		let at = left + (span[i] - below) / 2
		for (const k of kids) {
			place(k, at, depth + 1)
			at += span[k] + sep
		}
		boxes[i] = { x: (boxes[kids[0]].x + boxes[kids[kids.length - 1]].x) / 2, y, w: widths[i], h: boxH }
	}
	let left = 0
	calls.forEach((c, i) => {
		if (c.parent >= 0) return
		if (left) left += treeGap
		spanOf(i)
		place(i, left, 0)
		left += span[i]
	})
	const heading = callsTitle(title, calls)
	const levels = callDepth(calls)
	const nodes: SceneNode[] = boxes.map((b, i) => ({
		key: callKey(i),
		kind: 'box',
		...b,
		value: '',
		editable: false,
		draggable: false,
	}))
	const edges: SceneEdge[] = calls.flatMap((c, i) =>
		c.parent >= 0 ? [{ key: callEdgeKey(i), from: callKey(c.parent), to: callKey(i), directed: false }] : []
	)
	return {
		scene: { nodes, edges, metrics: { fontSize, labelFontSize: fontSize, strokeWidth } },
		boxes,
		title: { x: 0, y: fontSize * 0.8 },
		fontSize,
		textShift: (padLeft - pad) / 2,
		box: {
			x: 0,
			y: 0,
			w: Math.max(1, left, heading.length * charW),
			h: levels ? titleH + levels * (boxH + levelGap) - levelGap : titleH,
		},
	}
}
