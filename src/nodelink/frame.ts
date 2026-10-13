import type { TLShapeId } from 'tldraw'
import type { MarkColor, Marks } from '../cells/marks'
import type { Pointer } from '../pointers/pointers'
import type { Scene } from './scene'

// An operation's frames, and the pure stepping through them (what each step shows, what predict mode asks).

/** A row of values shown under the structure while an operation runs (a queue, a stack, an output). */
export interface Strip {
	title: string
	items: string[]
	/** A label under each item (an array's indexes: visited[] under each vertex's name). */
	labels?: string[]
	/** A colour for some items, by position (a sort's pass row: its sorted part green). */
	marks?: Record<number, MarkColor>
}

/** One step of an animated operation. */
export interface Frame {
	/** Props to show instead of the shape's own: the state at this step. */
	props?: Record<string, unknown>
	/**
	 * A whole scene to show instead (layout coordinates, as `buildScene` makes), for states the
	 * props can't express: a node not linked in yet, an arrow re-pointed or curving back.
	 */
	scene?: Scene
	/** Pointers to show at this step instead of the shape's own (e.g. curr, prev, next walking). */
	pointers?: Pointer[]
	/** Node keys whose values just swapped: their values arc between the two nodes. */
	swaps?: [string, string][]
	/** Values just copied from one element to another (`[from, to]`): the value at `to` slides in from `from`. */
	moves?: [string, string][]
	/** Elements out of play from this step on, drawn faded (replacing earlier ones): a discarded half. */
	dim?: string[]
	/** Running totals shown in the play bar from this step on (replacing earlier ones): comparisons, swaps. */
	counts?: Record<string, number>
	/**
	 * Highlights to set at this step, on nodes or edges (`edge:<key>`). They accumulate across
	 * steps; null clears one again.
	 */
	flash?: Record<string, MarkColor | null>
	/** Small labels beside nodes, such as discovery order. They accumulate. */
	badges?: Record<string, string>
	/** Queues, stacks or output sequences shown from this step on (replacing earlier ones). */
	strips?: Strip[]
	/** One line saying what this step does, shown in the play bar. */
	caption?: string
	/**
	 * In predict mode, the question put to the class before this step is shown, worded so it doesn't
	 * give the answer away (default: DEFAULT_QUESTION). False: nothing to guess (it carries out what
	 * the step before announced, or sums up), so it shows straight away.
	 */
	ask?: string | false
	/** Elements the question is about (nodes, `edge:<key>`), pulsing while it is asked. */
	askFocus?: string[]
	/** Disjoint sets at this step (a graph's Kruskal), for the union-find drawn beside the structure. */
	sets?: FrameSets
	/**
	 * Recursive calls made and returned at this step, in order, for the recursion tree drawn beside
	 * the structure (see `src/shapes/recursion/`).
	 */
	calls?: CallEvent[]
	/**
	 * The line of the operation's code this step is on (a tag in its code, see
	 * `src/shapes/code/algorithms.ts`), lit in a code box following the structure.
	 */
	line?: string
	/**
	 * The code's variables at this step beside its pointers (i, j, lo...: a pointer is a variable of its
	 * name, at its element): maxval, swapped, key... Shown after their lines in the code box.
	 */
	vars?: Record<string, string>
	/**
	 * How many times each line of the code has run so far, by tag (loop headers once per test, so one
	 * more than their body when the loop runs out), for the code box's times column.
	 */
	runs?: Record<string, number>
	/** How much of a shuffle's outcomes the view beside the array shows (`src/shapes/outcomes/`). */
	outcomes?: FrameOutcomes
	/**
	 * Highlights on the views beside a graph at this step only, by view and its own keys (matrix cells
	 * `r,c`, list heads and entries, edge-list rows): what a representation touches (`src/shapes/graph-view/costs.ts`).
	 */
	views?: Partial<Record<'matrix' | 'lists' | 'edges', Marks>>
	/** How many rows of a sort's counts table beside the array show (`src/shapes/growth/`). */
	growth?: { sort: string; rows: number }
	/**
	 * A labelled bracket along cells `from`..`to` of an array: what holds over them at this step (a
	 * loop invariant over the part done so far).
	 */
	band?: { from: number; to: number; label: string }
	/**
	 * Highlights on other shapes' cells at this step, by shape id (an array being merged in: the cell
	 * j is on), drawn by those shapes (`otherMarks`); a pointer at one is at `otherKey(id, cell)`.
	 */
	others?: Record<string, Marks>
}

