import { compareKeys } from '../../data/compare'
import type { Frame } from '../../nodelink/playback'
import { translateScene, type Scene, type SceneEdge, type SceneNode } from '../../nodelink/scene'
import { NULL_KEY, getListMetrics, listAxis, listScene, listVariant } from './layout'
import type { ListNode } from './list-shape-types'
import { CHANGED, FOUND, HEAD_EDGE, LOOK, asking, edgeMark, next, nodeOf, pointer, retarget, type ListOperation, type ListProps } from './operations'

// Merging two sorted lists (dds-55z.20.9), as merge(a, b) does it with a dummy node and a tail
// pointer: tail.next takes the smaller of a and b, which moves on, then tail does; whatever is left
// of either goes on the end. No node is copied or moved: arrows are re-pointed, which is why
// linked lists suit merging.

/** The dummy node the merged list hangs off, and the other list's null. */
export const DUMMY_KEY = '#dummy'
const B_NULL = '#null-b'

export const isSorted = (nodes: readonly Pick<ListNode, 'value'>[]) => nodes.every((n, i) => i === 0 || compareKeys(nodes[i - 1].value, n.value) <= 0)

/** Whether a list can be merged: a plain singly linked list (no tail, sentinel, circle or cycle), sorted, not empty. */
export function canMerge(props: ListProps): boolean {
	const v = listVariant(props, props.nodes)
	return props.nodes.length > 0 && v.kind === 'list' && !v.doubly && !v.tail && !v.circular && !v.sentinel && !v.cycleTo && isSorted(props.nodes)
}

/**
 * Merge sorted `b` into sorted `a`. `b` is drawn where it is (`bAt`: its layout's origin in a's
 * layout coordinates), its nodes already under the ids they get in a (`bIds`), so the merged list
 * slides into line at the end.
 */
