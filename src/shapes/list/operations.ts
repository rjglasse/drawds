import type { MarkColor } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import type { Frame } from '../../nodelink/playback'
import { edgeCellKey, type Scene, type SceneEdge, type SceneNode } from '../../nodelink/scene'
import type { Pointer } from '../../pointers/pointers'
import { HEAD_KEY, NULL_KEY, getListMetrics, listAxis, listScene } from './layout'
import type { ListDirection, ListNode, ListShapeProps } from './list-shape-types'

// List operations, step by step: each step is a line of the code a teacher writes on the board
// (curr = curr.next, node.next = curr.next...), drawn as it happens: temporary pointers curr,
// prev and next slide along, arrows re-point (lit orange), new nodes appear beside the list.

type ListProps = Pick<ListShapeProps, 'nodes' | 'direction' | 'size'>

const LOOK: MarkColor = 'orange'
const FOUND: MarkColor = 'green'
const GONE: MarkColor = 'red'
const CHANGED: MarkColor = 'orange'

/** A null marker before the head, for pointers that start out null (reverse's prev). */
export const NULL_BEFORE_KEY = '#null-before'

const nextEdgeKey = (id: string) => `${id}->`
const HEAD_EDGE = `${HEAD_KEY}->`
const pointer = (name: string, at: string): Pointer => ({ id: `#${name}`, name, at })
const edgeMark = (key: string) => edgeCellKey(key)

/** The list's scene with its arrows re-pointed by `targets` (node id -> what its next is now). */
function withTargets(scene: Scene, targets: Record<string, string>, bends: Record<string, number> = {}): Scene {
	return {
		...scene,
		edges: scene.edges.map((e) => {
			const owner = e.key === HEAD_EDGE ? HEAD_KEY : e.from
			const to = targets[owner]
			return to === undefined ? e : { ...e, to, bend: bends[owner] }
		}),
	}
}

function nodeOf(scene: Scene, key: string) {
	return scene.nodes.find((n) => n.key === key)!
}

/** A list node drawn `away` steps off the list's line, beside `at` (a new node, or one dropping out). */
function besideList(template: SceneNode, key: string, value: string, at: { x: number; y: number }, props: ListProps): SceneNode {
	const axis = listAxis(props.direction)
	const away = getListMetrics(props.size).step * 0.8
	return { ...template, key, value, x: at.x - axis.y * away, y: at.y + axis.x * away, editable: false, draggable: false }
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
}

/** Find `target`: curr walks from the head comparing, until it finds it or reaches null. */
export function findInList(props: ListProps, target: string): ListOperation {
	const { nodes } = props
	const frames: Frame[] = []
	for (const [i, node] of nodes.entries()) {
		const how = i === 0 ? `curr = head (${node.value})` : `${nodes[i - 1].value} ≠ ${target}, so curr = curr.next (${node.value})`
		frames.push({
			pointers: [pointer('curr', node.id)],
			flash: { [node.id]: LOOK, ...(i ? { [nodes[i - 1].id]: null } : {}) },
			caption: `${how}. Is it ${target}?`,
		})
		if (node.value === target) {
			frames.push({
				pointers: [pointer('curr', node.id)],
				flash: { [node.id]: FOUND },
				caption: `Yes: ${target} is node ${i + 1} from the head`,
			})
			return { frames, finalFlash: { [node.id]: FOUND } }
		}
	}
	const last = nodes[nodes.length - 1]
	frames.push({
		pointers: [pointer('curr', NULL_KEY)],
		flash: last ? { [last.id]: null } : {},
		caption: `${last ? `${last.value} ≠ ${target}, so curr = curr.next: ` : 'curr = head: '}null. ${target} is not in the list`,
	})
	return { frames }
}

/**
 * Insert `value` after node `afterId` (or, with no `afterId`, at the head): the new node appears
 * beside the list, then the two assignments, in the order that keeps the rest of the list.
 */
