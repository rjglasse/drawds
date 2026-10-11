import type { Editor, TLShape, TLShapeId } from 'tldraw'
import { usedCount, type ArrayShapeProps } from '../shapes/array/array-shape-types'
import type { ListShapeProps } from '../shapes/list/list-shape-types'
import { diffValues, type ArrayMove } from './array-moves'
import { diffList, type ListMove, type ListState } from './list-moves'
import type { TreeShapeProps } from '../shapes/tree/tree-shape-types'
import { diffTree, sameTree, shapeOf, treeArgs, type TreeMove } from './tree-moves'
import type { GraphShapeProps } from '../shapes/graph/graph-shape-types'
import { built, diffGraph, graphState, sameGraph, type GraphMove, type GraphState } from './graph-moves'
import type { HeapShapeProps } from '../shapes/heap/heap-shape-types'
import { diffHeap, heapArgs, sameHeap, type HeapMove, type HeapState } from './heap-moves'
import type { HashShapeProps } from '../shapes/hash/hash-shape-types'
import { diffHash, hashArgs, hashState, sameHash, tableOf, type HashMove, type HashState } from './hash-moves'

// The code log: every move on a structure, kept in its meta (`drawdsCode`) by a store side effect
// that runs inside the same change, so the move and its line are one undo step, redo brings the
// line back, and board files carry it. A change that brings its own log (an undo, a redo, a board
// loaded) passes through untouched: a teacher's edit never does. Logging always runs (entries are
// small); a code box beside the structure shows it when asked (`transcript.ts`).
//
// Each kind of structure says what its log follows (an array's values in use, a list's nodes) and
// how a change of it reads as moves. Typing in a cell rewrites its own line (a[0] = 4, then 42), the
// creating drag rewrites the line that creates it, and a grip dragged out and back logs only where
// it ended. Our own operations say what they did (`withMoves`): a sort played step by step is
// bubble_sort(a), not a.sort().

export const LOG_KEY = 'drawdsCode'

export type Move = ArrayMove | ListMove | TreeMove | GraphMove | HeapMove | HashMove

/** What a kind of structure's log follows, and how a change of it reads as moves. */
interface Tracked<S> {
	/** Its state as the log follows it. */
	state(props: object): S
	/** Whether a change could matter to the log (cheap: most changes are moves and styles). */
	touches(prev: object, next: object): boolean
	/** Whether the log follows this one at all (stacks and queues come later). */
	follows(props: object): boolean
	same(a: S, b: S): boolean
	diff(a: S, b: S): Move[]
	/** The line that starts a log. */
	start(name: string, state: S): Move
	/** With the state it has now (the creating drag). */
	restart(first: Move, state: S): Move
	/** The cell a typed change is in. */
	cell(a: S, b: S): string | undefined
	/** The tool state that is the creating drag. */
	sketching: string
	/** What can be told of an operation's parameters from what it did (a tree's key put in, node taken out). */
	args?(a: S, b: S): Record<string, string>
}

const arrays: Tracked<string[]> = {
	state: (props) => {
		const p = props as ArrayShapeProps
		return p.values.slice(0, usedCount(p))
	},
	touches: (a, b) => {
		const [p, n] = [a as ArrayShapeProps, b as ArrayShapeProps]
		return p.values !== n.values || p.used !== n.used || p.sizing !== n.sizing
	},
	follows: (props) => (props as ArrayShapeProps).kind === 'array',
	same: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
	diff: diffValues,
	start: (name, values) => ({ op: 'new', name, values }),
	restart: (first, values) => ({ ...(first as Extract<ArrayMove, { op: 'new' }>), values }),
	cell: (a, b) => {
		const i = a.findIndex((v, k) => v !== b[k])
		return i < 0 ? undefined : String(i)
	},
	sketching: 'array.sketching',
}

