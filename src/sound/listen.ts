import { react, type Editor, type TLShape } from 'tldraw'
import { compareKeys } from '../data/compare'
import { currentPlayback, playbackFor, type Frame } from '../nodelink/playback'
import type { Scene } from '../nodelink/scene'
import { giveUp, gone, pitches, sweep, tick, touchedKeys } from './notes'
import { isSoundOn, play, soundTuning } from './player'

// When drawds makes its sounds (once bogosort has been run): each step an operation shows, going
// forward, plays what it lights, swaps and moves; a sort ends on a run up its values (bogosort only if
// it got lucky, else three notes down). Moves made by hand play too: a value typed, cells or nodes
// drawn out, swapped, taken away (a low note), a mark (a tick). Nothing in the operations changes:
// this reads the play bar's view and the shapes.

/** A structure's values by element key, as a step shows it (or as it is): an array's by index, a node-link one's by node. */
function valuesOf(editor: Editor, shape: TLShape, frame?: Frame): Map<string, string> | undefined {
	const props = (frame?.props ? { ...shape.props, ...frame.props } : shape.props) as Record<string, unknown>
	if (shape.type === 'array') return new Map((props.values as string[]).map((v, i) => [String(i), v]))
	if (shape.type === 'matrix') return new Map((props.values as string[][]).flatMap((row, r) => row.map((v, c): [string, string] => [`${r},${c}`, v])))
	const util = editor.getShapeUtil(shape) as unknown as { getScene?(s: TLShape): Scene }
	if (!util.getScene) return undefined
	const scene = frame?.scene ?? util.getScene({ ...shape, props } as TLShape)
	return new Map(scene.nodes.filter((n) => n.kind !== 'label' && n.kind !== 'null' && !n.key.startsWith('#')).map((n) => [n.key, n.value]))
}

const sortedUp = (values: readonly string[]) => values.every((v, i) => i === 0 || compareKeys(values[i - 1], v) <= 0)

/** Make the sounds while they are on. Returns the cleanup. */
export function startSounds(editor: Editor) {
	// The step last played, so stepping back (or a step re-shown) stays quiet.
	let last: { frames?: readonly Frame[]; step: number } = { step: -1 }
	const steps = react('the steps, heard', () => {
		const view = currentPlayback(editor)
		if (!isSoundOn() || !view?.frame || view.fading || view.question !== undefined) return
		const same = view.frames === last.frames
		if (same && view.step <= last.step) {
			last = { frames: view.frames, step: view.step }
			return
		}
		last = { frames: view.frames, step: view.step }
		const shape = editor.getShape(view.shapeId)
		const values = shape && valuesOf(editor, shape, view.frame)
		if (!values) return
		const tuning = soundTuning()
		const pitch = pitches([...values.values()], tuning)
		const notes = touchedKeys(view.frame).flatMap((k) => (values.has(k) ? [pitch(values.get(k)!)] : []))
		play(notes.slice(0, 12))
		// A sort's last step: up through its values; bogosort giving up, three notes down.
		if (view.step !== view.steps - 1 || shape.type !== 'array' || !view.code || !/sort/.test(view.code)) return
		const all = [...values.values()]
		if (sortedUp(all)) play(sweep(all, tuning), { gap: 0.045, ahead: 2 })
		else if (view.code === 'bogosort') play(giveUp(tuning), { gap: 0.22, loud: 0.8, ahead: 1 })
	})
	const changed = editor.sideEffects.registerAfterChangeHandler('shape', (prev, next, source) => {
		// An operation open on it makes its own sounds, its result going in too.
		if (!isSoundOn() || source !== 'user' || prev.props === next.props || playbackFor(editor, next.id)) return
		const [before, after] = [valuesOf(editor, prev), valuesOf(editor, next)]
		if (!before || !after) return
		const tuning = soundTuning()
		const pitch = pitches([...after.values()], tuning)
		const notes = [...after].flatMap(([k, v]) => (before.get(k) !== v ? [pitch(v)] : []))
		if (notes.length) play(notes.slice(0, 10))
		else if ([...before.keys()].some((k) => !after.has(k))) play([gone(tuning)])
		else if ((prev.props as { marks?: unknown }).marks !== (next.props as { marks?: unknown }).marks) play([tick(tuning)], { loud: 0.4, bass: false })
	})
	const created = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (!isSoundOn() || source !== 'user') return
		const values = valuesOf(editor, shape)
		if (!values?.size) return
		const pitch = pitches([...values.values()], soundTuning())
		play([...values.values()].slice(0, 6).map(pitch))
	})
	return () => {
		steps()
		changed()
		created()
	}
}