export function insertIntoList(props: ListProps, afterId: string | undefined, id: string, value: string): ListOperation {
	const { nodes } = props
	const base = listScene(props)
	const template = nodeOf(base, nodes[0].id)
	const i = afterId === undefined ? -1 : nodes.findIndex((n) => n.id === afterId)
	const after = nodes[i]
	const next = nodes[i + 1]?.id ?? NULL_KEY
	const at = after
		? { x: (nodeOf(base, after.id).x + nodeOf(base, next).x) / 2, y: (nodeOf(base, after.id).y + nodeOf(base, next).y) / 2 }
		: nodeOf(base, nodes[0].id)
	const fresh = besideList(template, id, value, at, props)
	const withNew = (s: Scene, edges: SceneEdge[] = []): Scene => ({ ...s, nodes: [...s.nodes, fresh], edges: [...s.edges, ...edges] })
	// After a node: to that node's next. At the head (i = -1), `next` is the head.
	const newEdge: SceneEdge = { key: nextEdgeKey(id), from: id, to: next, directed: true, fromPointer: true }
	const curr = after ? [pointer('curr', after.id)] : []
	const frames: Frame[] = []

	if (after) {
		frames.push({ pointers: curr, flash: { [after.id]: LOOK }, caption: `curr is at ${after.value}: insert ${value} after it` })
	}
	frames.push({
		scene: withNew(base),
		pointers: [...curr, pointer('node', id)],
		flash: { [id]: FOUND },
		caption: `node = new Node(${value}): its next is null for now`,
	})
	if (after) {
		frames.push({
			scene: withNew(base, [newEdge]),
			pointers: [...curr, pointer('node', id)],
			flash: { [edgeMark(newEdge.key)]: CHANGED },
			caption: `node.next = curr.next: the new node points at ${next === NULL_KEY ? 'null' : nodes[i + 1].value} too`,
		})
		frames.push({
			scene: withTargets(withNew(base, [newEdge]), { [after.id]: id }),
			pointers: [...curr, pointer('node', id)],
			flash: { [edgeMark(newEdge.key)]: null, [edgeMark(nextEdgeKey(after.id))]: CHANGED },
			caption: `curr.next = node: ${after.value} now points at ${value}. (The other way round, the rest of the list would be lost)`,
		})
	} else {
		frames.push({
			scene: withNew(base, [newEdge]),
			pointers: [pointer('node', id)],
			flash: { [edgeMark(newEdge.key)]: CHANGED },
			caption: `node.next = head: the new node points at ${nodes[0].value}`,
		})
		frames.push({
			scene: withTargets(withNew(base, [newEdge]), { [HEAD_KEY]: id }),
			pointers: [pointer('node', id)],
			flash: { [edgeMark(newEdge.key)]: null, [edgeMark(HEAD_EDGE)]: CHANGED },
			caption: `head = node: ${value} is the first node now`,
		})
	}
	const node: ListNode = { id, value, dx: 0, dy: 0 }
	return { frames, nodes: [...nodes.slice(0, i + 1), node, ...nodes.slice(i + 1)], finalFlash: { [id]: FOUND } }
}

/**
 * Delete node `id`: prev and curr walk from the head to it, then prev.next = curr.next takes the
 * arrow round it and it drops out of the list; for the head, head = head.next.
 */