const lists: Tracked<ListState> = {
	state: (props) => {
		const { nodes, cycleTo } = props as ListShapeProps
		const at = cycleTo ? nodes.findIndex((n) => n.id === cycleTo) : -1
		return { ids: nodes.map((n) => n.id), values: nodes.map((n) => n.value), cycle: at < 0 ? null : at }
	},
	touches: (a, b) => {
		const [p, n] = [a as ListShapeProps, b as ListShapeProps]
		return p.nodes !== n.nodes || p.cycleTo !== n.cycleTo
	},
	follows: (props) => (props as ListShapeProps).kind === 'list',
	same: (a, b) => a.cycle === b.cycle && a.ids.length === b.ids.length && a.ids.every((id, i) => id === b.ids[i] && a.values[i] === b.values[i]),
	diff: diffList,
	start: (name, s) => ({ op: 'new', name, values: s.values }),
	restart: (first, s) => ({ ...(first as Extract<ListMove, { op: 'new' }>), values: s.values }),
	cell: (a, b) => a.ids.find((id, i) => b.ids[i] === id && a.values[i] !== b.values[i]),
	sketching: 'linked-list.sketching',
}

type TreeNodes = TreeShapeProps['nodes']

const trees: Tracked<TreeNodes> = {
	state: (props) => (props as TreeShapeProps).nodes,
	touches: (a, b) => (a as TreeShapeProps).nodes !== (b as TreeShapeProps).nodes,
	follows: () => true,
	same: sameTree,
	diff: diffTree,
	start: (name, nodes) => ({ op: 'new', name, tree: shapeOf(nodes) }),
	restart: (first, nodes) => ({ ...(first as Extract<TreeMove, { op: 'new' }>), tree: shapeOf(nodes) }),
	cell: (a, b) => a.find((n) => b.find((m) => m.id === n.id)?.value !== n.value)?.id,
	sketching: 'binary-tree.sketching',
	args: treeArgs,
}

const graphs: Tracked<GraphState> = {
	state: (props) => graphState(props as GraphShapeProps),
	touches: (a, b) => {
		const [p, n] = [a as GraphShapeProps, b as GraphShapeProps]
		return p.nodes !== n.nodes || p.edges !== n.edges
	},
	follows: () => true,
	same: sameGraph,
	diff: diffGraph,
	start: (name, g) => ({ op: 'new', name, ...built(g) }),
	restart: (first, g) => ({ ...(first as Extract<GraphMove, { op: 'new' }>), ...built(g) }),
	// A vertex's label, or an edge's weight.
	cell: (a, b) =>
		a.nodes.find((n) => b.nodes.find((m) => m.id === n.id && m.value !== n.value))?.id ??
		a.edges.find((e) => b.edges.find((f) => f.id === e.id && f.weight !== e.weight))?.id,
	sketching: 'graph.sketching',
}

const heaps: Tracked<HeapState> = {
	state: (props) => {
		const { heapType, values } = props as HeapShapeProps
		return { type: heapType, values }
	},
	touches: (a, b) => {
		const [p, n] = [a as HeapShapeProps, b as HeapShapeProps]
		return p.values !== n.values || p.heapType !== n.heapType
	},
	follows: () => true,
	same: sameHeap,
	diff: diffHeap,
	start: (name, h) => ({ op: 'new', name, ...h, values: [...h.values] }),
	restart: (first, h) => ({ ...(first as Extract<HeapMove, { op: 'new' }>), ...h, values: [...h.values] }),
	cell: (a, b) => {
		const i = a.values.findIndex((v, k) => v !== b.values[k])
		return i < 0 ? undefined : String(i)
	},
	sketching: 'heap.sketching',
	args: heapArgs,
}

