import { atom, type Atom, type Editor, type TLShapeId, type TLShapePartial } from 'tldraw'
import type { Marks } from '../cells/marks'

/** One step of an animated operation. */
export interface Frame {
	/** Props to show instead of the shape's own: the state at this step. */
	props?: Record<string, unknown>
	/** Node keys whose values just swapped: their values arc between the two nodes. */
	swaps?: [string, string][]
	/** Highlights to add at this step (they accumulate). */
	flash?: Marks
}

/** What the shape should draw right now. */
export interface PlaybackView {
	shapeId: TLShapeId
	/** The current frame, until the operation commits. */
	frame?: Frame
	/** Highlights so far. */
	flash: Marks
	/** After the commit, the highlights fade out. */
	fading: boolean
	/** Changes every frame, so animations restart. */
	id: number
}

/** Time per frame, and how long highlights take to fade after an operation. */
export const STEP_MS = 420
export const FADE_MS = 2200

interface Player {
	view: Atom<PlaybackView | null>
	timer?: ReturnType<typeof setTimeout>
	/** Commits the operation in progress at once (when another starts). */
	finish?: () => void
}

const players = new WeakMap<Editor, Player>()

function player(editor: Editor): Player {
	let p = players.get(editor)
	if (!p) {
		p = { view: atom('playback', null) }
		players.set(editor, p)
	}
	return p
}

/** The animation state for a shape, if it is playing one. Reactive. */
export function playbackFor(editor: Editor, shapeId: TLShapeId): PlaybackView | undefined {
	const view = player(editor).view.get()
	return view?.shapeId === shapeId ? view : undefined
}

/**
 * Play an operation's frames, then apply `final` (one undo step, named `label`). Highlights
 * accumulate across frames plus `finalFlash`, then fade; with `keep` they become marks instead
 * (`withMarks` merges them into the final update).
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
	p.finish?.()
	clearTimeout(p.timer)

	let flash: Marks = {}
	let step = 0
	const id = Date.now()

	const commit = () => {
		p.finish = undefined
		const all = { ...flash, ...finalFlash }
		const update = keep && withMarks ? withMarks(final, all) : final
		if (update) {
			editor.markHistoryStoppingPoint(label)
			editor.updateShape(update)
		}
		if (keep) {
			p.view.set(null)
			return
		}
		p.view.set({ shapeId, flash: all, fading: true, id: id + frames.length + 1 })
		p.timer = setTimeout(() => p.view.set(null), FADE_MS)
	}

	const next = () => {
		if (step >= frames.length) return commit()
		const frame = frames[step]
		flash = { ...flash, ...frame.flash }
		p.view.set({ shapeId, frame, flash, fading: false, id: id + step })
		step++
		p.timer = setTimeout(next, STEP_MS)
	}

	p.finish = () => {
		clearTimeout(p.timer)
		step = frames.length
		commit()
	}
	next()
}