export function mergeSortedLists(a: ListProps, b: ListProps, bAt: { x: number; y: number }, bIds: readonly string[]): ListOperation & { nodes: ListNode[] } {
	const sceneA = listScene(a)
	const rawB = translateScene(listScene(b), bAt)
	const rename = new Map<string, string>([...b.nodes.map((n, i): [string, string] => [n.id, bIds[i]]), [NULL_KEY, B_NULL]])
	// b's nodes and its null under their new keys; its head label goes, as b is a pointer now.
	const bNodes = rawB.nodes.filter((n) => rename.has(n.key)).map((n): SceneNode => ({ ...n, key: rename.get(n.key)!, editable: false, draggable: false }))
	const bEdges = rawB.edges
		.filter((e) => rename.has(e.from) && e.from !== NULL_KEY)
		.map((e): SceneEdge => ({ ...e, key: next(rename.get(e.from)!), from: rename.get(e.from)!, to: rename.get(e.to) ?? e.to }))
	// The dummy, a step before a's first node.
	const first = nodeOf(sceneA, a.nodes[0].id)
	const [axis, step] = [listAxis(a.direction), getListMetrics(a.size).step]
	const dummy: SceneNode = { ...first, key: DUMMY_KEY, value: '', x: first.x - axis.x * step, y: first.y - axis.y * step, editable: false, draggable: false }

	const value = new Map([...a.nodes.map((n): [string, string] => [n.id, n.value]), ...b.nodes.map((n, i): [string, string] => [bIds[i], n.value])])
	const name = (key: string | undefined) => (key === undefined ? 'null' : value.get(key)!)
	const targets: Record<string, string> = {}
	const scene = (): Scene => {
		// dummy.next is null until tail.next first takes a node.
		const linked = targets[next(DUMMY_KEY)] ? [{ key: next(DUMMY_KEY), from: DUMMY_KEY, to: targets[next(DUMMY_KEY)], directed: true, fromPointer: true }] : []
		return retarget({ ...sceneA, nodes: [...sceneA.nodes, dummy, ...bNodes], edges: [...sceneA.edges, ...bEdges, ...linked] }, targets)
	}

	const [listA, listB] = [a.nodes.map((n) => n.id), [...bIds]]
	let [i, j, tail] = [0, 0, DUMMY_KEY]
	const order: string[] = []
	const pointers = () => [pointer('dummy', DUMMY_KEY), pointer('tail', tail), pointer('a', listA[i] ?? NULL_KEY), pointer('b', listB[j] ?? B_NULL)]
	const vars = () => ({ a: name(listA[i]), b: name(listB[j]), tail: tail === DUMMY_KEY ? 'dummy' : name(tail) })
	const frames: Frame[] = [
		{ scene: scene(), pointers: pointers(), caption: 'dummy = a new node, tail = dummy: the merged list will hang off dummy', line: 'start', vars: vars() },
	]
	const takes: number[] = []
	while (i < listA.length && j < listB.length) {
		const [x, y] = [listA[i], listB[j]]
		const fromA = compareKeys(value.get(x)!, value.get(y)!) <= 0
		const took = fromA ? x : y
		const [from, other] = fromA ? ['a', 'b'] : ['b', 'a']
		frames.push({
			scene: scene(),
			pointers: pointers(),
			flash: { [x]: LOOK, [y]: LOOK },
			caption: `a.value ${name(x)} ${fromA ? '≤' : '>'} b.value ${name(y)}: ${from} is ${fromA ? 'not bigger' : 'smaller'}`,
			line: 'compare',
			vars: vars(),
		})
		targets[next(tail)] = took
		order.push(took)
		takes.push(frames.length)
		frames.push({
			scene: scene(),
			pointers: pointers(),
			flash: { [x]: null, [y]: null, [took]: FOUND, [edgeMark(next(tail))]: CHANGED },
			caption: `tail.next = ${from} (${name(took)}), ${other} stays where it is`,
			line: fromA ? 'take-a' : 'take-b',
			vars: vars(),
		})
		if (fromA) i++
		else j++
		frames.push({
			scene: scene(),
			pointers: pointers(),
			flash: { [edgeMark(next(tail))]: null },
			caption: `${from} = ${from}.next (${name(fromA ? listA[i] : listB[j])})`,
			line: fromA ? 'next-a' : 'next-b',
			vars: vars(),
		})
		tail = took
		frames.push({ scene: scene(), pointers: pointers(), caption: `tail = tail.next (${name(tail)}): the merged list so far ends here`, line: 'advance', vars: vars() })
	}
	// One of them has run out; what is left of the other is sorted and goes on the end as it is.
	const restOfA = i < listA.length
	const rest = restOfA ? listA.slice(i) : listB.slice(j)
	targets[next(tail)] = rest[0]
	order.push(...rest)
	frames.push({
		scene: scene(),
		pointers: pointers(),
		flash: { [rest[0]]: FOUND, [edgeMark(next(tail))]: CHANGED },
		caption: `${restOfA ? 'b' : 'a'} is null: tail.next = ${restOfA ? 'a' : 'b'}, the rest of it (${rest.map(name).join(', ')}), already in order`,
		line: 'rest',
		vars: vars(),
	})
	// head = merge(a, b): a new head only if b's first node was the smaller.
	const newHead = order[0] !== listA[0]
	targets[HEAD_EDGE] = order[0]
	frames.push({
		scene: scene(),
		pointers: [pointer('dummy', DUMMY_KEY)],
		flash: { [edgeMark(next(tail))]: null, ...(newHead ? { [edgeMark(HEAD_EDGE)]: CHANGED } : {}) },
		caption: `return dummy.next: head = ${name(order[0])}${newHead ? '' : ' (as before)'}, all ${order.length} nodes in order, re-pointed, none copied`,
		line: 'done',
	})
	const asked = asking(frames, 'Merge two sorted lists: where do dummy, tail, a and b start?')
	for (const k of takes) asked[k] = { ...asked[k], ask: 'Which does tail.next take: a or b?' }
	return {
		frames: asked,
		nodes: order.map((id) => ({ id, value: value.get(id)!, dx: 0, dy: 0 })),
		finalFlash: Object.fromEntries(order.map((id) => [id, FOUND])),
		code: 'list-merge',
	}
}
