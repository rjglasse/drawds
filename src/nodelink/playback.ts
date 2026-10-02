import { atom, type Atom, type Editor, type TLShapeId, type TLShapePartial } from 'tldraw'
import type { MarkColor, Marks } from '../cells/marks'

/** A queue or stack shown under the structure while an operation runs (BFS's queue, DFS's stack). */
export interface Strip {
	title: string
	items: string[]
}

/** One step of an animated operation. */
export interface Frame {
	/** Props to show instead of the shape's own: the state at this step. */
	props?: Record<string, unknown>
	/** Node keys whose values just swapped: their values arc between the two nodes. */
	swaps?: [string, string][]
	/**
	 * Highlights to set at this step, on nodes or edges (`edge:<key>`). They accumulate across
	 * steps; null clears one again.
	 */
	flash?: Record<string, MarkColor | null>
	/** Small labels beside nodes, such as discovery order. They accumulate. */
	badges?: Record<string, string>
	/** The queue or stack from this step on. */
	strip?: Strip
	/** One line saying what this step does, shown in the play bar. */
	caption?: string
}

/** What step `step` shows once the steps before it have had their say. */
export interface StepState {
	flash: Marks
	badges: Record<string, string>
	strip?: Strip
}

export function stateAt(frames: readonly Frame[], step: number): StepState {
	const flash: Marks = {}
	const badges: Record<string, string> = {}
	let strip: Strip | undefined
	for (const frame of frames.slice(0, step + 1)) {
		for (const [key, color] of Object.entries(frame.flash ?? {})) {
			if (color === null) delete flash[key]
			else flash[key] = color
		}
		Object.assign(badges, frame.badges)
		if (frame.strip) strip = frame.strip
	}
	return { flash, badges, strip }
}

/** What the shape should draw right now. */
export interface PlaybackView extends StepState {
	shapeId: TLShapeId
	/** The current frame, until the operation commits. */
	frame?: Frame
	/** After the commit, the highlights fade out. */
	fading: boolean
	/** Changes on every step shown, so animations restart. */
	id: number
	/** While the operation is open: the step shown (from 0), how many there are, whether it waits. */
	step: number
	steps: number
	paused: boolean
}

/** Time per frame, and how long highlights take to fade after an operation. */
export const STEP_MS = 420
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
}

interface Player {
	view: Atom<PlaybackView | null>
	op?: Operation
	timer?: ReturnType<typeof setTimeout>
	detachKeys?: () => void
}

const players = new WeakMap<Editor, Player>()
let nextViewId = 1

function player(editor: Editor): Player {
	let p = players.get(editor)
	if (!p) {
		p = { view: atom('playback', null) }
		players.set(editor, p)
	}
	return p
}

// Step-by-step mode: operations open paused on their first step. A per-browser preference.

const STEP_BY_STEP_KEY = 'drawds:step-by-step'

function readStepByStep() {
	try {
		return globalThis.localStorage?.getItem(STEP_BY_STEP_KEY) === 'on'
	} catch {
		return false
	}
}

const stepByStepAtom = atom('step by step', readStepByStep())

/** Whether operations open paused. Reactive. */
export const isStepByStep = () => stepByStepAtom.get()

export function setStepByStep(editor: Editor, on: boolean) {
	stepByStepAtom.set(on)
	try {
		globalThis.localStorage?.setItem(STEP_BY_STEP_KEY, on ? 'on' : 'off')
	} catch {
		// Storage can be unavailable (private windows); the setting then lasts for this page.
	}
	const op = player(editor).op
	if (op && op.paused !== on) togglePlayback(editor)
}

/** The animation state for a shape, if it is playing one. Reactive. */
export function playbackFor(editor: Editor, shapeId: TLShapeId): PlaybackView | undefined {
	const view = player(editor).view.get()
	return view?.shapeId === shapeId ? view : undefined
}

