import type { MarkColor } from '../../cells/marks'
import type { Frame } from '../../nodelink/playback'
import type { Scene, SceneEdge, SceneNode } from '../../nodelink/scene'
import { HEAD_KEY, NULL_KEY, NULL_PREV_KEY, TAIL_KEY, getListMetrics, listAxis, listScene } from './layout'
import {
	CHANGED,
	FOUND,
	HEAD_EDGE,
	LOOK,
	TAIL_EDGE,
	besideList,
	edgeMark,
	listOf,
	next,
	nodeOf,
	pointer,
	prevOf,
	retarget,
	roundLabel,
	type ListOperation,
	type ListProps,
} from './operations'

// A linked list as a stack (push and pop at the head, called top) and as a queue (enqueue at the
// rear, a tail pointer; dequeue at the front, the head), step by step, to set against the array
// versions: every operation is O(1), nothing walks and no value moves. Either may be empty: its top,
// or front and rear, point at null. A doubly linked one keeps its prev links up to date too.

const PEEK: MarkColor = 'blue'

/** A new node, drawn off the list's line beside `at` (the first node, or the null of an empty list). */
function freshNode(props: ListProps, key: string, value: string, at: { x: number; y: number }): SceneNode {
	const { v } = listOf(props)
	const m = getListMetrics(props.size, v.doubly)
	const node: SceneNode = {
		key,
		kind: 'list-node',
		x: at.x,
		y: at.y,
		w: m.nodeW,
		h: m.nodeH,
		value,
		pointer: { side: props.direction === 'left' ? 'left' : 'right', width: m.pointerW, ...(v.doubly ? { back: true } : {}) },
		editable: false,
		draggable: false,
	}
	return besideList(node, key, value, at, props)
}

/** Builds a step's scene as arrows are added and re-pointed; each step lights the arrow it changed. */
function stepper(props: ListProps, scene: Scene, frames: Frame[], pointers: () => Frame['pointers']) {
	let lit: string | undefined
	return {
		get scene() {
			return scene
		},
		add(edge: SceneEdge) {
			scene = { ...scene, edges: [...scene.edges, edge] }
		},
		point(to: Record<string, string>, bends?: Record<string, number>) {
			scene = retarget(scene, to, bends)
		},
		drop(key: string) {
			const node = nodeOf(scene, key)
			scene = { ...scene, nodes: scene.nodes.map((n) => (n.key === key ? besideList(node, key, node.value, node, props) : n)) }
		},
		step(caption: string, light?: string, color: MarkColor = CHANGED) {
			const flash: Record<string, MarkColor | null> = { ...(lit ? { [lit]: null } : {}), ...(light ? { [light]: color } : {}) }
			lit = light
			frames.push({ scene, pointers: pointers(), flash, caption })
		},
	}
}

/** Push `value`: node.next = top, then top = node. Onto an empty stack, node.next is null. */
export function pushOnto(props: ListProps, id: string, value: string): ListOperation {
	const { nodes } = props
	const { v, chain, arrows, name } = listOf(props)
	const base = listScene(props)
	const top = chain[0]
	const frames: Frame[] = []
	const s = stepper(props, { ...base, nodes: [...base.nodes, freshNode(props, id, value, nodeOf(base, top ?? NULL_KEY))] }, frames, () => [
		pointer('node', id),
	])
	s.step(`node = new Node(${value})`, id, FOUND)
	s.add({ key: next(id), from: id, to: top ?? NULL_KEY, directed: true, fromPointer: true, ...arrows })
	s.step(top ? `node.next = top: the new node points at ${name(top)}` : 'node.next = top: null, as the stack is empty', edgeMark(next(id)))
	if (top && v.doubly) {
		s.point({ [prevOf(top)]: id })
		s.step(`top.prev = node: ${name(top)} points back at ${value}`, edgeMark(prevOf(top)))
	}
	s.point({ [HEAD_EDGE]: id }, { [HEAD_EDGE]: roundLabel(s.scene, props, HEAD_KEY, top ?? NULL_KEY, id) })
	s.step(`top = node: ${value} is on top. O(1): nothing walks, nothing moves`, edgeMark(HEAD_EDGE))
	if (!top && v.tail) {
		s.point({ [TAIL_EDGE]: id }, { [TAIL_EDGE]: roundLabel(s.scene, props, TAIL_KEY, NULL_KEY, id) })
		s.step(`tail = node: ${value} is the only node, so the last too`, edgeMark(TAIL_EDGE))
	}
	return { frames, nodes: [{ id, value, dx: 0, dy: 0 }, ...nodes], finalFlash: { [id]: FOUND } }
}

/** Pop: v = top.value, then top = top.next; the old top drops out. An empty stack underflows. */
export function popFrom(props: ListProps): ListOperation {
	const { nodes } = props
	if (!nodes.length) return { frames: [{ caption: 'Pop: top is null, the stack is empty. Stack underflow' }] }
	return takeFirst(props, 'top', 'popped', (value) => `popped ${value}, the last value pushed`)
}

