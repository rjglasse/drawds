import { atom, react, type Atom, type Editor, type TLShape, type TLShapeId, type TLShapePartial } from 'tldraw'
import type { MarkColor, Marks } from '../cells/marks'
import type { Pointer } from '../pointers/pointers'
import type { Scene } from './scene'
import { isTyping, swallowKeyUp } from '../controls/keys'
import { showCodeOf } from '../shapes/code/follow'

/** A row of values shown under the structure while an operation runs (a queue, a stack, an output). */
export interface Strip {
	title: string
	items: string[]
	/** A label under each item (an array's indexes: visited[] under each vertex's name). */
	labels?: string[]
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
	 * A labelled bracket along cells `from`..`to` of an array: what holds over them at this step (a
	 * loop invariant over the part done so far).
	 */
	band?: { from: number; to: number; label: string }
}

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

/** What the shape should draw right now. */
export interface PlaybackView extends StepState {
	shapeId: TLShapeId
	/** The current frame, while the operation is open. */
	frame?: Frame
	/** Every frame of the operation (the same array throughout it), to place its bar once. */
	frames: readonly Frame[]
	/** After it has been dismissed, the highlights fade out. */
	fading: boolean
	/** Changes on every step shown, so animations restart. */
	id: number
	/** While the operation is open: the step shown (from 0), how many there are, whether it waits. */
	step: number
	steps: number
	paused: boolean
	/** The result has been committed; the bar stays up to review or replay until dismissed. */
	done: boolean
	/** Predict mode: the question about step `step`, asked while the step before it is on screen. */
	question?: string
	/** Elements the question is about, pulsing. */
	pulse?: string[]
	/** The operation's code (an algorithm with code, see `src/shapes/code/algorithms.ts`), if it has some. */
	code?: string
	/**
	 * The shape just before and after the result went in. Steps shown afterwards undo the move it
	 * made (a list's new head moves the shape's origin back), so they stay where they were.
	 */
	committed?: { before: TLShape; after: TLShape }
}

/**
 * Room an open operation's steps need, in the shape's layout coordinates, kept in its meta: shapes
 * whose steps draw more (or elsewhere) than the shape itself count it in their layout, so their box
 * holds every step, and `CellShapeUtil.onBeforeUpdate` moves the shape so nothing shifts on the page.
 * Set when an operation opens and cleared when it closes, never in the undo history.
 */
export const ROOM_KEY = 'drawdsRoom'

export interface Room {
	minX: number
	minY: number
	maxX: number
	maxY: number
}

export function roomOf(shape: TLShape): Room | undefined {
	// Null once taken away (meta updates merge, so a key can't be dropped).
	const room = shape.meta[ROOM_KEY] as Partial<Room> | null | undefined
	return room && [room.minX, room.minY, room.maxX, room.maxY].every((v) => typeof v === 'number') ? (room as Room) : undefined
}

/** Shapes that need room for their steps work it out (see `NodeLinkShapeUtil.withPlaybackRoom`). */
interface RoomMaker {
	withPlaybackRoom?(shape: TLShape, frames: readonly Frame[] | undefined): TLShapePartial | undefined
}

/** Make room for an operation's `frames` on its shape, or (none) take it away again. */
function fitRoom(editor: Editor, shapeId: TLShapeId, frames?: readonly Frame[]) {
	const shape = editor.getShape(shapeId)
	if (!shape) return
	const update = (editor.getShapeUtil(shape) as RoomMaker).withPlaybackRoom?.(shape, frames)
	if (update) editor.run(() => editor.updateShape(update), { history: 'ignore', ignoreShapeLock: true })
}

/**
 * Take away room no open operation needs: left by a reload mid-operation, or brought back by undoing
 * a change made while an operation was open. Returns the cleanup.
 */
