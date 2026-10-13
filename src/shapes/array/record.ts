import type { MarkColor, Marks } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { CallEvent, Frame, Strip } from '../../nodelink/playback'
import type { Pointer } from '../../pointers/pointers'
import { swapCells } from './swap'

// Array algorithms, step by step. Each step is a line of the code a teacher writes on the board
// (mid = (lo + hi) / 2, swap(a[j], a[j + 1]), a[i] = a[i + 1]...), drawn as it happens: pointers
// slide along the array, the cells being compared light orange, values swap or shift in arcs,
// cells in their final place turn green and cells out of play fade. Marks travel with values.

export const LOOK: MarkColor = 'orange'
export const DONE: MarkColor = 'green'
export const GONE: MarkColor = 'red'
export const PIVOT: MarkColor = 'red'
export const SMALL: MarkColor = 'blue'

/** A second row of cells drawn under the array during a step: a new array being filled, a sorted copy. */
export interface AuxRow {
	title: string
	values: string[]
	/** Its cells lit at this step, by index (the neighbours being compared). */
	marks?: Record<number, MarkColor>
	/** Room above its title (to clear something in the way: an array being merged in), and between the title and its cells (for pointers). */
	drop?: number
	gap?: number
}

/**
 * The array an operation works on: values and the marks travelling with them; for a fixed
 * capacity, how many are in use (the rest are blank). During a step, maybe a second row.
 */
export interface ArrayState {
	values: string[]
	marks: Marks
	used?: number
	/** A circular buffer's front. */
	front?: number
	aux?: AuxRow
}

export interface ArrayOperation {
	frames: Frame[]
	/** The array afterwards, if the operation changes it. */
	result?: ArrayState
	/** Highlights on the result. */
	finalFlash?: Marks
	/** Its code (an algorithm in `code.ts`), if it has some: the line each step is on is its frame's `line`. */
	code?: string
}

export const ptr = (name: string, at: number): Pointer => ({ id: `#${name}`, name, at: String(at) })

/** Cell keys from..to (inclusive). */
export const span = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => String(from + k))

/** The same colour on cells from..to. */
export const lit = (from: number, to: number, color: MarkColor): Marks => Object.fromEntries(span(from, to).map((k) => [k, color]))

export const isSorted = (values: readonly string[]) => values.every((v, i) => i === 0 || compareKeys(values[i - 1], v) <= 0)

export interface Step {
	/** Highlights shown at this step (the recorder works out what changed). */
	lit?: Marks
	pointers?: Pointer[]
	dim?: string[]
	swaps?: [number, number][]
	/** Copies, `[from, to]`: cell indices, or `aux:<i>` for the second row's cells. */
	moves?: [number | string, number | string][]
	strips?: Strip[]
	/** Predict mode's question before this step (false: nothing to guess), and the cells it is about. */
	ask?: string | false
	askFocus?: (number | string)[]
	/** Recursive calls made and returned at this step, for the recursion tree beside the array. */
	calls?: CallEvent[]
	/** The line of the operation's code this step is on (a tag in `code.ts`). */
	line?: string
	/** A labelled bracket along cells from..to: what holds over them (a loop invariant). */
	band?: Frame['band']
	/** Small notes in cells' corners, by index, kept for later steps ('' takes one away). */
	badges?: Record<string, string>
	/** Highlights on other shapes' cells (an array being merged in), by shape id. */
	others?: Frame['others']
}

/**
 * Records frames from what each step shows: its highlights (turned into the changes a frame
 * holds), pointers, faded cells, and the array as it is then, with the counts so far.
 */
export function recorder(start: ArrayState, counts: Record<string, number>) {
	const frames: Frame[] = []
	let shown: Marks = {}
	let state: ArrayState = { ...start, values: [...start.values], marks: { ...start.marks } }
	/** The code's variables beside the pointers (maxval, swapped...): every step from now on shows them. */
	const vars: Record<string, string> = {}
	/** Times each counted line of the code has run, by tag. */
	const runs: Record<string, number> = {}
	return {
		frames,
		counts,
		/** The lines of the code that are counted (each from 0), by tag: every step shows their counts. */
		counting(...tags: string[]) {
			for (const tag of tags) runs[tag] = 0
		},
		/**
		 * The code ran these lines (once each, in order) on its way to the next step. Only the lines
		 * `counting` named count: steps shared with operations that don't count (quicksort's partition,
		 * which its variants call too) say what they ran either way.
		 */
		ran(...tags: string[]) {
			for (const tag of tags) if (tag in runs) runs[tag]++
		},
		/** Set a variable (undefined: it goes out of scope); later steps show it. */
		let(name: string, value: string | number | boolean | undefined) {
			if (value === undefined) delete vars[name]
			else vars[name] = String(value)
		},
		get state() {
			return state
		},
		/** The array changes (a swap, a copy): later steps show it. */
		set(next: ArrayState) {
			state = next
		},
		step(caption: string, { lit: next = {}, pointers = [], dim = [], swaps, moves, strips, ask, askFocus, calls, line, band, badges, others }: Step = {}) {
			const flash: Record<string, MarkColor | null> = {}
			for (const key of Object.keys(shown)) if (!next[key]) flash[key] = null
			for (const [key, color] of Object.entries(next)) if (shown[key] !== color) flash[key] = color
			shown = { ...next }
			const keys = (pairs?: [number | string, number | string][]) => pairs?.map(([a, b]): [string, string] => [String(a), String(b)])
			const { values, marks, used, front, aux } = state
			frames.push({
				caption,
				props: { values, marks, ...(used === undefined ? {} : { used }), ...(front === undefined ? {} : { front }), ...(aux ? { aux } : {}) },
				flash,
				pointers,
				dim,
				swaps: keys(swaps),
				moves: keys(moves),
				strips,
				counts: { ...counts },
				...(ask === undefined ? {} : { ask }),
				...(askFocus ? { askFocus: askFocus.map(String) } : {}),
				...(calls ? { calls } : {}),
				...(line ? { line } : {}),
				...(band ? { band } : {}),
				...(badges ? { badges } : {}),
				...(others ? { others } : {}),
				...(Object.keys(vars).length ? { vars: { ...vars } } : {}),
				...(Object.keys(runs).length ? { runs: { ...runs } } : {}),
			})
		},
	}
}

export const swapped = (state: ArrayState, a: number, b: number): ArrayState => ({ ...state, ...swapCells(state.values, state.marks, a, b) })

/** a[to] = a[from]: the value (and its mark) copied, the old one at `to` overwritten. */
export function copied(state: ArrayState, from: number, to: number): ArrayState {
	const values = [...state.values]
	values[to] = values[from]
	const marks = { ...state.marks }
	if (marks[String(from)]) marks[String(to)] = marks[String(from)]
	else delete marks[String(to)]
	return { ...state, values, marks }
}


export type Recorder = ReturnType<typeof recorder>

/** What every step of a recursive call shows around its range: the rest faded, the call stack. */
export type Around = Pick<Step, 'dim' | 'strips'>

/** Predict mode's question before each recursive call: the call stack is under the array. */
export const NEXT_CALL = 'Which call comes next?'

/** "1 copy", "3 copies". */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
