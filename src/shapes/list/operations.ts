import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import { stateAt, type Frame, type Strip } from '../../nodelink/playback'
import { edgeCellKey, translateScene, type Scene, type SceneEdge, type SceneNode } from '../../nodelink/scene'
import type { Pointer } from '../../pointers/pointers'
import {
	HEAD_KEY,
	NULL_KEY,
	NULL_PREV_KEY,
	SENTINEL_KEY,
	TAIL_KEY,
	arrowStyle,
	chainKeys,
	getListMetrics,
	listAxis,
	listScene,
	listVariant,
	loopBack,
} from './layout'
import type { ListDirection, ListNode, ListShapeProps } from './list-shape-types'
import { anchorShift } from './ops'

// List operations, step by step: each step is a line of the code a teacher writes on the board
// (curr = curr.next, node.next = curr.next...), drawn as it happens: temporary pointers curr,
// prev and next slide along, arrows re-point (lit orange), new nodes appear beside the list.
// Each variant adds its own lines: a doubly linked list's prev links, a tail that moves, a
// circular list's last node that must keep pointing at the first, a sentinel that removes the
// special cases at the head.

export type ListProps = Pick<ListShapeProps, 'nodes' | 'direction' | 'size'> &
	Partial<Pick<ListShapeProps, 'links' | 'tail' | 'ends' | 'sentinel' | 'cycleTo' | 'kind' | 'showSize'>>

export const LOOK: MarkColor = 'orange'
export const FOUND: MarkColor = 'green'
export const GONE: MarkColor = 'red'
export const CHANGED: MarkColor = 'orange'
const VISITED: MarkColor = 'blue'

/** A null marker before the head, for pointers that start out null (reverse's prev). */
export const NULL_BEFORE_KEY = '#null-before'

export const next = (id: string) => `${id}->`
export const prevOf = (id: string) => `${id}<-`
export const HEAD_EDGE = `${HEAD_KEY}->`
export const TAIL_EDGE = `${TAIL_KEY}->`
export const pointer = (name: string, at: string): Pointer => ({ id: `#${name}`, name, at })
export const edgeMark = (key: string) => edgeCellKey(key)

/**
 * The code an operation shows for this list, if any: a plain singly linked list's (with a tail or
 * not); a doubly linked, circular or sentinel list, or one with a cycle, has its own lines, not written yet.
 */
export function plainCode(props: ListProps, base: string): string | undefined {
	const v = listVariant(props, props.nodes)
	return v.doubly || v.circular || v.sentinel || v.cycleTo ? undefined : `${base}${v.tail ? '-tail' : ''}`
}

/** What every operation needs to know about the list: its variant, its nodes in link order, names. */
export function listOf(props: ListProps) {
	const v = listVariant(props, props.nodes)
	const chain = chainKeys(props)
	const values = new Map(props.nodes.map((n) => [n.id, n.value]))
	// ('' for an empty stack or queue, which the list operations never get.)
	const lastId = props.nodes.at(-1)?.id ?? ''
	return {
		v,
		chain,
		lastId,
		/** Where the last node's next points: the first node (circular), the cycle's node, or null. */
		end: v.circular ? chain[0] : (v.cycleTo ?? NULL_KEY),
		name: (key: string) => (key === NULL_KEY || key === NULL_PREV_KEY ? 'null' : key === SENTINEL_KEY ? 'the sentinel' : values.get(key) ?? key),
		arrows: arrowStyle(props),
	}
}

/** The scene with arrows re-pointed, by edge key (`n3->`, `n3<-`, `#head->`...); `bends` curve them. */
export function retarget(scene: Scene, to: Record<string, string>, bends: Record<string, number> = {}): Scene {
	return {
		...scene,
		edges: scene.edges.map((e) => (to[e.key] === undefined ? e : { ...e, to: to[e.key], via: undefined, bend: bends[e.key] ?? e.bend })),
	}
}

export function nodeOf(scene: Scene, key: string) {
	return scene.nodes.find((n) => n.key === key)!
}

/** Off the list's line: below it, right of a vertical one (with the pointers; the labels are on the other side). */
const offLine = (direction: ListDirection) => (listAxis(direction).y === 0 ? { x: 0, y: 1 } : { x: 1, y: 0 })

/** A list node drawn `away` off the list's line, beside `at` (a new node, or one dropping out). */
export function besideList(template: SceneNode, key: string, value: string, at: { x: number; y: number }, props: ListProps): SceneNode {
	const side = offLine(props.direction)
	const away = getListMetrics(props.size, listVariant(props).doubly).step * 0.8
	return { ...template, key, value, x: at.x + side.x * away, y: at.y + side.y * away, editable: false, draggable: false, ghost: undefined }
}

/** A new node, drawn off the list's line beside `at` (the first node, or the null of an empty list). */
export function freshNode(props: ListProps, key: string, value: string, at: { x: number; y: number }): SceneNode {
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

/**
 * The bend that takes a label's arrow round the node under it (`around`) to a new node off the line,
 * just clear of it: the head's arrow curves back along the list, the tail's on along it, where
 * there is room.
 */
export function roundLabel(scene: Scene, props: ListProps, labelKey: string, around: string, to: string): number {
	const [label, node, target] = [labelKey, around, to].map((k) => nodeOf(scene, k))
	const axis = listAxis(props.direction)
	const d = { x: target.x - label.x, y: target.y - label.y }
	const len = Math.hypot(d.x, d.y) || 1
	// A positive bend curves the arrow to its left.
	const left = { x: d.y / len, y: -d.x / len }
	const way = labelKey === TAIL_KEY ? axis : { x: -axis.x, y: -axis.y }
	const sign = left.x * way.x + left.y * way.y >= 0 ? 1 : -1
	const n = { x: left.x * sign, y: left.y * sign }
	// Where the straight arrow passes nearest the node, and how far it must move to clear its box.
	const t = Math.min(0.9, Math.max(0.1, ((node.x - label.x) * d.x + (node.y - label.y) * d.y) / (len * len)))
	const p = { x: label.x + d.x * t, y: label.y + d.y * t }
	const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: node.x + (sx * node.w) / 2, y: node.y + (sy * node.h) / 2 })))
	const need = Math.max(...corners.map((c) => (c.x - p.x) * n.x + (c.y - p.y) * n.y)) + getListMetrics(props.size).gap * 0.3
	if (need <= 0) return 0
	// A quadratic curve is 2t(1 - t) of its bend (a share of its length) off the straight line at t.
	return (sign * need) / (2 * t * (1 - t) * len)
}

/**
 * Circular lists and lists with a cycle: in every step, arrows back along the list loop round it,
 * clear of the nodes drawn off the line (`floating`, with their place in the chain).
 */