export function clearStaleRooms(editor: Editor) {
	const stale = (shape: TLShape) => !!roomOf(shape) && player(editor).op?.shapeId !== shape.id
	for (const record of editor.store.allRecords()) if (record.typeName === 'shape' && stale(record)) fitRoom(editor, record.id)
	return editor.sideEffects.registerAfterChangeHandler('shape', (_prev, next) => {
		if (stale(next)) editor.timers.setTimeout(() => editor.getShape(next.id) && stale(editor.getShape(next.id)!) && fitRoom(editor, next.id), 0)
	})
}

/** Time per frame when playing, and how long highlights take to fade after an operation. */
export const STEP_MS = 650
export const FADE_MS = 2200

interface Operation {
	shapeId: TLShapeId
	label: string
	frames: Frame[]
	final?: TLShapePartial
	finalFlash: Marks
	keep: boolean
	withMarks?(update: TLShapePartial | undefined, marks: Marks): TLShapePartial
	onCancel?(): void
	onClose?(): void
	/** Played again from a record (the lesson log): not recorded, and its result stays out of the undo history. */
	replay: boolean
	code?: string
	/** When each step came on screen (step, epoch ms), for lining the steps up with a transcript. */
	shown: [number, number][]
	/** Told when the operation closes, if it is being recorded. */
	ended?: (end: OperationEnd) => void
	step: number
	/** Predict mode: asking about `step` before showing it. */
	asking: boolean
	paused: boolean
	/** Set once the result is committed. */
	done: boolean
	committed?: { before: TLShape; after: TLShape }
}

interface Player {
	view: Atom<PlaybackView | null>
	op?: Operation
	timer?: ReturnType<typeof setTimeout>
	/** Undo the key capture and the watcher of an open operation. */
	detach: (() => void)[]
}

const players = new WeakMap<Editor, Player>()

/** What an operation was, for a record of it (the lesson log). */
export interface OperationRecord {
	shapeId: TLShapeId
	label: string
	frames: Frame[]
	final?: TLShapePartial
	finalFlash?: Marks
	/** The algorithm whose code it shows, if it has some. */
	code?: string
}

/** How an operation ended: its result in or cancelled, and when each step came on screen (step, epoch ms). */
export interface OperationEnd {
	outcome: 'done' | 'cancelled'
	shown: [number, number][]
}

/** Told about every operation that opens (not replays); returns what to tell when it closes. */
export type OperationRecorder = (record: OperationRecord) => ((end: OperationEnd) => void) | void

const recorders = new WeakMap<Editor, OperationRecorder>()

/** Record every operation played from now on (the lesson log). Returns the cleanup. */
export function recordOperations(editor: Editor, recorder: OperationRecorder) {
	recorders.set(editor, recorder)
	return () => void recorders.delete(editor)
}
let nextViewId = 1

function player(editor: Editor): Player {
	let p = players.get(editor)
	if (!p) {
		p = { view: atom('playback', null), detach: [] }
		players.set(editor, p)
	}
	return p
}

// Operations open paused on their first step, so the teacher sets the pace: step with the arrows,
// or press play. Autoplay (a per-browser preference) plays them straight away instead.

const AUTOPLAY_KEY = 'drawds:autoplay'

function readAutoplay() {
	try {
		return typeof window !== 'undefined' && window.localStorage.getItem(AUTOPLAY_KEY) === 'on'
	} catch {
		return false
	}
}

const autoplayAtom = atom('autoplay', readAutoplay())

/** Whether operations play as soon as they start. Reactive. */
export const isAutoplay = () => autoplayAtom.get()

// Playing speed, a per-browser preference like autoplay: long operations (bubble sort) at 2x or 4x,
// or slower to talk over each step.

export const SPEEDS = [0.5, 1, 2, 4] as const
const SPEED_KEY = 'drawds:speed'

function readSpeed() {
	try {
		const v = Number(typeof window !== 'undefined' ? window.localStorage.getItem(SPEED_KEY) : NaN)
		return (SPEEDS as readonly number[]).includes(v) ? v : 1
	} catch {
		return 1
	}
}

const speedAtom = atom('playback speed', readSpeed())

// Predict mode, a per-browser preference too: before each step, the bar asks the class what it will
// do, and only the next press shows it. Playing (Space, autoplay) goes straight through.