const hashTables: Tracked<HashState> = {
	state: (props) => hashState(props as HashShapeProps),
	touches: (a, b) => {
		const [p, n] = [a as HashShapeProps, b as HashShapeProps]
		return p.buckets !== n.buckets || p.strategy !== n.strategy || p.code !== n.code || p.compress !== n.compress
	},
	follows: () => true,
	same: sameHash,
	diff: diffHash,
	start: (name, h) => ({ op: 'new', name, table: tableOf(h) }),
	restart: (first, h) => ({ ...(first as Extract<HashMove, { op: 'new' }>), table: tableOf(h) }),
	// The bucket and place in its chain (probing: the slot) of the key being typed.
	cell: (a, b) => {
		const i = a.buckets.findIndex((bucket, k) => bucket.length !== b.buckets[k]?.length || bucket.some((e, j) => e !== b.buckets[k][j]))
		if (i < 0) return undefined
		const at = a.buckets[i].findIndex((e, j) => e !== b.buckets[i][j])
		return `${i}:${at < 0 ? a.buckets[i].length : at}`
	},
	sketching: 'hash-table.sketching',
	args: hashArgs,
}

/** The structures with a log, by shape type. */
const TRACKED: Record<string, Tracked<unknown>> = {
	array: arrays as Tracked<unknown>,
	'linked-list': lists as Tracked<unknown>,
	'binary-tree': trees as Tracked<unknown>,
	graph: graphs as Tracked<unknown>,
	heap: heaps as Tracked<unknown>,
	'hash-table': hashTables as Tracked<unknown>,
}

/** Whether a shape's moves are logged. */
export const isLogged = (shape: TLShape) => !!TRACKED[shape.type]?.follows(shape.props)

/** A structure's log, if it has one yet. */
export const logOf = (shape: TLShape): Move[] | undefined => {
	const log = shape.meta[LOG_KEY]
	return Array.isArray(log) ? (log as unknown as Move[]) : undefined
}

/** The log a structure has, or would start with: it as it is, under a name of its own. */
export function logOrStart(editor: Editor, shape: TLShape): Move[] {
	const tracked = TRACKED[shape.type]
	if (!tracked) return []
	return logOf(shape) ?? [tracked.start(freshName(editor, shape.id), tracked.state(shape.props))]
}

/** The first of a, b, c... no other structure's log uses (then a2, b2...). */
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
type Intent = Move[] | { call: string; label: string }

const intents = new WeakMap<Editor, Map<TLShapeId, Intent>>()

/**
 * Run `change` (an update to shape `id`) saying what it does, so the log has that, not what a diff
 * would guess: [{ op: 'shuffle', values }] for a shuffle, a call for an operation played step by step
 * (its algorithm's code id and name; the diff kept as its effect).
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
	/** The log as it was before the run began, and the state then. */
	before: Move[]
	state: unknown
	cell?: string
}

const runs = new WeakMap<Editor, Map<TLShapeId, Run>>()

/** The editor's runs, by shape. */
function runsOf(editor: Editor) {
	let map = runs.get(editor)
	if (!map) runs.set(editor, (map = new Map()))
	return map
}

/** The run a change belongs to, if it is one that rewrites its lines. */
function runKind(editor: Editor, id: TLShapeId, tracked: Tracked<unknown>): Run['kind'] | undefined {
	if (editor.getEditingShapeId() === id) return 'typing'
	if (editor.isIn(tracked.sketching)) return 'sketching'
	if (editor.isIn('select.dragging_handle') && editor.getOnlySelectedShapeId() === id) return 'dragging'
	return undefined
}