/** Enqueue `value` at the rear: rear.next = node, rear = node. Into an empty queue, front = rear = node. */
export function enqueueOnto(props: ListProps, id: string, value: string): ListOperation {
	const { nodes } = props
	const { v, lastId, arrows, name } = listOf(props)
	const base = listScene(props)
	const axis = listAxis(props.direction)
	const half = getListMetrics(props.size, v.doubly).step / 2
	const rear = nodes.length ? nodeOf(base, lastId) : undefined
	const at = rear ? { x: rear.x + axis.x * half, y: rear.y + axis.y * half } : nodeOf(base, NULL_KEY)
	const frames: Frame[] = []
	const s = stepper(props, { ...base, nodes: [...base.nodes, freshNode(props, id, value, at)] }, frames, () => [pointer('node', id)])
	s.add({ key: next(id), from: id, to: NULL_KEY, directed: true, fromPointer: true, ...arrows })
	s.step(`node = new Node(${value}): its next is null`, id, FOUND)
	if (!rear) {
		s.point({ [HEAD_EDGE]: id }, { [HEAD_EDGE]: roundLabel(s.scene, props, HEAD_KEY, NULL_KEY, id) })
		s.step(`rear is null, so the queue is empty: front = node`, edgeMark(HEAD_EDGE))
		s.point({ [TAIL_EDGE]: id }, { [TAIL_EDGE]: roundLabel(s.scene, props, TAIL_KEY, NULL_KEY, id) })
		s.step(`rear = node: ${value} is first and last in line`, edgeMark(TAIL_EDGE))
	} else {
		if (v.doubly) {
			s.add({ key: prevOf(id), from: id, to: lastId, directed: true, fromPointer: 'prev', ...arrows })
			s.step(`node.prev = rear: it points back at ${name(lastId)}`, edgeMark(prevOf(id)))
		}
		s.point({ [next(lastId)]: id })
		s.step(`rear.next = node: ${name(lastId)} points at ${value}`, edgeMark(next(lastId)))
		s.point({ [TAIL_EDGE]: id }, { [TAIL_EDGE]: roundLabel(s.scene, props, TAIL_KEY, lastId, id) })
		s.step(`rear = node: ${value} is last in line. O(1): the rear pointer saves walking to the end`, edgeMark(TAIL_EDGE))
	}
	return { frames, nodes: [...nodes, { id, value, dx: 0, dy: 0 }], finalFlash: { [id]: FOUND } }
}

/** Dequeue: v = front.value, front = front.next (and rear = null when that empties the queue). */
export function dequeueFrom(props: ListProps): ListOperation {
	if (!props.nodes.length) return { frames: [{ caption: 'Dequeue: front is null, the queue is empty' }] }
	return takeFirst(props, 'front', 'dequeued', (value) => `dequeued ${value}, the first in`)
}

/** Pop or dequeue: take the first node's value, move the head past it, and let it drop out. */
function takeFirst(props: ListProps, head: 'top' | 'front', taken: string, done: (value: string) => string): ListOperation {
	const { nodes } = props
	const { v, chain, name } = listOf(props)
	const [first, after] = [chain[0], chain[1] ?? NULL_KEY]
	const value = name(first)
	const frames: Frame[] = [{ flash: { [first]: LOOK }, strips: [{ title: taken, items: [value] }], caption: `v = ${head}.value = ${value}` }]
	const s = stepper(props, listScene(props), frames, () => [])
	s.point({ [HEAD_EDGE]: after })
	s.step(
		after === NULL_KEY
			? `${head} = ${head}.next: null, so the ${head === 'top' ? 'stack' : 'queue'} is empty now`
			: `${head} = ${head}.next: ${name(after)} is ${head === 'top' ? 'on top' : 'first in line'} now`,
		edgeMark(HEAD_EDGE)
	)
	if (v.doubly && after !== NULL_KEY) {
		s.point({ [prevOf(after)]: NULL_PREV_KEY })
		s.step(`${head}.prev = null: nothing comes before ${name(after)} now`, edgeMark(prevOf(after)))
	}
	if (v.tail && after === NULL_KEY) {
		const tail = v.names.tail
		s.point({ [TAIL_EDGE]: NULL_KEY })
		s.step(`${head} is null, so ${tail} = null too: else it would still point at ${value}, a node no longer in the list`, edgeMark(TAIL_EDGE))
	}
	s.drop(first)
	s.step(`Nothing points at ${value} any more: ${done(value)}. O(1)`)
	return { frames, nodes: nodes.slice(1) }
}

/** Peek at the top of a stack or the front of a queue: nothing changes. */
export function peekAt(props: ListProps): ListOperation {
	const { v, chain, name } = listOf(props)
	const head = v.names.head
	const what = v.kind === 'queue' ? 'queue' : 'stack'
	if (!chain.length) return { frames: [{ caption: `Peek: ${head} is null, the ${what} is empty: nothing to see` }] }
	const still = v.kind === 'queue' ? 'still first in line' : 'still on the stack'
	return { frames: [{ flash: { [chain[0]]: PEEK }, caption: `Peek: ${head}.value = ${name(chain[0])}, ${still}` }], finalFlash: { [chain[0]]: PEEK } }
}
