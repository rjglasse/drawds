import { atom, react, type Atom, type Editor, type TLShape, type TLShapeId, type TLShapePartial } from 'tldraw'
import type { MarkColor, Marks } from '../cells/marks'
import type { Pointer } from '../pointers/pointers'
import type { Scene } from './scene'
import { isTyping, swallowKeyUp } from '../controls/keys'

/** A row of values shown under the structure while an operation runs (a queue, a stack, an output). */
export interface Strip {
	title: string
	items: string[]
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
	/**
	 * The shape just before and after the result went in. Steps shown afterwards undo the move it
	 * made (a list's new head moves the shape's origin back), so they stay where they were.
	 */
	committed?: { before: TLShape; after: TLShape }
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
	step: number
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
	}: {
		shapeId: TLShapeId
		label: string
		frames: Frame[]
		final?: TLShapePartial
		finalFlash?: Marks
		keep?: boolean
		/** Merge highlights into the final update as marks (used when `keep`). */
		withMarks?(update: TLShapePartial | undefined, marks: Marks): TLShapePartial
	}
) {
	const p = player(editor)
	if (p.op) finishPlayback(editor)
	clearTimeout(p.timer)
	p.op = { shapeId, label, frames, final, finalFlash, keep, withMarks, step: 0, paused: !autoplayAtom.get(), done: false }
	if (!frames.length) {
		commit(editor, false)
		return dismiss(editor, false)
	}
	p.detach.push(attachKeys(editor))
	show(p)
	schedule(editor)
}

/** All the highlights of the last step, plus the final ones. */
function finalHighlights(op: Operation) {
	return { ...stateAt(op.frames, op.frames.length - 1).flash, ...op.finalFlash }
}

function show(p: Player, { back = false } = {}) {
	const op = p.op!
	const frame = op.frames[op.step]
	const last = op.step === op.frames.length - 1
	const state = stateAt(op.frames, op.step)
	// Stepping back replays the swaps of the step being undone, so the values arc home again. A
	// copied value has nowhere to go back to: the old one just reappears.
	const swaps = back ? op.frames[op.step + 1]?.swaps : frame.swaps
	const moves = back ? undefined : frame.moves
	p.view.set({
		shapeId: op.shapeId,
		frame: { ...frame, swaps, moves },
		frames: op.frames,
		...state,
		flash: op.done && last ? finalHighlights(op) : state.flash,
		fading: false,
		id: nextViewId++,
		step: op.step,
		steps: op.frames.length,
		paused: op.paused,
		done: op.done,
		committed: op.committed,
	})
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
	if (op.step < op.frames.length - 1) {
		op.step++
		show(p)
		return schedule(editor)
	}
	clearTimeout(p.timer)
	op.paused = true
	if (!op.done) commit(editor, keep)
	else show(p)
}

/** Show the previous step, and pause there. */
export function stepBack(editor: Editor) {
	const p = player(editor)
	const op = p.op
	if (!op) return
	clearTimeout(p.timer)
	op.paused = true
	if (op.step > 0) {
		op.step--
		show(p, { back: true })
	} else {
		show(p)
	}
}

/** Pause, or carry on playing from here; a finished operation at its end replays from the start. */
export function togglePlayback(editor: Editor) {
	const p = player(editor)
	const op = p.op
	if (!op) return
	if (op.done && op.paused && op.step === op.frames.length - 1) op.step = 0
	op.paused = !op.paused
	show(p)
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
	close(p)
	p.view.set(null)
}

function close(p: Player) {
	p.detach.forEach((f) => f())
	p.detach = []
	p.op = undefined
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
		const before = editor.getShape(op.shapeId)
		editor.markHistoryStoppingPoint(op.label)
		editor.updateShape(update)
		const after = editor.getShape(op.shapeId)
		if (before && after) op.committed = { before, after }
	}
	op.done = true
	op.paused = true
	op.step = op.frames.length - 1
	show(p)
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
	close(p)
	const all = finalHighlights(op)
	if (keep && op.withMarks) {
		editor.markHistoryStoppingPoint('keep highlights')
		editor.updateShape(op.withMarks(op.final, all))
	}
	if (keep || op.keep) {
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
 * While an operation is open: Space plays / pauses, Left / Right step, Enter finishes (Shift keeps
 * the highlights as marks), Esc cancels. Listened for on the window in the capture phase, ahead of
 * tldraw (whose arrows would nudge the selection, Space pan and Esc deselect).
 */
function attachKeys(editor: Editor) {
	const win = editor.getContainer().ownerDocument.defaultView ?? window
	const onKeyDown = (e: KeyboardEvent) => {
		if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
		const actions: Record<string, () => void> = {
			' ': () => togglePlayback(editor),
			ArrowRight: () => stepForward(editor, e.shiftKey),
			ArrowLeft: () => stepBack(editor),
			Enter: () => finishPlayback(editor, e.shiftKey),
			Escape: () => cancelPlayback(editor),
		}
		const action = actions[e.key]
		if (!action) return
		e.preventDefault()
		e.stopPropagation()
		swallowKeyUp(win, e.key)
		if (!e.repeat || e.key.startsWith('Arrow')) action()
	}
	win.addEventListener('keydown', onKeyDown, true)
	return () => win.removeEventListener('keydown', onKeyDown, true)
}