const PREDICT_KEY = 'drawds:predict'

function readPredict() {
	try {
		return typeof window !== 'undefined' && window.localStorage.getItem(PREDICT_KEY) === 'on'
	} catch {
		return false
	}
}

const predictAtom = atom('predict', readPredict())

/** Whether steps are asked about before they are shown. Reactive. */
export const isPredicting = () => predictAtom.get()

export function setPredict(editor: Editor, on: boolean) {
	predictAtom.set(on)
	try {
		window.localStorage.setItem(PREDICT_KEY, on ? 'on' : 'off')
	} catch {
		// Storage can be unavailable (private windows); the setting then lasts for this page.
	}
	// Switched off mid-question: show the answer. Switched on: the next step asks.
	const p = player(editor)
	if (p.op?.asking && !on) go(editor, { step: p.op.step, asking: false })
}

/**
 * Whether step `step` is asked about first: predict mode, stepping by hand, the result not in yet,
 * and something to guess.
 */
const asks = (op: Operation) => (step: number) => predictAtom.get() && op.paused && !op.done && op.frames[step]?.ask !== false

/** The playing speed (1 = STEP_MS a step). Reactive. */
export const playbackSpeed = () => speedAtom.get()

/** The next speed up, wrapping round to the slowest. */
export function cycleSpeed() {
	const next = SPEEDS[(SPEEDS.indexOf(speedAtom.get() as (typeof SPEEDS)[number]) + 1) % SPEEDS.length]
	speedAtom.set(next)
	try {
		window.localStorage.setItem(SPEED_KEY, String(next))
	} catch {
		// Storage can be unavailable (private windows); the setting then lasts for this page.
	}
}

/**
 * How long a step's own animation (values arcing, a slide) may take: its full `ms` when stepping
 * by hand, but no longer than most of a step while playing fast. Reactive.
 */
export function animationMs(ms: number, view: PlaybackView | null | undefined) {
	return view && !view.paused && !view.fading ? Math.min(ms, (STEP_MS / speedAtom.get()) * 0.85) : ms
}

export function setAutoplay(editor: Editor, on: boolean) {
	autoplayAtom.set(on)
	try {
		window.localStorage.setItem(AUTOPLAY_KEY, on ? 'on' : 'off')
	} catch {
		// Storage can be unavailable (private windows); the setting then lasts for this page.
	}
	const op = player(editor).op
	if (op && !op.done && op.paused === on) togglePlayback(editor)
}

/** Whether an operation's bar is up (playing, paused, or done and waiting to be dismissed). */
export function isPlaying(editor: Editor) {
	return !!player(editor).op
}

/** The animation state for a shape, if it is playing one. Reactive. */
export function playbackFor(editor: Editor, shapeId: TLShapeId): PlaybackView | undefined {
	const view = player(editor).view.get()
	return view?.shapeId === shapeId ? view : undefined
}

/**
 * Whether the shape is busy with an operation: playing, paused, or stepped back through after it
 * finished. A finished operation resting on its last step leaves the shape's controls usable.
 */
export function isBusy(view: PlaybackView | null | undefined) {
	return !!view && !view.fading && !(view.done && view.step === view.steps - 1)
}

/** The operation being shown, on whichever shape. Reactive. */
export function currentPlayback(editor: Editor): PlaybackView | null {
	return player(editor).view.get()
}

/**
 * Play an operation's frames, then apply `final` (one undo step, named `label`). The teacher can
 * pause, step back and forth or cancel on the way (see the play bar and `attachKeys`); once the
 * result is in, the bar stays up to step through or replay it until dismissed. Highlights
 * accumulate across frames plus `finalFlash`, then fade on dismissal; with `keep` they become
 * marks instead (`withMarks` merges them into an update).
 */