function withLoops(frames: Frame[], props: ListProps, floating: Record<string, number>): Frame[] {
	const v = listVariant(props, props.nodes)
	if (!v.circular && !v.cycleTo) return frames
	return frames.map((f) => (f.scene ? { ...f, scene: loopBack(f.scene, props, floating) } : f))
}

/** Arrows that point back against the list's direction curve round, clear of the nodes they pass. */
const BACK_BEND = -0.35

export interface ListOperation {
	frames: Frame[]
	/** The list afterwards, if the operation changes it. */
	nodes?: ListNode[]
	direction?: ListDirection
	/** Highlights on the result. */
	finalFlash?: Record<string, MarkColor>
	/** Its code (an algorithm in `src/shapes/list/code.ts`), if it has some for this kind of list. */
	code?: string
}

/**
 * Find `target`: curr walks from the first value (after the sentinel, if any) comparing, until it
 * finds it, or reaches null, or (circular, or a cycle) comes back round to a node it has seen.
 */
// Predict mode: before each step the class guesses what the code does next. Walks ask whether curr
// has found it or where it goes; the assignments ask which line comes next (the order is the lesson).

const NEXT_LINE = 'Which line comes next?'

/** What forgetting the tail does (lecture 5's two named bugs): the steps as written, the list left broken. */
export const forgotTail = {
	/** First insert, head set but not tail. */
	insert: (value: string, tail: string) =>
		`Forgot ${tail} = node: ${value} is the only node, so ${tail} should point at it too, but it is still null. size == 1 needs head == ${tail}: a bad list, and the next append would follow null`,
	/** The only node deleted, tail left on it. */
	remove: (value: string, tail: string) =>
		`Forgot ${tail} = null: the list is empty, but ${tail} still points at ${value}, a node no longer in it. size == 0 needs ${tail} == null: a bad list`,
}


/** Frames with predict mode's questions: `first` before the first step, `rest` before the others. */
function asking(frames: Frame[], first: Frame['ask'], rest: Frame['ask'] = NEXT_LINE): Frame[] {
	return frames.map((frame, i) => ({ ...frame, ask: i === 0 ? first : rest }))
}

export function findInList(props: ListProps, target: string): ListOperation {
	const { nodes } = props
	const { v, name } = listOf(props)
	const frames: Frame[] = []
	const start = v.sentinel ? 'curr = head.next (past the sentinel)' : 'curr = head'
	// Lecture 5's indexOf, for a plain list (a sentinel or a way round would change the code).
	const code = !v.sentinel && !v.circular && !v.cycleTo ? 'list-find' : undefined
	// The code's variables: curr is a node (shown by its value), i its index.
	const vars = (curr: string, i: number) => ({ value: target, curr, i: String(i) })
	// The same question whatever the answer: found it, or on to the next node.
	const decide = (at: ListNode) => ({ ask: `curr is at ${at.value}: found ${target}, or where does curr go?`, askFocus: [at.id] })
	for (const [i, node] of nodes.entries()) {
		const how = i === 0 ? `${start} (${node.value})` : `${nodes[i - 1].value} ≠ ${target}, so curr = curr.next (${node.value})`
		frames.push({
			pointers: [pointer('curr', node.id)],
			flash: { [node.id]: LOOK, ...(i ? { [nodes[i - 1].id]: null } : {}) },
			caption: `${how}. Is it ${target}?`,
			counts: { 'nodes visited': i + 1 },
			vars: vars(node.value, i),
			line: i === 0 ? 'start' : 'next',
			...(i === 0 ? { ask: `Find ${target}: where does curr start?` } : decide(nodes[i - 1])),
		})
		if (node.value === target) {
			frames.push({
				pointers: [pointer('curr', node.id)],
				flash: { [node.id]: FOUND },
				caption: `Yes: ${target} is node ${i + 1} from the head`,
				counts: { 'nodes visited': i + 1 },
				vars: vars(node.value, i),
				line: 'found',
				...decide(node),
			})
			return { frames, finalFlash: { [node.id]: FOUND }, code }
		}
	}
	const last = nodes[nodes.length - 1]
	const after = `${last.value} ≠ ${target}, so curr = curr.next: `
	if (v.circular || v.cycleTo) {
		const back = v.circular ? (v.sentinel ? SENTINEL_KEY : nodes[0].id) : v.cycleTo!
		const why = v.circular ? `back at ${v.sentinel ? 'the sentinel' : 'the head'}` : `${name(back)} again, a node already seen: the list has a cycle`
		frames.push({ pointers: [pointer('curr', back)], flash: { [last.id]: null }, caption: `${after}${why}. ${target} is not in the list`, ...decide(last) })
		return { frames }
	}
	frames.push({
		pointers: [pointer('curr', NULL_KEY)],
		flash: { [last.id]: null },
		caption: `${after}null. ${target} is not in the list: all ${nodes.length} nodes visited`,
		counts: { 'nodes visited': nodes.length },
		vars: vars('null', nodes.length),
		line: 'missing',
		...decide(last),
	})
	return { frames, code }
}

/**
 * Insert `value` after node `afterId` (or, with no `afterId`, at the front): the new node appears
 * beside the list, then the assignments, in the order that keeps the rest of the list. A doubly
 * linked list also sets the two prev links; a tail moves to a new last node; a circular list's
 * last node points at a new head; with a sentinel, the front is just "after the sentinel".
 */
