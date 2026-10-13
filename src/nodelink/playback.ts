import { atom, react, type Atom, type Editor, type TLBinding, type TLBindingId, type TLShape, type TLShapeId, type TLShapePartial } from 'tldraw'
import type { Marks } from '../cells/marks'
import { isTyping, swallowKeyUp } from '../controls/keys'
import { DEFAULT_QUESTION, shownFrame, stateAt, stepFrom, type Frame, type Position, type StepState } from './frame'
import { autoplay, predict, speed, SPEEDS } from './prefs'
import { fitRoom, roomOf } from './room'

// Operations played step by step: the controller (open, step, commit, close) and the play bar's state.
// An operation's frames and the pure stepping are in frame.ts, the room its steps need in room.ts, the
// bar's settings in prefs.ts; all of it is imported from here.
export * from './frame'
export * from './room'

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
	/** Other shapes its steps draw, hidden meanwhile (`isCovered`). */
	covers?: TLShapeId[]
	/** Shapes its result made (a general tree's binary tree beside it): the bar keeps clear of them too. */
	made?: TLShapeId[]
	/**
	 * The shape just before and after the result went in. Steps shown afterwards undo the move it
	 * made (a list's new head moves the shape's origin back), so they stay where they were.
	 */
	committed?: { before: TLShape; after: TLShape }
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
	/** What there was once it was set up, if Esc has something to take back: what was added since stays. */
	present?: Present
	onClose?(): void
	/** Played again from a record (the lesson log): not recorded, and its result stays out of the undo history. */
	replay: boolean
	code?: string
	/** Its algorithm's arguments, where what it did can't tell them (union(a, b)). */
	args?: Record<string, string>
	/** Other shapes its steps draw (a list merged in), hidden while it is open. */
	covers?: TLShapeId[]
	/** More changes in its result's undo step (the list merged in deleted); the shapes it made, if any. */
	onCommit?(): TLShapeId[] | void
	/** Shapes its result made (the array a merge fills): hidden while a step before the last shows. */
	made?: TLShapeId[]
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
/**
 * What other parts of drawds do as an operation opens and as its result goes in, without the controller
 * knowing them (registered as the app mounts, `addPlaybackHooks`): a code box following the structure
 * shows the operation's code (`code/follow.ts`; what it returns puts the old code back if it is
 * cancelled); the code beside the structure logs the result as a call of its algorithm (`transcript/log.ts`).
 */
export interface PlaybackHooks {
	opened?(editor: Editor, shapeId: TLShapeId, code: string): (() => void) | undefined
	committing?(editor: Editor, op: { shapeId: TLShapeId; code: string; label: string; args?: Record<string, string> }, apply: () => void): void
}

const hooks = new WeakMap<Editor, PlaybackHooks>()

/** Add hooks (one of each kind per editor). Returns what takes them away. */
export function addPlaybackHooks(editor: Editor, add: PlaybackHooks) {
	hooks.set(editor, { ...hooks.get(editor), ...add })
	return () => {
		const now = { ...hooks.get(editor) }
		for (const key of Object.keys(add) as (keyof PlaybackHooks)[]) delete now[key]
		hooks.set(editor, now)
	}
}

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

/** Whether operations play as soon as they start. Reactive. */
export const isAutoplay = () => autoplay.get()

/** Whether steps are asked about before they are shown. Reactive. */
export const isPredicting = () => predict.get()

export function setPredict(editor: Editor, on: boolean) {
	predict.set(on)
	// Switched off mid-question: show the answer. Switched on: the next step asks.
	const p = player(editor)
	if (p.op?.asking && !on) go(editor, { step: p.op.step, asking: false })
}

/**
 * Whether step `step` is asked about first: predict mode, stepping by hand, the result not in yet,
 * and something to guess.
 */
const asks = (op: Operation) => (step: number) => predict.get() && op.paused && !op.done && op.frames[step]?.ask !== false

/** The playing speed (1 = STEP_MS a step). Reactive. */
export const playbackSpeed = () => speed.get()

export { SPEEDS }

/** The next speed up, wrapping round to the slowest. */
export function cycleSpeed() {
	speed.set(SPEEDS[(SPEEDS.indexOf(speed.get() as (typeof SPEEDS)[number]) + 1) % SPEEDS.length])
}

/**
 * How long a step's own animation (values arcing, a slide) may take: its full `ms` when stepping
 * by hand, but no longer than most of a step while playing fast. Reactive.
 */
export function animationMs(ms: number, view: PlaybackView | null | undefined) {
	return view && !view.paused && !view.fading ? Math.min(ms, (STEP_MS / speed.get()) * 0.85) : ms
}