export function playOperation(
	editor: Editor,
	{
		shapeId,
		label,
		frames,
		final,
		finalFlash = {},
		keep = false,
		withMarks,
		onCancel,
		onClose,
		replay = false,
		code,
	}: {
		shapeId: TLShapeId
		label: string
		frames: Frame[]
		final?: TLShapePartial
		finalFlash?: Marks
		keep?: boolean
		/** Merge highlights into the final update as marks (used when `keep`). */
		withMarks?(update: TLShapePartial | undefined, marks: Marks): TLShapePartial
		/** Cancelled before its result was in (Esc): take back what was set up for it (a view it opened). */
		onCancel?(): void
		/** Closed, however (done, cancelled, or another operation opened). */
		onClose?(): void
		/** Played again from a record: not recorded, and the result stays out of the undo history. */
		replay?: boolean
		/** The algorithm it runs, if it has code: a code box following the structure shows it, its lines lit. */
		code?: string
	}
) {
	const p = player(editor)
	if (p.op) finishPlayback(editor)
	clearTimeout(p.timer)
	const paused = !autoplayAtom.get()
	// A code box following the structure shows this algorithm's code (Esc puts back what it showed),
	// as the record of it keeps it.
	const takeBack = code && !replay && frames.length ? showCodeOf(editor, shapeId, code, { open: false }) : undefined
	const ended = replay || !frames.length ? undefined : recorders.get(editor)?.({ shapeId, label, frames, final, finalFlash, code })
	p.op = {
		shapeId,
		label,
		frames,
		final,
		finalFlash,
		keep,
		withMarks,
		onCancel: takeBack
			? () => {
					takeBack()
					onCancel?.()
				}
			: onCancel,
		onClose,
		replay,
		code,
		shown: [],
		ended: ended || undefined,
		step: 0,
		asking: paused && predictAtom.get() && frames[0]?.ask !== false,
		paused,
		done: false,
	}
	if (!frames.length) {
		commit(editor, false)
		return dismiss(editor, false)
	}
	// The structure is the selection while its operation is open: it can be started from the menu over
	// it while something else is selected, and another shape selected is what closes a finished one.
	if (editor.getOnlySelectedShapeId() !== shapeId) editor.select(shapeId)
	p.detach.push(attachKeys(editor))
	fitRoom(editor, shapeId, frames)
	show(p)
	schedule(editor)
}

/** All the highlights of the last step, plus the final ones. */
function finalHighlights(op: Operation) {
	return { ...stateAt(op.frames, op.frames.length - 1).flash, ...op.finalFlash }
}

/**
 * Put the operation's position on screen. `back`: a step was undone; `still`: the same frame stays
 * (a question asked or put away), so nothing animates again.
 */
function show(p: Player, { back = false, still = false } = {}) {
	const op = p.op!
	const shown = shownFrame(op)
	// Asking about the first step: the structure as it was, nothing lit yet.
	const frame: Frame | undefined = op.frames[shown]
	const last = op.step === op.frames.length - 1 && !op.asking
	const state = stateAt(op.frames, shown)
	// Stepping back replays the swaps of the step being undone, so the values arc home again. A
	// copied value has nowhere to go back to: the old one just reappears.
	const swaps = still ? undefined : back ? op.frames[shown + 1]?.swaps : frame?.swaps
	const moves = still || back ? undefined : frame?.moves
	const asked = op.asking ? op.frames[op.step] : undefined
	if (!still && op.shown.at(-1)?.[0] !== shown) op.shown.push([shown, Date.now()])
	p.view.set({
		shapeId: op.shapeId,
		frame: frame && { ...frame, swaps, moves },
		frames: op.frames,
		...state,
		flash: op.done && last ? finalHighlights(op) : state.flash,
		fading: false,
		id: still ? (p.view.get()?.id ?? nextViewId++) : nextViewId++,
		step: op.step,
		steps: op.frames.length,
		paused: op.paused,
		done: op.done,
		committed: op.committed,
		question: asked && (asked.ask || DEFAULT_QUESTION),
		pulse: asked?.askFocus,
		code: op.code,
	})
}