/** The log after a change from `prev` to `next`, or undefined if it has nothing to add. */
export function logged(editor: Editor, prev: TLShape, next: TLShape): Move[] | undefined {
	const tracked = TRACKED[next.type]
	if (!tracked) return undefined
	const [from, to] = [tracked.state(prev.props), tracked.state(next.props)]
	const log = logOrStart(editor, prev)
	const intent = intents.get(editor)?.get(next.id)
	if (intent) {
		intents.get(editor)!.delete(next.id)
		if (Array.isArray(intent)) return [...log, ...intent]
		const args = tracked.args?.(from, to)
		return [...log, { op: 'call', algorithm: intent.call, label: intent.label, effect: tracked.diff(from, to), ...(args ? { args } : {}) } as Move]
	}
	if (tracked.same(from, to)) return undefined
	const map = runsOf(editor)
	const kind = runKind(editor, next.id, tracked)
	const cell = kind === 'typing' ? tracked.cell(from, to) : undefined
	let run = map.get(next.id)
	// A run goes on while the same kind of change does (typing: in the same cell); else one starts here.
	if (!run || run.kind !== kind || (kind === 'typing' && run.cell !== cell)) {
		run = kind ? { kind, before: log, state: from, cell } : undefined
		if (run) map.set(next.id, run)
		else map.delete(next.id)
	}
	if (!run) return [...log, ...tracked.diff(from, to)]
	// The creating drag: the line that creates the structure, with what it holds now.
	if (run.kind === 'sketching' && run.before.length === 1 && run.before[0].op === 'new') return [tracked.restart(run.before[0], to)]
	const moves = tracked.diff(run.state, to)
	return (run.kind === 'typing' && typedIntoNew(run.before, moves)) || [...run.before, ...moves]
}

/**
 * Typing straight into what was just put in (a + inserts a value and opens it for typing): the
 * insert with the typed value, not an insert then a set.
 */
function typedIntoNew(before: Move[], moves: Move[]): Move[] | undefined {
	const [set] = moves
	const last = before.at(-1)
	if (moves.length !== 1 || !last) return undefined
	// A graph's new vertex (the connect grip's, opened for its label): its label in the lines that brought it in.
	if (set.op === 'rename') {
		const { from, to } = set
		let k = before.length - 1
		while (k >= 0 && before[k].op === 'addEdge' && ((before[k] as { from: string }).from === from || (before[k] as { to: string }).to === from)) k--
		const added = before[k]
		if (k < 0 || added.op !== 'addVertex' || added.v !== from) return undefined
		const named = (x: string) => (x === from ? to : x)
		return [
			...before.slice(0, k),
			{ op: 'addVertex', v: to },
			...before.slice(k + 1).map((m) => (m.op === 'addEdge' ? { ...m, from: named(m.from), to: named(m.to) } : m)),
		]
	}
	// A hash table's keys go in by the + prompt, never typed into a new one.
	if (set.op !== 'set' || 'key' in set) return undefined
	const at = 'i' in set ? set.i : set.path
	const into = (last.op === 'insert' && last.i === at) || (last.op === 'insertAtHead' && at === 0) || (last.op === 'add' && last.path === at)
	return into ? [...before.slice(0, -1), { ...last, v: set.v } as Move] : undefined
}

/** Keep every structure's log as it changes. Returns the cleanup. */
export function startCodeLog(editor: Editor) {
	const create = editor.sideEffects.registerBeforeCreateHandler('shape', (shape) => {
		const tracked = TRACKED[shape.type]
		// Brought its own (undone, a board loaded, pasted): kept.
		if (!tracked || !tracked.follows(shape.props) || logOf(shape)) return shape
		const start = logOrStart(editor, shape)
		runsOf(editor).set(shape.id, { kind: 'sketching', before: start, state: tracked.state(shape.props) })
		return { ...shape, meta: { ...shape.meta, [LOG_KEY]: start as never } }
	})
	const change = editor.sideEffects.registerBeforeChangeHandler('shape', (prev, next) => {
		const tracked = TRACKED[next.type]
		if (!tracked) return next
		// Undo, redo, a board loaded: the change brings its log with it.
		if (prev.meta[LOG_KEY] !== next.meta[LOG_KEY]) return next
		// Most changes (moving it, a style, marks, pointers) leave what the log follows alone.
		if (!tracked.touches(prev.props, next.props) || !tracked.follows(next.props)) return next
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