export function insertIntoList(
	props: ListProps,
	afterId: string | undefined,
	id: string,
	value: string,
	{ forgetTail = false }: { forgetTail?: boolean } = {}
): ListOperation {
	const { nodes } = props
	const { v, chain, lastId, end, name, arrows } = listOf(props)
	// With a sentinel there is always a node before: inserting at the front is inserting after it.
	const after = afterId ?? (v.sentinel ? SENTINEL_KEY : undefined)
	const base = listScene(props)
	const i = after === undefined ? -1 : chain.indexOf(after)
	const nextKey = after === undefined ? chain[0] : (chain[i + 1] ?? end)
	// Between curr and curr.next; after the last node of a circular list (or one with a cycle), curr.next
	// is back along the list, so just past curr.
	const axis = listAxis(props.direction)
	const half = getListMetrics(props.size, v.doubly).step / 2
	const at =
		after === undefined
			? nodeOf(base, chain[0] ?? NULL_KEY)
			: nextKey === NULL_KEY || chain.indexOf(nextKey) > i
				? { x: (nodeOf(base, after).x + nodeOf(base, nextKey).x) / 2, y: (nodeOf(base, after).y + nodeOf(base, nextKey).y) / 2 }
				: { x: nodeOf(base, after).x + axis.x * half, y: nodeOf(base, after).y + axis.y * half }
	// Beside the list's first node (or, the list empty, beside the null head points at).
	const fresh = nodes.length ? besideList(nodeOf(base, nodes[0].id), id, value, at, props) : freshNode(props, id, value, at)
	const edges: SceneEdge[] = []
	let scene = { ...base, nodes: [...base.nodes, fresh] }
	const add = (edge: SceneEdge) => {
		edges.push(edge)
		scene = { ...scene, edges: [...scene.edges, edge] }
	}
	const point = (to: Record<string, string>, bends?: Record<string, number>) => {
		scene = retarget(scene, to, bends)
	}
	const curr = after !== undefined ? [pointer('curr', after)] : []
	const frames: Frame[] = []
	// The code's variables: curr and node by their values.
	const vars = { value, node: value, ...(after !== undefined ? { curr: name(after) } : {}) }
	const step = (caption: string, flash: Record<string, MarkColor | null>, line?: string) =>
		frames.push({ scene, pointers: [...curr, pointer('node', id)], flash, caption, vars, ...(line ? { line } : {}) })
	let lit: string | undefined
	const light = (key: string) => {
		const flash: Record<string, MarkColor | null> = { ...(lit ? { [lit]: null } : {}), [key]: CHANGED }
		lit = key
		return flash
	}

	if (after !== undefined) {
		const where = after === SENTINEL_KEY ? 'curr = the sentinel: inserting at the front needs no special case' : `curr is at ${name(after)}: insert ${value} after it`
		frames.push({ pointers: curr, flash: { [after]: LOOK }, caption: where, line: 'call', vars: { value, curr: name(after) } })
	}
	step(`node = new Node(${value}): its next is null for now${v.doubly ? ', and its prev' : ''}`, { [id]: FOUND }, 'new')

	if (after !== undefined) {
		add({ key: next(id), from: id, to: nextKey, directed: true, fromPointer: true, ...arrows })
		const onto = nextKey === NULL_KEY ? 'null' : name(nextKey)
		step(`node.next = curr.next: the new node points at ${onto} too`, light(edgeMark(next(id))), 'link')
		if (v.doubly) {
			add({ key: prevOf(id), from: id, to: after, directed: true, fromPointer: 'prev', ...arrows })
			step(`node.prev = curr: it points back at ${name(after)}`, light(edgeMark(prevOf(id))))
			if (nextKey !== NULL_KEY) {
				point({ [prevOf(nextKey)]: id })
				step(`curr.next.prev = node: ${name(nextKey)} points back at ${value} now`, light(edgeMark(prevOf(nextKey))))
			}
		}
		point({ [next(after)]: id })
		step(
			`curr.next = node: ${name(after)} now points at ${value}. (The other way round, the rest of the list would be lost)`,
			light(edgeMark(next(after))),
			'point'
		)
		if (v.tail && after === lastId) {
			point({ [TAIL_EDGE]: id }, { [TAIL_EDGE]: roundLabel(scene, props, TAIL_KEY, after, id) })
			step(`tail = node: ${value} is the last node now`, light(edgeMark(TAIL_EDGE)), 'tail')
		}
	} else if (!chain.length) {
		// Lecture 5's empty list: head (and tail) point at null, and the first node is both ends.
		add({ key: next(id), from: id, to: NULL_KEY, directed: true, fromPointer: true, ...arrows })
		step('node.next = head: null, as the list is empty', light(edgeMark(next(id))), 'link')
		point({ [HEAD_EDGE]: id }, { [HEAD_EDGE]: roundLabel(scene, props, HEAD_KEY, NULL_KEY, id) })
		step(`head = node: ${value} is the first node now`, light(edgeMark(HEAD_EDGE)), 'point')
		if (v.tail && forgetTail) {
			// Lecture 5's first bug: head set, tail not. Shown, not kept.
			frames.push({ scene, pointers: [pointer('node', id)], flash: { [edgeMark(TAIL_EDGE)]: GONE, [TAIL_KEY]: GONE }, caption: forgotTail.insert(value, v.names.tail), ask: 'Head points at the new node: is the list right now?' })
			return { frames: withLoops(asking(frames, NEXT_LINE), props, { [id]: i + 0.5 }) }
		}
		if (v.tail) {
			point({ [TAIL_EDGE]: id }, { [TAIL_EDGE]: roundLabel(scene, props, TAIL_KEY, NULL_KEY, id) })
			step(`tail = node: ${value} is the last node too, the only one`, light(edgeMark(TAIL_EDGE)), 'tail')
		}
	} else {
		const head = chain[0]
		add({ key: next(id), from: id, to: head, directed: true, fromPointer: true, ...arrows })
		step(`node.next = head: the new node points at ${name(head)}`, light(edgeMark(next(id))), 'link')
		if (v.doubly) {
			point({ [prevOf(head)]: id })
			step(`head.prev = node: ${name(head)} points back at ${value}`, light(edgeMark(prevOf(head))))
		}
		if (v.circular) {
			point({ [next(lastId)]: id })
			step(`last.next = node: the last node, ${name(lastId)}, points at the new head`, light(edgeMark(next(lastId))))
			if (v.doubly) {
				add({ key: prevOf(id), from: id, to: lastId, directed: true, fromPointer: 'prev', ...arrows })
				step(`node.prev = last: round the circle, it points back at ${name(lastId)}`, light(edgeMark(prevOf(id))))
			}
		}
		point({ [HEAD_EDGE]: id }, { [HEAD_EDGE]: roundLabel(scene, props, HEAD_KEY, head, id) })
		step(`head = node: ${value} is the first node now`, light(edgeMark(HEAD_EDGE)), 'point')
	}
	const node: ListNode = { id, value, dx: 0, dy: 0 }
	const k = after === undefined || after === SENTINEL_KEY ? -1 : nodes.findIndex((n) => n.id === after)
	return {
		// Where curr is sets the scene; then which assignment comes next, every time.
		frames: withLoops(asking(frames, after === undefined ? NEXT_LINE : false), props, { [id]: i + 0.5 }),
		nodes: [...nodes.slice(0, k + 1), node, ...nodes.slice(k + 1)],
		finalFlash: { [id]: FOUND },
		code: plainCode(props, afterId === undefined ? 'list-insert-head' : 'list-insert'),
	}
}

/**
 * Delete node `id`: prev and curr walk to it, then prev.next = curr.next takes the arrow round it
 * and it drops out of the list; at the head, head = head.next (a circular list's last node then
 * points at the new head). A doubly linked list fixes the next node's prev too; a tail on the
 * deleted node moves back; with a sentinel even the first value has a prev, so no special case.
 */