export function deleteFromList(props: ListProps, id: string): ListOperation {
	const { nodes } = props
	const base = listScene(props)
	const k = nodes.findIndex((n) => n.id === id)
	const target = nodes[k]
	const next = nodes[k + 1]?.id ?? NULL_KEY
	const nextName = next === NULL_KEY ? 'null' : nodes[k + 1].value
	const dropped = (s: Scene): Scene => {
		const t = nodeOf(s, id)
		const out = besideList(t, id, t.value, t, props)
		return { ...s, nodes: s.nodes.map((n) => (n.key === id ? { ...out, editable: false } : n)) }
	}
	const frames: Frame[] = []

	if (k === 0) {
		frames.push({ pointers: [pointer('curr', id)], flash: { [id]: GONE }, caption: `Delete the head, ${target.value}` })
		const moved = withTargets(base, { [HEAD_KEY]: next })
		frames.push({
			scene: moved,
			pointers: [pointer('curr', id)],
			flash: { [edgeMark(HEAD_EDGE)]: CHANGED },
			caption: `head = head.next: the list starts at ${nextName} now`,
		})
		frames.push({
			scene: dropped(moved),
			flash: { [edgeMark(HEAD_EDGE)]: null },
			caption: `Nothing points at ${target.value} any more: it is out of the list`,
		})
		return { frames, nodes: nodes.slice(1) }
	}

	for (let j = 0; j <= k; j++) {
		const prev = j > 0 ? [pointer('prev', nodes[j - 1].id)] : []
		const how = j === 0 ? `curr = head (${nodes[0].value})` : `prev = curr, curr = curr.next (${nodes[j].value})`
		frames.push({
			pointers: [...prev, pointer('curr', nodes[j].id)],
			flash: { [nodes[j].id]: j === k ? GONE : LOOK, ...(j ? { [nodes[j - 1].id]: null } : {}) },
			caption: j === k ? `${how}: found ${target.value}` : `${how}. Is it ${target.value}?`,
		})
	}
	const prevId = nodes[k - 1].id
	const pointers = [pointer('prev', prevId), pointer('curr', id)]
	const bypass = withTargets(base, { [prevId]: next }, { [prevId]: 0.3 })
	frames.push({
		scene: bypass,
		pointers,
		flash: { [edgeMark(nextEdgeKey(prevId))]: CHANGED },
		caption: `prev.next = curr.next: ${nodes[k - 1].value} now points past ${target.value}, at ${nextName}`,
	})
	frames.push({
		scene: dropped(bypass),
		pointers,
		flash: { [edgeMark(nextEdgeKey(prevId))]: null },
		caption: `Nothing points at ${target.value} any more: it is out of the list`,
	})
	return { frames, nodes: nodes.filter((n) => n.id !== id) }
}

const FLIPPED: Record<ListDirection, ListDirection> = { right: 'left', left: 'right', down: 'up', up: 'down' }

/**
 * Reverse the list in place: prev = null, curr = head; then for each node next = curr.next,
 * curr.next = prev (its arrow turns round), prev = curr, curr = next; finally head = prev. The
 * reversed list is drawn the other way, so every node stays where it is.
 */
export function reverseList(props: ListProps): ListOperation {
	const { nodes } = props
	const base = listScene(props)
	const head = nodeOf(base, nodes[0].id)
	const axis = listAxis(props.direction)
	const step = getListMetrics(props.size).step
	const nullTemplate = nodeOf(base, NULL_KEY)
	const nullBefore: SceneNode = { ...nullTemplate, key: NULL_BEFORE_KEY, x: head.x - axis.x * step * 0.8, y: head.y - axis.y * step * 0.8 }
	const targets: Record<string, string> = {}
	const bends: Record<string, number> = {}
	const scene = () => {
		const s = withTargets(base, targets, bends)
		return { ...s, nodes: [...s.nodes, nullBefore] }
	}
	const name = (key: string) => (key === NULL_KEY || key === NULL_BEFORE_KEY ? 'null' : nodes.find((n) => n.id === key)!.value)
	const frames: Frame[] = []
	let prev = NULL_BEFORE_KEY
	frames.push({ scene: scene(), pointers: [pointer('prev', prev), pointer('curr', nodes[0].id)], caption: 'prev = null, curr = head' })
	for (const [i, node] of nodes.entries()) {
		const next = nodes[i + 1]?.id ?? NULL_KEY
		const ptrs = (curr: string, nxt?: string) => [pointer('prev', prev), pointer('curr', curr), ...(nxt ? [pointer('next', nxt)] : [])]
		frames.push({ scene: scene(), pointers: ptrs(node.id, next), flash: { [node.id]: LOOK }, caption: `next = curr.next (${name(next)})` })
		targets[node.id] = prev
		bends[node.id] = BACK_BEND
		frames.push({
			scene: scene(),
			pointers: ptrs(node.id, next),
			flash: { [edgeMark(nextEdgeKey(node.id))]: CHANGED },
			caption: `curr.next = prev: ${node.value} now points back, at ${name(prev)}`,
		})
		prev = node.id
		frames.push({
			scene: scene(),
			pointers: ptrs(next, next),
			flash: { [node.id]: null, [edgeMark(nextEdgeKey(node.id))]: null },
			caption: `prev = curr, curr = next${next === NULL_KEY ? ': curr is null, every arrow is turned' : ''}`,
		})
	}
	targets[HEAD_KEY] = prev
	frames.push({
		scene: scene(),
		pointers: [pointer('prev', prev)],
		flash: { [edgeMark(HEAD_EDGE)]: CHANGED },
		caption: `head = prev: the list starts at ${name(prev)}, reversed`,
	})
	return { frames, nodes: [...nodes].reverse(), direction: FLIPPED[props.direction] }
}