/** A step's pointer at another shape's cell (an array being merged in): `at` for it. */
export const otherKey = (id: string, cell: string) => `${id}#${cell}`

/** The shape and cell an `otherKey` names, if it names one. */
export function parseOtherKey(key: string): { id: TLShapeId; cell: string } | undefined {
	const at = key.lastIndexOf('#')
	return at > 0 ? { id: key.slice(0, at) as TLShapeId, cell: key.slice(at + 1) } : undefined
}

/** Shapes an operation's steps light besides its own (exported with it). */
export const othersOf = (frames: readonly Frame[]): TLShapeId[] => [...new Set(frames.flatMap((f) => Object.keys(f.others ?? {})))] as TLShapeId[]

/**
 * A shuffle's outcomes at a step: every run as a tree, revealed down to pick `level` (past the last
 * pick, the leaves coloured by order and their tally too), or the first `runs` of many runs tallied.
 */
export interface FrameOutcomes {
	kind: 'unfair' | 'fisher-yates'
	mode: 'tree' | 'tally'
	level?: number
	runs?: number
}

/**
 * A recursive call being made (`call`: what it is called with, e.g. "sum(0, 3)"; it is made by the
 * call running then), or the running call returning (`returns`: its value, '' for nothing). `id`
 * tells calls apart when their text could match (a sort's calls show the values they get: two
 * calls on [4] aren't the same call); `size`: how many values the call works on, added up per level
 * beside the recursion tree.
 */
export type CallEvent = { call: string; id?: string; size?: number } | { returns: string }

/**
 * Disjoint sets as a step leaves them: each node's parent and each node's set size (meaningful at
 * roots), keyed by node, and what to light on the union-find (nodes, `edge:<node>` for a node's
 * parent pointer) at this step.
 */
export interface FrameSets {
	parent: Record<string, string>
	sizes: Record<string, number>
	flash?: Record<string, MarkColor>
}

/** What predict mode asks before a step that has no question of its own. */
export const DEFAULT_QUESTION = 'What happens next?'

/**
 * Where an operation stands: on step `step` (from 0), or, in predict mode, asking the class about
 * it first, with the step before it still on screen.
 */
export interface Position {
	step: number
	asking: boolean
}

/** The frame on screen at a position: while asking about a step, the one before it (-1: none yet). */
export const shownFrame = (at: Position) => (at.asking ? at.step - 1 : at.step)

/**
 * Where one press forward (`dir` 1) or back (-1) goes. With `asks` (predict mode, stepping by hand,
 * result not in yet) every step takes two presses forward, the question then the reveal, and back
 * undoes them one at a time. Undefined: past the last step (forward: the result) or at the start.
 */
export function stepFrom(
	at: Position,
	dir: 1 | -1,
	{ steps, asks }: { steps: number; asks: boolean | ((step: number) => boolean) }
): Position | undefined {
	// Steps with nothing to guess take one press either way.
	const asksAt = (step: number) => (typeof asks === 'function' ? asks(step) : asks)
	if (dir > 0) {
		if (at.asking) return { step: at.step, asking: false }
		return at.step < steps - 1 ? { step: at.step + 1, asking: asksAt(at.step + 1) } : undefined
	}
	if (!at.asking && asksAt(at.step)) return { step: at.step, asking: true }
	return at.step > 0 ? { step: at.step - 1, asking: false } : undefined
}

/** What step `step` shows once the steps before it have had their say. */
export interface StepState {
	flash: Marks
	badges: Record<string, string>
	strips?: Strip[]
	dim?: string[]
	counts?: Record<string, number>
}

export function stateAt(frames: readonly Frame[], step: number): StepState {
	const flash: Marks = {}
	const badges: Record<string, string> = {}
	let strips: Strip[] | undefined
	let dim: string[] | undefined
	let counts: Record<string, number> | undefined
	for (const frame of frames.slice(0, step + 1)) {
		for (const [key, color] of Object.entries(frame.flash ?? {})) {
			if (color === null) delete flash[key]
			else flash[key] = color
		}
		Object.assign(badges, frame.badges)
		if (frame.strips) strips = frame.strips
		if (frame.dim) dim = frame.dim
		if (frame.counts) counts = frame.counts
	}
	return { flash, badges, strips, dim, counts }
}