export function deleteFromList(props: ListProps, id: string, { forgetTail = false }: { forgetTail?: boolean } = {}): ListOperation {
	const { nodes } = props
	const { v, chain, lastId, end, name } = listOf(props)
	const base = listScene(props)
	const c = chain.indexOf(id)
	const target = nodes.find((n) => n.id === id)!
	const nextKey = chain[c + 1] ?? end
	const nextName = name(nextKey)
	let scene = base
	const point = (to: Record<string, string>, bends?: Record<string, number>) => {
		scene = retarget(scene, to, bends)
	}
	const dropped = (s: Scene): Scene => {
		const t = nodeOf(s, id)
		const out = besideList(t, id, t.value, t, props)
		return { ...s, nodes: s.nodes.map((n) => (n.key === id ? { ...out, editable: false } : n)) }
	}
	const frames: Frame[] = []
	const gone = { scene: undefined as Scene | undefined }

	if (c === 0) {
		// The head, and no sentinel in front of it.
		const vars = { value: target.value, prev: 'null', curr: target.value }
		frames.push({ pointers: [pointer('curr', id)], flash: { [id]: GONE }, caption: `Delete the head, ${target.value}`, counts: { 'nodes visited': 1 }, ask: false, line: 'start', vars })
		point({ [HEAD_EDGE]: nextKey })
		frames.push({ scene, pointers: [pointer('curr', id)], flash: { [edgeMark(HEAD_EDGE)]: CHANGED }, caption: nextKey === NULL_KEY ? 'head = head.next: null, nothing left' : `head = head.next: the list starts at ${nextName} now`, ask: NEXT_LINE, line: 'unlink-head', vars })
		let lit = edgeMark(HEAD_EDGE)
		const step = (caption: string, key: string, line?: string) => {
			frames.push({ scene, pointers: [pointer('curr', id)], flash: { [lit]: null, [edgeMark(key)]: CHANGED }, caption, ask: NEXT_LINE, vars, ...(line ? { line } : {}) })
			lit = edgeMark(key)
		}
		// The only node: the list is empty now, head (and tail) pointing at null; lecture 5's second bug
		// forgets the tail, left on the node that has gone (shown, not kept).
		if (v.tail && id === lastId && forgetTail) {
			frames.push({ scene: dropped(scene), flash: { [edgeMark(HEAD_EDGE)]: null, [edgeMark(TAIL_EDGE)]: GONE, [TAIL_KEY]: GONE }, caption: forgotTail.remove(target.value, v.names.tail), ask: 'Head is null: is the list right now?' })
			return { frames: withLoops(frames, props, { [id]: c }) }
		}
		if (v.tail && id === lastId) {
			point({ [TAIL_EDGE]: NULL_KEY }, { [TAIL_EDGE]: roundLabel(scene, props, TAIL_KEY, id, NULL_KEY) })
			step('tail = null: it was the only node, so the list is empty', TAIL_EDGE, 'tail')
		}
		if (v.doubly && nextKey !== NULL_KEY) {
			point({ [prevOf(nextKey)]: v.circular ? lastId : NULL_PREV_KEY })
			step(v.circular ? `head.prev = last: ${nextName} points back round at ${name(lastId)}` : `head.prev = null: nothing comes before ${nextName}`, prevOf(nextKey))
		}
		if (v.circular) {
			point({ [next(lastId)]: nextKey })
			step(`last.next = head: the last node, ${name(lastId)}, points at ${nextName} now`, next(lastId))
		}
		gone.scene = dropped(scene)
		frames.push({ scene: gone.scene, flash: { [lit]: null }, caption: `Nothing points at ${target.value} any more: it is out of the list`, ask: `What happens to ${target.value} now?` })
		return { frames: withLoops(frames, props, { [id]: c }), nodes: nodes.slice(1), code: plainCode(props, 'list-delete') }
	}

	// Walk prev and curr from the head (or from the sentinel: prev starts there). Not to the last node
	// of a doubly linked list with a tail: tail.prev is the node before it, no walk needed.
	const first = v.sentinel ? 1 : 0
	const jump = v.doubly && v.tail && id === lastId
	if (jump) {
		frames.push({
			pointers: [pointer('prev', chain[c - 1]), pointer('curr', id)],
			flash: { [id]: GONE },
			caption: `curr = tail (${target.value}), prev = curr.prev (${name(chain[c - 1])}): no walk, a doubly linked list knows the node before its tail`,
			counts: { 'nodes visited': 1 },
			ask: `Delete ${target.value}, the last node: how do we find the node before it?`,
		})
	}
	// A singly linked list can only find the node before its last by walking the whole way.
	const walkedToLast = !v.doubly && id === lastId
	for (let j = first; j <= c && !jump; j++) {
		const prev = j > 0 ? [pointer('prev', chain[j - 1])] : []
		const how =
			j === first
				? v.sentinel
					? `prev = the sentinel, curr = head.next (${name(chain[j])})`
					: `curr = head (${name(chain[j])})`
				: `prev = curr, curr = curr.next (${name(chain[j])})`
		frames.push({
			pointers: [...prev, pointer('curr', chain[j])],
			flash: { [chain[j]]: j === c ? GONE : LOOK, ...(j > first ? { [chain[j - 1]]: null } : {}) },
			caption:
				j === c
					? `${how}: found ${target.value}${walkedToLast ? `, after visiting all ${j - first + 1} nodes: a singly linked list has no way back from its last node` : ''}`
					: `${how}. Is it ${target.value}?`,
			counts: { 'nodes visited': j - first + 1 },
			line: j === first ? 'start' : 'walk',
			vars: { value: target.value, prev: j > first ? name(chain[j - 1]) : 'null', curr: name(chain[j]) },
			...(j === first
				? { ask: `Delete ${target.value}: where does the walk start?` }
				: { ask: `curr is at ${name(chain[j - 1])}: is it ${target.value}? Where do prev and curr go?`, askFocus: [chain[j - 1]] }),
		})
	}
	const prevKey = chain[c - 1]
	const pointers = [pointer('prev', prevKey), pointer('curr', id)]
	const vars = { value: target.value, prev: name(prevKey), curr: target.value }
	point({ [next(prevKey)]: nextKey }, { [next(prevKey)]: 0.3 })
	const changes = [`prev.next = curr.next: ${name(prevKey)} now points past ${target.value}, at ${nextName}`]
	frames.push({ scene, pointers, flash: { [edgeMark(next(prevKey))]: CHANGED }, caption: changes[0], ask: NEXT_LINE, line: 'unlink', vars })
	let lit = edgeMark(next(prevKey))
	const step = (caption: string, key: string, line?: string) => {
		frames.push({ scene, pointers, flash: { [lit]: null, [edgeMark(key)]: CHANGED }, caption, ask: NEXT_LINE, vars, ...(line ? { line } : {}) })
		lit = edgeMark(key)
	}
	if (v.doubly && nextKey !== NULL_KEY) {
		point({ [prevOf(nextKey)]: prevKey })
		step(`curr.next.prev = prev: ${nextName} now points back past ${target.value}, at ${name(prevKey)}`, prevOf(nextKey))
	}
	if (v.tail && id === lastId) {
		point({ [TAIL_EDGE]: prevKey })
		step(`tail = prev: ${name(prevKey)} is the last node now`, TAIL_EDGE, 'tail')
	}
	frames.push({
		scene: dropped(scene),
		pointers,
		flash: { [lit]: null },
		caption: `Nothing points at ${target.value} any more: it is out of the list`,
		ask: `What happens to ${target.value} now?`,
	})
	return { frames: withLoops(frames, props, { [id]: c }), nodes: nodes.filter((n) => n.id !== id), code: plainCode(props, 'list-delete') }
}

