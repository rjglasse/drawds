import { atom, type Atom, type Editor, type TLShapeId, type VecLike } from 'tldraw'
import type { Scene } from '../../nodelink/scene'

/** Handle id of a node's connect grip: drag it to another node, or to empty space. */
const PREFIX = 'connect:'
export const connectHandleId = (nodeId: string) => PREFIX + nodeId
export function nodeOfConnectHandle(id: string): string | undefined {
	return id.startsWith(PREFIX) ? id.slice(PREFIX.length) : undefined
}

/** Which end of an edge: its tail (from) or its head (to). */
export type EdgeEnd = 'from' | 'to'

/** Handle id of an edge's end grip: drag it to another node to re-wire that end. */
const REWIRE = 'rewire:'
export const rewireHandleId = (edgeId: string, end: EdgeEnd) => `${REWIRE}${edgeId}:${end}`
export function edgeOfRewireHandle(id: string): { edge: string; end: EdgeEnd } | undefined {
	if (!id.startsWith(REWIRE)) return undefined
	const rest = id.slice(REWIRE.length)
	const at = rest.lastIndexOf(':')
	const end = rest.slice(at + 1)
	return end === 'from' || end === 'to' ? { edge: rest.slice(0, at), end } : undefined
}

/**
 * Where an edge's ends are grabbed: `along` from its tail, and `along` plus `head` (its arrowhead)
 * back from its tip, on its route; undefined for an edge too short to hold both apart.
 */
export function edgeEndGrips(points: readonly VecLike[], along: number, head = 0): { from: VecLike; to: VecLike } | undefined {
	const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
	const total = lengths.reduce((a, b) => a + b, 0)
	if (total < 2 * along + head + along) return undefined
	const at = (distance: number): VecLike => {
		let left = distance
		for (const [i, length] of lengths.entries()) {
			if (left <= length) {
				const t = length ? left / length : 0
				return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t }
			}
			left -= length
		}
		return points[points.length - 1]
	}
	return { from: at(along), to: at(total - along - head) }
}

/** Where a connect drag would end: on another node, or a new node at the pointer. */
export type ConnectTarget = { kind: 'node'; id: string } | { kind: 'new' }

/** A connect grip being dragged: drawn as a dashed edge from `from` to the pointer. */
export interface ConnectDrag {
	shapeId: TLShapeId
	/** The node the edge comes from: re-wiring, the end that stays. */
	from: string
	/** Re-wiring an edge's end (dragging its head or tail) rather than making a new edge. */
	rewire?: { edge: string; end: EdgeEnd }
	/** Pointer, in shape space. */
	at: VecLike
	target: ConnectTarget | undefined
}

const states = new WeakMap<Editor, Atom<ConnectDrag | null>>()

export function connectState(editor: Editor): Atom<ConnectDrag | null> {
	let state = states.get(editor)
	if (!state) {
		state = atom('graph connect drag', null)
		states.set(editor, state)
	}
	return state
}

/**
 * What dropping a connect drag from `from` at `at` would do: connect to the node under the pointer
 * (a little outside its rim counts), or make a new node there if it has room. Nothing over the
 * source node, or too close to a node to fit a new one.
 */
export function connectTarget(scene: Scene, from: string, at: VecLike): ConnectTarget | undefined {
	let nearest: { id: string; d: number; r: number } | undefined
	for (const n of scene.nodes) {
		const d = Math.hypot(at.x - n.x, at.y - n.y)
		if (!nearest || d - n.w / 2 < nearest.d - nearest.r) nearest = { id: n.key, d, r: n.w / 2 }
	}
	if (!nearest) return { kind: 'new' }
	if (nearest.d <= nearest.r * 1.25) return nearest.id === from ? undefined : { kind: 'node', id: nearest.id }
	// A new node is a cell across: keep it clear of the others.
	return nearest.d >= nearest.r * 2.4 ? { kind: 'new' } : undefined
}