export function setAutoplay(editor: Editor, on: boolean) {
	autoplay.set(on)
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

/** Whether an open operation's steps draw this shape (a list being merged in): it isn't drawn itself meanwhile. Reactive. */
/** The highlights the open operation's step puts on this shape's cells (it is merged in), if any. Reactive. */
export function otherMarks(editor: Editor, shapeId: TLShapeId): Marks | undefined {
	const view = player(editor).view.get()
	return view && !view.fading && view.shapeId !== shapeId ? view.frame?.others?.[shapeId] : undefined
}

export function isCovered(editor: Editor, shapeId: TLShapeId): boolean {
	const view = player(editor).view.get()
	return !!view?.covers?.includes(shapeId) && !view.fading
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
		args,
		covers,
		onCommit,
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
		/** The arguments it is called with, for the code beside the structure, where what it did can't tell them. */
		args?: Record<string, string>
		/** Other shapes its steps draw (a list being merged in): hidden while it is open. */
		covers?: TLShapeId[]
		/**
		 * More changes in its result's undo step (the list merged in deleted); not for a replay. It returns
		 * the shapes it made (the array a merge fills), hidden while a step before the last shows (stepping
		 * back, the bar's replay), so the steps don't draw over them.
		 */
		onCommit?(): TLShapeId[] | void
	}
) {
	const p = player(editor)
	if (p.op) finishPlayback(editor)
	clearTimeout(p.timer)
	const paused = !autoplay.get()
	// A code box following the structure shows this algorithm's code (Esc puts back what it showed),
	// as the record of it keeps it.
	const takeBack = code && !replay && frames.length ? hooks.get(editor)?.opened?.(editor, shapeId, code) : undefined
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
		present: takeBack || onCancel ? presentNow(editor) : undefined,
		onClose,
		replay,
		code,
		args,
		covers,
		onCommit,
		shown: [],
		ended: ended || undefined,
		step: 0,
		asking: paused && predict.get() && frames[0]?.ask !== false,
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
		// What the result made shows at its last step, not before.
		covers: [...(op.covers ?? []), ...(last ? [] : (op.made ?? []))],
		made: op.made,
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
	if (p.op && !p.op.paused) p.timer = setTimeout(() => stepForward(editor), STEP_MS / speed.get())
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
	if (op.onCancel) keepingWhatWasAdded(editor, op.present, op.onCancel)
}

/** The shapes and bindings on the board. */
interface Present {
	shapes: ReadonlySet<TLShapeId>
	bindings: ReadonlySet<TLBindingId>
}

const presentNow = (editor: Editor): Present => ({
	shapes: new Set(editor.store.query.ids('shape').get()),
	bindings: new Set(editor.store.query.ids('binding').get()),
})

/**
 * Take back what an operation set up (`takeBack`: undoing to before a view, a recursion tree or code
 * it opened) but keep what the teacher added while it was open, which undoing that far takes too: a
 * code box opened with the play bar's </>, a pen stroke, an arrow drawn to the structure. They are
 * put back, an undo step of their own.
 */
function keepingWhatWasAdded(editor: Editor, present: Present | undefined, takeBack: () => void) {
	const now = present && presentNow(editor)
	const shapes = now ? [...now.shapes].filter((id) => !present.shapes.has(id)).map((id) => editor.getShape(id)!) : []
	const bindings = now ? [...now.bindings].filter((id) => !present.bindings.has(id)).map((id) => editor.getBinding(id)!) : []
	takeBack()
	const lost = shapes.filter((s) => !editor.getShape(s.id))
	const unbound = bindings.filter((b) => !editor.getBinding(b.id))
	if (!lost.length && !unbound.length) return
	// Parents first (a stroke drawn inside a frame drawn meanwhile).
	const depth = (s: TLShape): number => {
		const parent = lost.find((p) => p.id === s.parentId)
		return parent ? depth(parent) + 1 : 0
	}
	// And in the order they were stacked (the store's order is not theirs).
	const order = (a: TLShape, b: TLShape) => depth(a) - depth(b) || (a.index < b.index ? -1 : a.index > b.index ? 1 : 0)
	editor.markHistoryStoppingPoint('keep what was added')
	editor.run(() => {
		editor.createShapes([...lost].sort(order))
		editor.createBindings(unbound as TLBinding[])
	})
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
			// The code beside it logs the algorithm (bubble_sort(a)), not what a diff would guess (a.sort()).
			const committing = hooks.get(editor)?.committing
			if (op.code && committing) committing(editor, { shapeId: op.shapeId, code: op.code, label: op.label, args: op.args }, () => editor.updateShape(update))
			else editor.updateShape(update)
			const made = op.onCommit?.()
			if (made?.length) op.made = made
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