const FLIPPED: Record<ListDirection, ListDirection> = { right: 'left', left: 'right', down: 'up', up: 'down' }

/**
 * Reverse the list in place: prev = null, curr = head; then for each node next = curr.next,
 * curr.next = prev (its arrow turns round), prev = curr, curr = next; finally head = prev (or,
 * with a sentinel, sentinel.next = prev). A doubly linked list instead swaps each node's next and
 * prev. A tail ends on the old first node. The reversed list is drawn the other way, so every node
 * stays where it is. (Not offered for circular lists or ones with a cycle.)
 */
export function reverseList(props: ListProps): ListOperation {
	const { nodes } = props
	const { v, lastId, name } = listOf(props)
	const base = listScene(props)
	const firstId = nodes[0].id
	const result = { nodes: [...nodes].reverse(), direction: FLIPPED[props.direction] }
	const frames: Frame[] = []
	const fromEdge = v.sentinel ? next(SENTINEL_KEY) : HEAD_EDGE
	const start = v.sentinel ? 'head.next' : 'head'
	if (v.doubly) {
		let scene = base
		frames.push({ scene, pointers: [pointer('curr', firstId)], caption: `curr = ${start}` })
		for (const [i, node] of nodes.entries()) {
			const after = nodes[i + 1]?.id ?? NULL_KEY
			const before = nodes[i - 1]?.id ?? (v.sentinel ? SENTINEL_KEY : NULL_PREV_KEY)
			scene = retarget(scene, { [next(node.id)]: before, [prevOf(node.id)]: after }, { [next(node.id)]: BACK_BEND, [prevOf(node.id)]: -BACK_BEND })
			frames.push({
				scene,
				pointers: [pointer('curr', node.id)],
				flash: { [node.id]: LOOK, ...(i ? { [nodes[i - 1].id]: null } : {}), [edgeMark(next(node.id))]: CHANGED },
				caption: `swap curr.next and curr.prev: ${node.value} now points forward at ${name(before)}, back at ${name(after)}`,
			})
			frames.push({
				scene,
				pointers: [pointer('curr', after)],
				flash: { [edgeMark(next(node.id))]: null },
				caption: `curr = curr.prev (the old next: ${name(after)})${after === NULL_KEY ? ': every node is turned' : ''}`,
			})
		}
		scene = retarget(scene, { [fromEdge]: lastId, ...(v.tail ? { [TAIL_EDGE]: firstId } : {}) })
		frames.push({
			scene,
			flash: { [edgeMark(fromEdge)]: CHANGED, [nodes[nodes.length - 1].id]: null },
			caption: `${v.sentinel ? 'sentinel.next' : 'head'} = the old last node, ${name(lastId)}${v.tail ? `; tail = the old first, ${name(firstId)}` : ''}`,
		})
		return { frames: asking(frames, 'Reverse the list: where does curr start?'), ...result }
	}
	const head = nodeOf(base, firstId)
	const axis = listAxis(props.direction)
	const step = getListMetrics(props.size).step
	const nullTemplate = base.nodes.find((n) => n.kind === 'null') ?? { ...head, kind: 'null' as const, w: head.w / 2, h: head.h / 2, value: 'null' }
	const firstNode = nodeOf(base, firstId)
	// Before the first node, in line; off the line when a sentinel sits there.
	const off = v.sentinel ? step * 0.6 : 0
	const nullBefore: SceneNode = {
		...nullTemplate,
		key: NULL_BEFORE_KEY,
		value: 'null',
		x: firstNode.x - axis.x * step * 0.8 - axis.y * off,
		y: firstNode.y - axis.y * step * 0.8 + axis.x * off,
	}
	const targets: Record<string, string> = {}
	const bends: Record<string, number> = {}
	const scene = () => {
		const s = retarget(base, targets, bends)
		return { ...s, nodes: [...s.nodes, nullBefore] }
	}
	let prev = NULL_BEFORE_KEY
	const label = (key: string) => (key === NULL_BEFORE_KEY ? 'null' : name(key))
	frames.push({ scene: scene(), pointers: [pointer('prev', prev), pointer('curr', firstId)], caption: `prev = null, curr = ${start}`, line: 'start', vars: { prev: 'null', curr: name(firstId) } })
	for (const [i, node] of nodes.entries()) {
		const after = nodes[i + 1]?.id ?? NULL_KEY
		const ptrs = (curr: string, nxt?: string) => [pointer('prev', prev), pointer('curr', curr), ...(nxt ? [pointer('next', nxt)] : [])]
		const vars = (p: string, c: string) => ({ prev: label(p), curr: c === NULL_KEY ? 'null' : name(c), next: after === NULL_KEY ? 'null' : name(after) })
		frames.push({ scene: scene(), pointers: ptrs(node.id, after), flash: { [node.id]: LOOK }, caption: `next = curr.next (${label(after)})`, line: 'save', vars: vars(prev, node.id) })
		targets[next(node.id)] = prev
		bends[next(node.id)] = BACK_BEND
		frames.push({
			scene: scene(),
			pointers: ptrs(node.id, after),
			flash: { [edgeMark(next(node.id))]: CHANGED },
			caption: `curr.next = prev: ${node.value} now points back, at ${label(prev)}`,
			line: 'turn',
			vars: vars(prev, node.id),
		})
		prev = node.id
		frames.push({
			scene: scene(),
			pointers: ptrs(after, after),
			flash: { [node.id]: null, [edgeMark(next(node.id))]: null },
			caption: `prev = curr, curr = next${after === NULL_KEY ? ': curr is null, every arrow is turned' : ''}`,
			line: 'move',
			vars: vars(prev, after),
		})
	}
	targets[fromEdge] = prev
	if (v.tail) targets[TAIL_EDGE] = firstId
	frames.push({
		scene: scene(),
		pointers: [pointer('prev', prev)],
		flash: { [edgeMark(fromEdge)]: CHANGED },
		caption: v.sentinel
			? `sentinel.next = prev: the values start at ${label(prev)}, reversed${v.tail ? `; tail = the old first, ${name(firstId)}` : ''}`
			: `head = prev: the list starts at ${label(prev)}, reversed${v.tail ? `; tail = the old first, ${name(firstId)}` : ''}`,
		line: 'head',
		vars: { prev: label(prev), curr: 'null' },
	})
	return { frames: asking(frames, 'Reverse the list: where do prev and curr start?'), ...result, code: plainCode(props, 'list-reverse') }
}