/**
 * Play an operation's frames, then apply `final` (one undo step, named `label`). The teacher can
 * pause, step back and forth, finish or cancel it on the way (see the play bar and `keys`).
 * Highlights accumulate across frames plus `finalFlash`, then fade; with `keep` they become marks
 * instead (`withMarks` merges them into the final update).
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
	if (p.op) commit(editor, false)
	clearTimeout(p.timer)
	p.op = { shapeId, label, frames, final, finalFlash, keep, withMarks, step: 0, paused: stepByStepAtom.get() }
	if (!frames.length) return commit(editor, false)
	p.detachKeys = attachKeys(editor)
	show(p)
	schedule(editor)
}

function show(p: Player, { back = false } = {}) {
	const op = p.op!
	const frame = op.frames[op.step]
	// Stepping back replays the swaps of the step being undone, so the values arc home again.
	const swaps = back ? op.frames[op.step + 1]?.swaps : frame.swaps
	p.view.set({
		shapeId: op.shapeId,
		frame: { ...frame, swaps },
		...stateAt(op.frames, op.step),
		fading: false,
		id: nextViewId++,
		step: op.step,
		steps: op.frames.length,
		paused: op.paused,
	})
}

function schedule(editor: Editor) {
	const p = player(editor)
	clearTimeout(p.timer)
	if (p.op && !p.op.paused) p.timer = setTimeout(() => stepForward(editor), STEP_MS)
}

/** Show the next step; past the last one, commit. `keep` (Shift) keeps the highlights as marks. */
export function stepForward(editor: Editor, keep = false) {
	const p = player(editor)
	const op = p.op
	if (!op) return
	if (op.step >= op.frames.length - 1) return commit(editor, keep)
	op.step++
	show(p)
	schedule(editor)
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

/** Pause, or carry on playing from here. */
export function togglePlayback(editor: Editor) {
	const p = player(editor)
	const op = p.op
	if (!op) return
	op.paused = !op.paused
	p.view.update((view) => view && { ...view, paused: op.paused })
	schedule(editor)
}

/** Jump to the result and commit it. */
export function finishPlayback(editor: Editor, keep = false) {
	if (player(editor).op) commit(editor, keep)
}

/** Abandon the operation: the shape stays as it was. */
export function cancelPlayback(editor: Editor) {
	const p = player(editor)
	if (!p.op) return
	clearTimeout(p.timer)
	p.detachKeys?.()
	p.op = undefined
	p.view.set(null)
}

function commit(editor: Editor, keepNow: boolean) {
	const p = player(editor)
	const op = p.op
	if (!op) return
	clearTimeout(p.timer)
	p.detachKeys?.()
	p.detachKeys = undefined
	p.op = undefined
	const last = stateAt(op.frames, op.frames.length - 1)
	const all = { ...last.flash, ...op.finalFlash }
	const keep = op.keep || keepNow
	const update = keep && op.withMarks ? op.withMarks(op.final, all) : op.final
	if (update) {
		editor.markHistoryStoppingPoint(op.label)
		editor.updateShape(update)
	}
	if (keep) {
		p.view.set(null)
		return
	}
	p.view.set({
		shapeId: op.shapeId,
		flash: all,
		badges: last.badges,
		fading: true,
		id: nextViewId++,
		step: 0,
		steps: 0,
		paused: false,
	})
	p.timer = setTimeout(() => p.view.set(null), FADE_MS)
}

/** Whether `target` takes typing (keys there belong to it, not to the play bar). */
function isTyping(target: EventTarget | null) {
	const el = target as HTMLElement | null
	return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
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
		if (!e.repeat || e.key.startsWith('Arrow')) action()
	}
	const onKeyUp = (e: KeyboardEvent) => {
		if (e.key === ' ' && !isTyping(e.target)) e.stopPropagation()
	}
	win.addEventListener('keydown', onKeyDown, true)
	win.addEventListener('keyup', onKeyUp, true)
	return () => {
		win.removeEventListener('keydown', onKeyDown, true)
		win.removeEventListener('keyup', onKeyUp, true)
	}
}