/** Move to `to` and show it, animating as the frame on screen changes. */
function go(editor: Editor, to: Position) {
	const p = player(editor)
	const op = p.op!
	const before = shownFrame(op)
	op.step = to.step
	op.asking = to.asking
	const now = shownFrame(op)
	show(p, now === before ? { still: true } : { back: now < before })
}

function schedule(editor: Editor) {
	const p = player(editor)
	clearTimeout(p.timer)
	if (p.op && !p.op.paused) p.timer = setTimeout(() => stepForward(editor), STEP_MS / speedAtom.get())
}

/**
 * Show the next step. From the last one, commit the result (`keep`, Shift: as marks) and stay up
 * for review; a replay of a finished operation stops there.
 */
export function stepForward(editor: Editor, keep = false) {
	const p = player(editor)
	const op = p.op
	if (!op) return
	const next = stepFrom(op, 1, { steps: op.frames.length, asks: asks(op) })
	if (next) {
		go(editor, next)
		return schedule(editor)
	}
	clearTimeout(p.timer)
	op.paused = true
	if (!op.done) commit(editor, keep)
	else show(p)
}

/** Whether `frame` (one of the view's frames, or the copy it shows) is the operation's last step. */
export function isLastFrame(view: PlaybackView, frame: Frame) {
	const i = view.frames.indexOf(frame)
	return (i >= 0 ? i : view.step) === view.frames.length - 1
}

/** Put the open operation's result in (as reaching its last step does), staying on its bar. */
export function completeOperation(editor: Editor) {
	const op = player(editor).op
	if (op && !op.done) commit(editor, false)
}

/** The open operation: its shape, how many steps it has and where it stands. */
export function openOperation(editor: Editor) {
	const op = player(editor).op
	return op && { shapeId: op.shapeId, label: op.label, steps: op.frames.length, at: { step: op.step, asking: op.asking } as Position }
}

/** Show step `to` (or a position) of the open operation, paused there: for exporting each step. */
export function showStep(editor: Editor, to: number | Position) {
	const p = player(editor)
	const op = p.op
	if (!op) return
	clearTimeout(p.timer)
	op.paused = true
	go(editor, typeof to === 'number' ? { step: Math.max(0, Math.min(op.frames.length - 1, to)), asking: false } : to)
}

/** Show the previous step (in predict mode: ask about this one again), and pause there. */
export function stepBack(editor: Editor) {
	const p = player(editor)
	const op = p.op
	if (!op) return
	clearTimeout(p.timer)
	op.paused = true
	const previous = stepFrom(op, -1, { steps: op.frames.length, asks: asks(op) })
	if (previous) go(editor, previous)
	else show(p)
}

/**
 * Pause, or carry on playing from here (a question being asked is answered first); a finished
 * operation at its end replays from the start.
 */
export function togglePlayback(editor: Editor) {
	const p = player(editor)
	const op = p.op
	if (!op) return
	const replay = op.done && op.paused && op.step === op.frames.length - 1
	if (replay) op.step = 0
	op.paused = !op.paused
	if (replay || (!op.paused && op.asking)) {
		op.asking = false
		show(p)
	} else {
		show(p, { still: true })
	}
	schedule(editor)
}

/** Commit the result if it isn't in yet, and close the bar. `keep`: the highlights become marks. */
export function finishPlayback(editor: Editor, keep = false) {
	const op = player(editor).op
	if (!op) return
	if (!op.done) commit(editor, keep)
	dismiss(editor, keep && op.done && !op.keep)
}

/** Before the result is in, abandon the operation (nothing changes); after, close the bar. */
export function cancelPlayback(editor: Editor) {
	const p = player(editor)
	const op = p.op
	if (!op) return
	if (op.done) return dismiss(editor, false)
	clearTimeout(p.timer)
	close(editor, p)
	p.view.set(null)
	op.onCancel?.()
}

function close(editor: Editor, p: Player) {
	p.detach.forEach((f) => f())
	p.detach = []
	const op = p.op
	p.op = undefined
	if (!op) return
	fitRoom(editor, op.shapeId)
	op.ended?.({ outcome: op.done ? 'done' : 'cancelled', shown: op.shown })
	op.onClose?.()
}