/**
 * Find the middle with two pointers: slow takes one step while fast takes two, so when fast runs
 * out of list, slow is half-way. (With an even count, slow ends on the second of the two middles.)
 * Not offered for circular lists or ones with a cycle: fast would never run out.
 */
export function findMiddle(props: ListProps): ListOperation {
	const { nodes } = props
	const { v } = listOf(props)
	const at = (i: number) => nodes[i]?.id ?? NULL_KEY
	const name = (i: number) => nodes[i]?.value ?? 'null'
	const frames: Frame[] = []
	let slow = 0
	let fast = 0
	const start = v.sentinel ? 'head.next' : 'head'
	frames.push({
		pointers: [pointer('slow', at(slow)), pointer('fast', at(fast))],
		flash: { [at(slow)]: LOOK },
		caption: `slow = ${start}, fast = ${start}`,
	})
	let steps = 0
	while (fast < nodes.length && fast + 1 < nodes.length) {
		const before = slow
		slow += 1
		fast += 2
		steps++
		frames.push({
			pointers: [pointer('slow', at(slow)), pointer('fast', at(fast))],
			flash: { [at(before)]: null, [at(slow)]: LOOK },
			caption: `slow = slow.next (${name(slow)}), fast = fast.next.next (${name(fast)})`,
		})
	}
	const why = fast >= nodes.length ? 'fast is null' : "fast.next is null: fast can't take two more steps"
	frames.push({
		pointers: [pointer('slow', at(slow)), pointer('fast', at(fast))],
		flash: { [at(slow)]: FOUND },
		caption: `${why}, so slow is at the middle: ${name(slow)} (after ${steps} step${steps === 1 ? '' : 's'}, half the list)`,
	})
	return { frames: asking(frames, 'Find the middle: where do slow and fast start?', 'Where do slow and fast go next?'), finalFlash: { [at(slow)]: FOUND } }
}

/**
 * Insert `value` into a sorted list, keeping it sorted: prev and curr walk until curr's value is
 * not smaller (or curr is null), then the new node goes between them with the usual assignments
 * (at the front if it belongs first: after the sentinel, if there is one).
 */
export function insertSorted(props: ListProps, id: string, value: string): ListOperation {
	const { nodes } = props
	const { v, end } = listOf(props)
	const frames: Frame[] = []
	const unsorted = nodes.findIndex((n, i) => i > 0 && compareKeys(nodes[i - 1].value, n.value) > 0)
	if (unsorted > 0) {
		const [a, b] = [nodes[unsorted - 1], nodes[unsorted]]
		frames.push({
			flash: { [a.id]: GONE, [b.id]: GONE },
			caption: `Careful: ${a.value} > ${b.value}, so the list isn't sorted and ${value} may land out of order`,
		})
		frames.push({ flash: { [a.id]: null, [b.id]: null }, caption: 'Insert in order anyway' })
	}
	const start = v.sentinel ? 'curr = head.next' : 'curr = head'
	let k = 0
	while (k < nodes.length && compareKeys(nodes[k].value, value) < 0) {
		const prev = k > 0 ? [pointer('prev', nodes[k - 1].id)] : v.sentinel ? [pointer('prev', SENTINEL_KEY)] : []
		frames.push({
			pointers: [...prev, pointer('curr', nodes[k].id)],
			flash: { [nodes[k].id]: LOOK, ...(k ? { [nodes[k - 1].id]: null } : {}) },
			caption: `${k === 0 ? start : 'prev = curr, curr = curr.next'}: ${nodes[k].value} < ${value}, so keep going`,
		})
		k++
	}
	const stop = nodes[k]
	const stopKey = stop?.id ?? end
	const before = k > 0 ? nodes[k - 1].id : v.sentinel ? SENTINEL_KEY : undefined
	frames.push({
		pointers: [...(before ? [pointer('prev', before)] : []), pointer('curr', stopKey)],
		flash: k > 0 ? { [nodes[k - 1].id]: null } : {},
		caption: stop
			? `${k === 0 ? start : 'prev = curr, curr = curr.next'}: ${stop.value} ≥ ${value}, so ${value} goes ${k === 0 ? 'first, at the head' : `between ${nodes[k - 1].value} and ${stop.value}`}`
			: `curr = ${end === NULL_KEY ? 'null' : 'back round'}: ${value} is the largest, so it goes at the end, after ${nodes[k - 1].value}`,
	})
	const insert = insertIntoList(props, k > 0 ? nodes[k - 1].id : undefined, id, value)
	if (!before) return { ...insert, frames: [...asking(frames, undefined), ...insert.frames] }
	// The walk replaces insertIntoList's opening step ("curr is at ..."), and what it calls curr (the
	// node before) is prev here, with curr staying on the node after.
	const linking = insert.frames.slice(1).map((f) => ({
		...f,
		pointers: [...(f.pointers ?? []).map((p) => (p.name === 'curr' ? pointer('prev', p.at) : p)), pointer('curr', stopKey)],
		caption: f.caption?.replace(/\bcurr\b/g, 'prev'),
	}))
	return { ...insert, frames: [...asking(frames, undefined), ...linking] }
}

/**
 * Append `value` at the end. With a tail pointer: tail.next = node, tail = node, however long the
 * list (O(1)). Without one, curr walks from the head to the last node first, each step counted
 * (O(n)). A doubly linked list sets node.prev too; in a circular one the new last node points round
 * to the front (and, doubly, the front back at it). Not for a list with a cycle: it has no end.
 */
