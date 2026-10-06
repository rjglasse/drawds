import type { Editor, TLShapeId } from 'tldraw'
import { playbackFor, type PlaybackView } from '../nodelink/playback'

// While an operation's steps are being exported, shapes draw the step on screen in their toSvg
// (highlights, the step's pointers, strips and caption) instead of just their own props.

export interface StepDrawing {
	/** Draw the step's caption under it (else it goes on the slide as text, say). */
	captions: boolean
}

const exporting = new WeakMap<Editor, StepDrawing>()

/** The step shape `id` should draw in an export (it is the open operation's, and steps are being exported). */
export function exportingStep(editor: Editor, id: TLShapeId): PlaybackView | undefined {
	return exporting.has(editor) ? (playbackFor(editor, id) ?? undefined) : undefined
}

/** How exported steps are drawn (while steps are being exported). */
export const stepDrawing = (editor: Editor): StepDrawing => exporting.get(editor) ?? { captions: true }

/** Run `f` (exports) with shapes drawing the step on screen. */
export async function whileExportingSteps<T>(editor: Editor, drawing: StepDrawing, f: () => Promise<T>): Promise<T> {
	exporting.set(editor, drawing)
	try {
		return await f()
	} finally {
		exporting.delete(editor)
	}
}