/** Apply the result, as one undo step, and leave the bar up on the last step. */
function commit(editor: Editor, keepNow: boolean) {
	const p = player(editor)
	const op = p.op
	if (!op || op.done) return
	clearTimeout(p.timer)
	op.keep = op.keep || keepNow
	const update = op.keep && op.withMarks ? op.withMarks(op.final, finalHighlights(op)) : op.final
	if (update) {
		// The result goes in (and in the undo history) without the steps' room, which comes back after.
		fitRoom(editor, op.shapeId)
		const before = editor.getShape(op.shapeId)
		// A replay's result is only for show: it stays out of the undo history (and goes when it closes).
		if (op.replay) editor.run(() => editor.updateShape(update), { history: 'ignore' })
		else {
			editor.markHistoryStoppingPoint(op.label)
			editor.updateShape(update)
		}
		const after = editor.getShape(op.shapeId)
		if (before && after) op.committed = { before, after }
	}
	op.done = true
	op.paused = true
	op.step = op.frames.length - 1
	op.asking = false
	show(p)
	if (update) fitRoom(editor, op.shapeId, op.frames)
	// The bar goes when the teacher moves on: another shape selected, or this one changed.
	const committed = editor.getShape(op.shapeId)?.props
	p.detach.push(
		react('dismiss finished operation', () => {
			const shape = editor.getShape(op.shapeId)
			if (!shape || shape.props !== committed || editor.getOnlySelectedShapeId() !== op.shapeId) {
				queueMicrotask(() => p.op === op && dismiss(editor, false))
			}
		})
	)
}

/** Close the bar of a finished operation; its highlights fade, or with `keep` become marks. */
function dismiss(editor: Editor, keep: boolean) {
	const p = player(editor)
	const op = p.op
	if (!op) return
	clearTimeout(p.timer)
	close(editor, p)
	const all = finalHighlights(op)
	if (keep && op.withMarks) {
		editor.markHistoryStoppingPoint('keep highlights')
		editor.updateShape(op.withMarks(op.final, all))
	}
	// A replay's highlights go at once: the board is back as it is now.
	if (keep || op.keep || op.replay) {
		p.view.set(null)
		return
	}
	p.view.set({
		shapeId: op.shapeId,
		frames: [],
		flash: all,
		badges: stateAt(op.frames, op.frames.length - 1).badges,
		fading: true,
		id: nextViewId++,
		step: 0,
		steps: 0,
		paused: false,
		done: true,
	})
	p.timer = setTimeout(() => p.view.set(null), FADE_MS)
}

/**
 * While an operation is open: Space plays / pauses, Left / Right step (in predict mode: ask, then
 * reveal), Enter finishes (Shift keeps the highlights as marks), Esc cancels. PageUp / PageDown
 * step too: what a presentation clicker sends, so the teacher can walk the room. Listened for on
 * the window in the capture phase, ahead of tldraw (whose arrows would nudge the selection, Space
 * pan and Esc deselect).
 */
function attachKeys(editor: Editor) {
	const win = editor.getContainer().ownerDocument.defaultView ?? window
	const onKeyDown = (e: KeyboardEvent) => {
		if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
		const forward = () => stepForward(editor, e.shiftKey)
		const back = () => stepBack(editor)
		const actions: Record<string, () => void> = {
			' ': () => togglePlayback(editor),
			ArrowRight: forward,
			ArrowLeft: back,
			PageDown: forward,
			PageUp: back,
			Enter: () => finishPlayback(editor, e.shiftKey),
			Escape: () => cancelPlayback(editor),
		}
		const action = actions[e.key]
		if (!action) return
		e.preventDefault()
		e.stopPropagation()
		swallowKeyUp(win, e.key)
		// Stepping keys repeat while held; the others act once.
		if (!e.repeat || action === forward || action === back) action()
	}
	win.addEventListener('keydown', onKeyDown, true)
	return () => win.removeEventListener('keydown', onKeyDown, true)
}