export function appendToList(props: ListProps, id: string, value: string): ListOperation {
	const { nodes } = props
	// Nothing to walk to, no tail to follow: the new node is the head (and tail), as inserting there.
	if (!nodes.length) return insertIntoList(props, undefined, id, value)
	const { v, chain, lastId, end, name, arrows } = listOf(props)
	const base = listScene(props)
	const last = nodeOf(base, lastId)
	const axis = listAxis(props.direction)
	const half = getListMetrics(props.size, v.doubly).step / 2
	const fresh = besideList(nodeOf(base, nodes[0].id), id, value, { x: last.x + axis.x * half, y: last.y + axis.y * half }, props)
	const endName = end === NULL_KEY ? 'null' : v.sentinel ? 'the sentinel' : 'head'
	const frames: Frame[] = []
	let steps = 0
	if (v.tail) {
		frames.push({ flash: { [lastId]: LOOK }, counts: { steps }, caption: `tail is at the last node, ${name(lastId)}: no walk needed`, line: 'call', vars: { value } })
	} else {
		for (const [j, key] of chain.entries()) {
			steps = j
			const how = j === 0 ? `curr = head (${name(key)})` : `curr.next != ${endName}, so curr = curr.next (${name(key)})`
			frames.push({
				pointers: [pointer('curr', key)],
				flash: { [key]: LOOK, ...(j ? { [chain[j - 1]]: null } : {}) },
				counts: { steps },
				caption: key === lastId ? `${how}: its next is ${endName}, so it is the last node` : how,
				line: j === 0 ? 'start' : 'walk',
				vars: { value, curr: name(key) },
			})
		}
	}
	const at = v.tail ? 'tail' : 'curr'
	const curr = v.tail ? [] : [pointer('curr', lastId)]
	let scene: Scene = { ...base, nodes: [...base.nodes, fresh] }
	let lit: string | undefined = lastId
	const vars = { value, node: value, ...(v.tail ? {} : { curr: name(lastId) }) }
	const step = (caption: string, key?: string, line?: string) => {
		const flash: Record<string, MarkColor | null> = { ...(lit ? { [lit]: null } : {}), ...(key ? { [key]: key === id ? FOUND : CHANGED } : {}) }
		lit = key === id ? undefined : key
		frames.push({ scene, pointers: [...curr, pointer('node', id)], flash, caption, vars, ...(line ? { line } : {}) })
	}
	const add = (edge: SceneEdge) => {
		scene = { ...scene, edges: [...scene.edges, edge] }
	}
	const point = (to: Record<string, string>, bends?: Record<string, number>) => {
		scene = retarget(scene, to, bends)
	}
	if (end === NULL_KEY) add({ key: next(id), from: id, to: NULL_KEY, directed: true, fromPointer: true, ...arrows })
	step(`node = new Node(${value})${end === NULL_KEY ? ': its next is null' : ''}`, id, 'new')
	let assignments = 0
	if (end !== NULL_KEY) {
		add({ key: next(id), from: id, to: end, directed: true, fromPointer: true, ...arrows })
		step(`node.next = ${at}.next: the new last node points round to ${name(end)}, as the old one does`, edgeMark(next(id)))
		assignments++
	}
	if (v.doubly) {
		add({ key: prevOf(id), from: id, to: lastId, directed: true, fromPointer: 'prev', ...arrows })
		step(`node.prev = ${at}: it points back at ${name(lastId)}`, edgeMark(prevOf(id)))
		assignments++
	}
	point({ [next(lastId)]: id })
	step(`${at}.next = node: ${name(lastId)} points at ${value}`, edgeMark(next(lastId)), 'point')
	assignments++
	if (v.doubly && v.circular) {
		point({ [prevOf(chain[0])]: id })
		step(`head.prev = node: round the circle, ${name(chain[0])} points back at ${value}`, edgeMark(prevOf(chain[0])))
		assignments++
	}
	if (v.tail) {
		point({ [TAIL_EDGE]: id }, { [TAIL_EDGE]: roundLabel(scene, props, TAIL_KEY, lastId, id) })
		step(`tail = node: ${value} is the last node now`, edgeMark(TAIL_EDGE), 'tail')
		assignments++
	}
	frames.push({
		scene,
		pointers: [...curr, pointer('node', id)],
		flash: lit ? { [lit]: null } : {},
		caption: v.tail
			? `Appended in O(1): ${assignments} assignments and no walk, however long the list`
			: `Appended, but finding the end took ${steps} step${steps === 1 ? '' : 's'}, one per node: O(n). A tail pointer makes it O(1)`,
	})
	return {
		frames: withLoops(asking(frames, `Append ${value}: where does it start?`), props, { [id]: chain.length - 0.5 }),
		nodes: [...nodes, { id, value, dx: 0, dy: 0 }],
		finalFlash: { [id]: FOUND },
		code: plainCode(props, 'list-append'),
	}
}

/**
 * Print the values, front to back: while (curr != null), curr = curr.next. Round a circular list a
 * do-while, so the test (curr != head) comes after the first node; with a sentinel a plain while
 * loop does, stopping at the sentinel. Not for a list with a cycle: it never ends.
 */
export function printList(props: ListProps): ListOperation {
	const { nodes } = props
	const { v, end, name } = listOf(props)
	const frames: Frame[] = []
	const printed: string[] = []
	const strips = (): Strip[] => [{ title: 'printed', items: [...printed] }]
	const stop = end === NULL_KEY ? 'null' : v.sentinel ? 'the sentinel' : 'the head'
	const loop =
		v.circular && !v.sentinel
			? 'do { print; curr = curr.next } while (curr != head): the test comes after the body, or it would stop before it started'
			: `while (curr != ${end === NULL_KEY ? 'null' : 'sentinel'})`
	const first = v.sentinel ? `curr = head.next (past the sentinel): ${name(nodes[0].id)}` : `curr = head (${name(nodes[0].id)})`
	frames.push({ pointers: [pointer('curr', nodes[0].id)], flash: { [nodes[0].id]: LOOK }, strips: strips(), caption: `${first}. ${loop}` })
	for (const [i, node] of nodes.entries()) {
		printed.push(node.value)
		const to = nodes[i + 1]?.id ?? end
		const last = i === nodes.length - 1
		frames.push({
			pointers: [pointer('curr', to)],
			flash: { [node.id]: VISITED, ...(last ? {} : { [to]: LOOK }) },
			strips: strips(),
			caption: `print ${node.value}; curr = curr.next${last ? `: ${stop}${v.circular && !v.sentinel ? ' again' : ''}, so stop` : ` (${name(to)})`}`,
		})
	}
	return { frames: asking(frames, 'Print the list: where does curr start?', 'What is printed next, and where does curr go?') }
}

/**
 * Print the values back to front, in a doubly linked list: from the tail (or, with none, the last
 * node, found by walking; in a circular list it is head.prev), curr = curr.prev until null, the
 * sentinel, or (circular) back at the last node.
 */
