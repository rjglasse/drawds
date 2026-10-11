import type { Editor, TLShape, TLShapeId } from 'tldraw'
import { usedCount, type ArrayShapeProps } from '../shapes/array/array-shape-types'
import { diffValues, type ArrayMove } from './array-moves'

// The code log: every move on a structure, kept in its meta (`drawdsCode`) by a store side effect
// that runs inside the same change, so the move and its line are one undo step, redo brings the
// line back, and board files carry it. A change that brings its own log (an undo, a redo, a board
// loaded) passes through untouched: a teacher's edit never does. Logging always runs (entries are
// small); a code box beside the structure shows it when asked (`transcript.ts`).
//
// Arrays so far: their values in use. Typing in a cell rewrites its own line (a[0] = 4, then 42),
// the creating drag rewrites the line that creates it, and a grip dragged out and back logs only
// where it ended. Our own operations say what they did (`withMoves`): a sort played step by step is
// bubble_sort(a), not a.sort().

export const LOG_KEY = 'drawdsCode'

const ARRAY = 'array'

/** A structure's log, if it has one yet. */
export const logOf = (shape: TLShape): ArrayMove[] | undefined => {
	const log = shape.meta[LOG_KEY]
	return Array.isArray(log) ? (log as unknown as ArrayMove[]) : undefined
}

/** The values a transcript speaks of: an array's values in use (a fixed array's spare slots are not). */
export const trackedValues = (props: ArrayShapeProps) => props.values.slice(0, usedCount(props))

/** The log a structure has, or would start with: it as it is, under a name of its own. */
export function logOrStart(editor: Editor, shape: TLShape): ArrayMove[] {
	return logOf(shape) ?? [{ op: 'new', name: freshName(editor, shape.id), values: trackedValues(shape.props as ArrayShapeProps) }]
}

/** The first of a, b, c... no other array's log uses (then a2, b2...). */
function freshName(editor: Editor, id: TLShapeId): string {
	const taken = new Set(
		editor
			.getCurrentPageShapes()
			.filter((s) => s.id !== id)
			.flatMap((s) => {
				const first = logOf(s)?.[0]
				return first?.op === 'new' ? [first.name] : []
			})
	)
	for (let round = 1; ; round++)
		for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
			const name = round === 1 ? letter : `${letter}${round}`
			if (!taken.has(name)) return name
		}
}

/** What the change about to happen to a shape did, told by the code making it. */
type Intent = ArrayMove[] | { call: string; label: string }

const intents = new WeakMap<Editor, Map<TLShapeId, Intent>>()

/**
 * Run `change` (an update to shape `id`) saying what it does, so the log has that, not what a diff
 * of its values would guess: [{ op: 'shuffle', values }] for a shuffle, a call for an operation played
 * step by step (its algorithm's code id and name; the diff kept as its effect).
 */
export function withMoves<T>(editor: Editor, id: TLShapeId, intent: Intent, change: () => T): T {
	let map = intents.get(editor)
	if (!map) intents.set(editor, (map = new Map()))
	map.set(id, intent)
	try {
		return change()
	} finally {
		map.delete(id)
	}
}

/** A run of changes that rewrites its own lines: typing in one cell, the creating drag, a grip dragged. */
interface Run {
	kind: 'typing' | 'sketching' | 'dragging'
	/** The log as it was before the run began, and (dragging) the values then. */
	before: ArrayMove[]
	values: string[]
	cell?: number
}

const runs = new WeakMap<Editor, Map<TLShapeId, Run>>()

/** The editor's runs, by shape. */
function runsOf(editor: Editor) {
	let map = runs.get(editor)
	if (!map) runs.set(editor, (map = new Map()))
	return map
}

/** The run a change belongs to, if it is one that rewrites its lines. */
function runKind(editor: Editor, id: TLShapeId): Run['kind'] | undefined {
	if (editor.getEditingShapeId() === id) return 'typing'
	if (editor.isIn('array.sketching')) return 'sketching'
	if (editor.isIn('select.dragging_handle') && editor.getOnlySelectedShapeId() === id) return 'dragging'
	return undefined
}

/** The log after a change from `prev` to `next`, or undefined if it has nothing to add. */
export function logged(editor: Editor, prev: TLShape, next: TLShape): ArrayMove[] | undefined {
	const [from, to] = [trackedValues(prev.props as ArrayShapeProps), trackedValues(next.props as ArrayShapeProps)]
	const log = logOrStart(editor, prev)
	const intent = intents.get(editor)?.get(next.id)
	if (intent) {
		intents.get(editor)!.delete(next.id)
		return [...log, ...(Array.isArray(intent) ? intent : [{ op: 'call' as const, algorithm: intent.call, label: intent.label, effect: diffValues(from, to) }])]
	}
	if (from.length === to.length && from.every((v, i) => v === to[i])) return undefined
	const map = runsOf(editor)
	const kind = runKind(editor, next.id)
	const cell = kind === 'typing' ? from.findIndex((v, i) => v !== to[i]) : undefined
	let run = map.get(next.id)
	// A run goes on while the same kind of change does (typing: in the same cell); else one starts here.
	if (!run || run.kind !== kind || (kind === 'typing' && run.cell !== cell)) {
		run = kind ? { kind, before: log, values: from, cell } : undefined
		if (run) map.set(next.id, run)
		else map.delete(next.id)
	}
	if (!run) return [...log, ...diffValues(from, to)]
	// The creating drag: the line that creates the array, with the values it has now.
	const first = run.before[0]
	if (run.kind === 'sketching' && run.before.length === 1 && first.op === 'new') return [{ ...first, values: to }]
	return [...run.before, ...diffValues(run.values, to)]
}

/** Keep every array's log as it changes. Returns the cleanup. */
export function startCodeLog(editor: Editor) {
	const create = editor.sideEffects.registerBeforeCreateHandler('shape', (shape) => {
		// Brought its own (undone, a board loaded, pasted): kept.
		if (shape.type !== ARRAY || logOf(shape)) return shape
		const start = logOrStart(editor, shape)
		runsOf(editor).set(shape.id, { kind: 'sketching', before: start, values: trackedValues(shape.props as ArrayShapeProps) })
		return { ...shape, meta: { ...shape.meta, [LOG_KEY]: start as never } }
	})
	const change = editor.sideEffects.registerBeforeChangeHandler('shape', (prev, next) => {
		if (next.type !== ARRAY) return next
		// Undo, redo, a board loaded: the change brings its log with it.
		if (prev.meta[LOG_KEY] !== next.meta[LOG_KEY]) return next
		// Most changes (moving it, a style, marks, pointers) leave the values alone: nothing to log.
		const [p, n] = [prev.props as ArrayShapeProps, next.props as ArrayShapeProps]
		if (p.values === n.values && p.used === n.used && p.sizing === n.sizing) return next
		// Stacks and queues come later.
		if (n.kind !== 'array') return next
		const log = logged(editor, prev, next)
		return log ? { ...next, meta: { ...next.meta, [LOG_KEY]: log as never } } : next
	})
	// A drag ends with the pointer: the next one is a run of its own (two swaps, not one shuffle).
	const ended = (info: { name: string }) => {
		if (info.name !== 'pointer_up') return
		const map = runs.get(editor)
		map?.forEach((run, id) => run.kind !== 'typing' && map.delete(id))
	}
	editor.on('event', ended)
	return () => {
		create()
		change()
		editor.off('event', ended)
	}
}