/**
 * Find the middle with two pointers: slow takes one step while fast takes two, so when fast runs
 * out of list, slow is half-way. (With an even count, slow ends on the second of the two middles.)
 */
export function findMiddle(props: ListProps): ListOperation {
	const { nodes } = props
	const at = (i: number) => nodes[i]?.id ?? NULL_KEY
	const name = (i: number) => nodes[i]?.value ?? 'null'
	const frames: Frame[] = []
	let slow = 0
	let fast = 0
	frames.push({
		pointers: [pointer('slow', at(slow)), pointer('fast', at(fast))],
		flash: { [at(slow)]: LOOK },
		caption: 'slow = head, fast = head',
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
	return { frames, finalFlash: { [at(slow)]: FOUND } }
}

/**
 * Insert `value` into a sorted list, keeping it sorted: prev and curr walk until curr's value is
 * not smaller (or curr is null), then the new node goes between them with the usual two
 * assignments (at the head if it belongs first).
 */
export function insertSorted(props: ListProps, id: string, value: string): ListOperation {
	const { nodes } = props
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
	let k = 0
	while (k < nodes.length && compareKeys(nodes[k].value, value) < 0) {
		const prev = k > 0 ? [pointer('prev', nodes[k - 1].id)] : []
		frames.push({
			pointers: [...prev, pointer('curr', nodes[k].id)],
			flash: { [nodes[k].id]: LOOK, ...(k ? { [nodes[k - 1].id]: null } : {}) },
			caption: `${k === 0 ? 'curr = head' : 'prev = curr, curr = curr.next'}: ${nodes[k].value} < ${value}, so keep going`,
		})
		k++
	}
	const stop = nodes[k]
	frames.push({
		pointers: [...(k > 0 ? [pointer('prev', nodes[k - 1].id)] : []), pointer('curr', stop?.id ?? NULL_KEY)],
		flash: k > 0 ? { [nodes[k - 1].id]: null } : {},
		caption: stop
			? `${k === 0 ? 'curr = head' : 'prev = curr, curr = curr.next'}: ${stop.value} ≥ ${value}, so ${value} goes ${k === 0 ? 'first, at the head' : `between ${nodes[k - 1].value} and ${stop.value}`}`
			: `curr = null: ${value} is the largest, so it goes at the end, after ${nodes[k - 1].value}`,
	})
	const insert = insertIntoList(props, nodes[k - 1]?.id, id, value)
	if (k === 0) return { ...insert, frames: [...frames, ...insert.frames] }
	// The walk replaces insertIntoList's opening step ("curr is at ..."), and what it calls curr (the
	// node before) is prev here, with curr staying on the node after.
	const linking = insert.frames.slice(1).map((f) => ({
		...f,
		pointers: [...(f.pointers ?? []).map((p) => (p.name === 'curr' ? pointer('prev', p.at) : p)), pointer('curr', stop?.id ?? NULL_KEY)],
		caption: f.caption?.replace(/\bcurr\b/g, 'prev'),
	}))
	return { ...insert, frames: [...frames, ...linking] }
}