export function printBackwards(props: ListProps): ListOperation {
	const { nodes } = props
	const { v, lastId, name } = listOf(props)
	const frames: Frame[] = []
	const printed: string[] = []
	const strips = (): Strip[] => [{ title: 'printed backwards', items: [...printed] }]
	if (v.tail) {
		frames.push({ pointers: [pointer('curr', lastId)], flash: { [lastId]: LOOK }, strips: strips(), caption: `curr = tail (${name(lastId)})` })
	} else if (v.circular) {
		frames.push({
			pointers: [pointer('curr', lastId)],
			flash: { [lastId]: LOOK },
			strips: strips(),
			caption: `curr = head.prev (${name(lastId)}): round a circle the last node is one step back from the head`,
		})
	} else {
		// No tail: walk forward to the last node first.
		for (const [i, node] of nodes.entries()) {
			const how = i === 0 ? (v.sentinel ? `curr = head.next (${node.value})` : `curr = head (${node.value})`) : `curr = curr.next (${node.value})`
			frames.push({
				pointers: [pointer('curr', node.id)],
				flash: { [node.id]: LOOK, ...(i ? { [nodes[i - 1].id]: null } : {}) },
				strips: strips(),
				caption: node.id === lastId ? `${how}: the last node. Now back` : `${how}: no tail, so walk to the end first`,
			})
		}
	}
	const stop = v.sentinel ? 'the sentinel' : v.circular ? `${name(lastId)} again` : 'null'
	const back = v.sentinel ? SENTINEL_KEY : v.circular ? lastId : NULL_PREV_KEY
	for (let i = nodes.length - 1; i >= 0; i--) {
		const node = nodes[i]
		printed.push(node.value)
		const to = i > 0 ? nodes[i - 1].id : back
		frames.push({
			pointers: [pointer('curr', to)],
			flash: { [node.id]: VISITED, ...(i > 0 ? { [to]: LOOK } : {}) },
			strips: strips(),
			caption: `print ${node.value}; curr = curr.prev${i > 0 ? ` (${name(to)})` : `: ${stop}, so stop`}`,
		})
	}
	return { frames }
}

const CYCLE_START = 'Is there a cycle? Where do slow and fast start?'
const CYCLE_STEP = 'Where do slow and fast go next: have they met?'

/**
 * Floyd's cycle detection: slow takes one step at a time and fast two, until fast runs off the end
 * (no cycle) or they meet (fast has lapped slow round a cycle). Then slow starts again from the
 * head and both take single steps: they meet where the cycle starts, as the head and the meeting
 * point are the same distance from it (going round).
 */
export function detectCycle(props: ListProps): ListOperation {
	const { nodes } = props
	const { v, chain, end, name } = listOf(props)
	const nextOf = (key: string) => {
		const i = chain.indexOf(key)
		return i < 0 ? NULL_KEY : (chain[i + 1] ?? end)
	}
	const first = nodes[0].id
	const start = v.sentinel ? 'head.next' : 'head'
	const frames: Frame[] = []
	let [slow, fast, steps] = [first, first, 0]
	let lit = first
	const show = (caption: string, color: MarkColor = LOOK) => {
		frames.push({
			pointers: [pointer('slow', slow), pointer('fast', fast)],
			flash: { ...(lit !== slow ? { [lit]: null } : {}), ...(slow === NULL_KEY ? {} : { [slow]: color }) },
			counts: { steps },
			caption,
		})
		lit = slow
	}
	show(`slow = ${start}, fast = ${start}: slow takes one step at a time, fast two`)
	for (;;) {
		if (fast === NULL_KEY || nextOf(fast) === NULL_KEY) {
			const why = fast === NULL_KEY ? 'fast is null' : "fast.next is null: fast can't take two more steps"
			frames.push({ pointers: [pointer('slow', slow), pointer('fast', fast)], flash: { [lit]: null }, counts: { steps }, caption: `${why}, so it ran off the end: no cycle` })
			return { frames: asking(frames, CYCLE_START, CYCLE_STEP) }
		}
		slow = nextOf(slow)
		fast = nextOf(nextOf(fast))
		steps++
		const met = slow === fast
		show(
			`slow = slow.next (${name(slow)}), fast = fast.next.next (${name(fast)})${met ? ': they meet, so fast has lapped slow round a cycle' : ''}`,
			met ? FOUND : LOOK
		)
		if (met) break
	}
	const meet = slow
	slow = first
	show(`slow = ${start} again; fast stays at ${name(meet)}, where they met. Now both take one step at a time`)
	while (slow !== fast) {
		slow = nextOf(slow)
		fast = nextOf(fast)
		steps++
		show(`slow = slow.next (${name(slow)}), fast = fast.next (${name(fast)})`)
	}
	show(`They meet at ${name(slow)}: the cycle starts here (the head and the meeting point are as far from it, going round)`, FOUND)
	return { frames: asking(frames, CYCLE_START, CYCLE_STEP), finalFlash: { [slow]: FOUND } }
}

/** Whether two scenes draw the same: nodes in the same places, arrows to the same nodes, the same way. */
function sameDrawing(a: Scene, b: Scene): boolean {
	const draw = (s: Scene) =>
		JSON.stringify([
			s.nodes.map((n) => [n.key, Math.round(n.x), Math.round(n.y)]).sort(),
			s.edges.map((e) => [e.key, e.to, e.bend ?? 0, (e.via ?? []).map((p) => [Math.round(p.x), Math.round(p.y)])]).sort(),
		])
	return draw(a) === draw(b)
}

/**
 * An operation that changes the list ends on it drawn in a line as the result will be (shifted so
 * the first node that stays is where it is now), so nothing moves when the result goes in or the
 * bar closes, and the node handles sit on their nodes. The arrows' lights go out; the nodes' stay.
 * A closing remark that changes nothing (append's O(1) or O(n)) moves onto that step, so it stays
 * the last word. Unchanged when the last step already looks like the result.
 */
export function endTidied(before: ListProps, after: ListProps, frames: readonly Frame[]): Frame[] {
	const scene = translateScene(listScene(after), anchorShift(before, after))
	const [prev, last] = [frames.at(-2), frames.at(-1)]
	if (last?.scene && sameDrawing(last.scene, scene)) return [...frames]
	const remark = last?.scene && prev?.scene && sameDrawing(last.scene, prev.scene) ? last.caption : undefined
	const lit = Object.keys(stateAt(frames, frames.length - 1).flash).filter((key) => key.startsWith('edge:'))
	const tidy: Frame = {
		scene,
		flash: Object.fromEntries(lit.map((key) => [key, null])),
		caption: remark ?? 'Tidied up: the same links, drawn in a line',
		ask: false,
	}
	return remark ? [...frames.slice(0, -1), tidy] : [...frames, tidy]
}
