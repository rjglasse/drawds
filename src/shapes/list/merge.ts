import { compareKeys } from '../../data/compare'
import type { Frame } from '../../nodelink/playback'
import { translateScene, type Scene, type SceneEdge, type SceneNode } from '../../nodelink/scene'
import { HEAD_KEY, NULL_KEY, getListMetrics, listAxis, listScene, listVariant } from './layout'
import type { ListNode } from './list-shape-types'
import { BACK_BEND, CHANGED, FOUND, HEAD_EDGE, LOOK, asking, edgeMark, next, nodeOf, pointer, retarget, type ListOperation, type ListProps } from './operations'

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

// Merge sort on a linked list: find the middle (slow and fast), cut the list there, sort each half,
// merge them. Drawn as the recursion goes: a cut list's halves drop a row (a little apart, room for
// each one's null); merging two halves re-points their arrows from a dummy node in the row above,
// then the merged list rises into it, in order, where the list it was cut from had been.

/** Whether merge sort is offered: a plain singly linked list (no tail, sentinel, circle or cycle) of two nodes or more. */
export function canMergeSort(props: ListProps): boolean {
	const v = listVariant(props, props.nodes)
	return props.nodes.length > 1 && v.kind === 'list' && !v.doubly && !v.tail && !v.circular && !v.sentinel && !v.cycleTo
}

/** A run of the list at a depth of the recursion: its nodes in link order, from column `lo` on. */
interface Run {
	ids: string[]
	lo: number
	depth: number
}

export function mergeSortList(props: ListProps): ListOperation & { nodes: ListNode[] } {
	const base = listScene(props)
	const m = getListMetrics(props.size)
	const axis = listAxis(props.direction)
	const horizontal = axis.y === 0
	const across = horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 }
	const template = nodeOf(base, props.nodes[0].id)
	const nullNode = nodeOf(base, NULL_KEY)
	const label = base.nodes.filter((n) => n.kind === 'label')
	const value = new Map(props.nodes.map((n) => [n.id, n.value]))
	const name = (id: string | undefined) => (id === undefined ? 'null' : value.get(id)!)
	const names = (ids: readonly string[]) => ids.map(name).join(' ')
	// Rows far enough apart for the pointers under a row and a dummy above it; cut runs a null's room apart.
	const rowH = (horizontal ? m.nodeH : m.nodeW) + m.nodeH * 1.6
	const gapW = (horizontal ? nullNode.w : nullNode.h) + m.gap * 0.5

	// Where every cut is made, and at which depth (the recursion is the same whatever the values).
	const cuts = new Map<number, number>()
	const plan = (lo: number, n: number, depth: number) => {
		if (n < 2) return
		const half = Math.floor((n - 1) / 2) + 1
		cuts.set(lo + half, depth + 1)
		plan(lo, half, depth + 1)
		plan(lo + half, n - half, depth + 1)
	}
	plan(0, props.nodes.length, 0)
	const at = (column: number, depth: number) => {
		const gaps = [...cuts].filter(([c, d]) => c <= column && d <= depth).length
		const along = column * m.step + gaps * gapW
		return { x: template.x + axis.x * along + across.x * depth * rowH, y: template.y + axis.y * along + across.y * depth * rowH }
	}
	const nullKey = (run: Run) => `#null-${run.lo}-${run.depth}`

	let runs: Run[] = [{ ids: props.nodes.map((n) => n.id), lo: 0, depth: 0 }]
	let headTo = props.nodes[0].id
	/** The scene: every run where it is; a merge's dummy (above its runs) and the arrows it has re-pointed. */
	const scene = (merging?: { dummy: { x: number; y: number }; targets: Record<string, string> }): Scene => {
		const nodes: SceneNode[] = [...label]
		const edges: SceneEdge[] = [{ key: HEAD_EDGE, from: HEAD_KEY, to: headTo, directed: true }]
		for (const run of runs) {
			run.ids.forEach((id, k) => nodes.push({ ...template, key: id, value: value.get(id)!, ...at(run.lo + k, run.depth), editable: false, draggable: false }))
			const end = at(run.lo + run.ids.length - 1, run.depth)
			const along = (horizontal ? template.w / 2 + nullNode.w / 2 : template.h / 2 + nullNode.h / 2) + m.gap
			nodes.push({ ...nullNode, key: nullKey(run), x: end.x + axis.x * along, y: end.y + axis.y * along })
			run.ids.forEach((id, k) => edges.push({ key: next(id), from: id, to: run.ids[k + 1] ?? nullKey(run), directed: true, fromPointer: true }))
		}
		if (!merging) return { ...base, nodes, edges }
		nodes.push({ ...template, key: DUMMY_KEY, value: '', ...merging.dummy, editable: false, draggable: false })
		const linked = merging.targets[next(DUMMY_KEY)] ? [{ key: next(DUMMY_KEY), from: DUMMY_KEY, to: merging.targets[next(DUMMY_KEY)], directed: true, fromPointer: true }] : []
		// Both halves lie in one row: an arrow back along it, or past the next node, curves round the
		// nodes between (back ones one way, forward ones the other).
		const where = new Map(nodes.map((n) => [n.key, n]))
		const bends = Object.fromEntries(
			Object.entries(merging.targets).flatMap(([key, to]) => {
				const [a, b] = [where.get(key.slice(0, -2)), where.get(to)]
				if (!a || !b) return []
				const [along, off] = [(b.x - a.x) * axis.x + (b.y - a.y) * axis.y, Math.abs((b.x - a.x) * across.x + (b.y - a.y) * across.y)]
				return off < 1 && (along < 0 || along > m.step * 1.5) ? [[key, along < 0 ? BACK_BEND : -BACK_BEND]] : []
			})
		)
		return retarget({ ...base, nodes, edges: [...edges, ...linked] }, merging.targets, bends)
	}

	const frames: Frame[] = []
	const takes: number[] = []
	// A cut is lit for its own step: the next step puts it out.
	let cut: string | undefined
	const push = (frame: Frame) => {
		frames.push(cut ? { ...frame, flash: { [cut]: null, ...frame.flash } } : frame)
		cut = undefined
	}
	const sort = (run: Run): string[] => {
		const { ids, lo, depth } = run
		if (ids.length < 2) {
			push({ scene: scene(), flash: { [ids[0]]: FOUND }, caption: `merge_sort(${names(ids)}): one node, already sorted`, line: 'base' })
			return ids
		}
		// slow and fast from head and head.next: slow stops on the last node of the first half.
		const half = Math.floor((ids.length - 1) / 2) + 1
		const [slow, fast] = [ids[half - 1], ids[2 * half - 1]]
		push({
			scene: scene(),
			pointers: [pointer('slow', slow), pointer('fast', fast ?? nullKey(run))],
			flash: { [slow]: LOOK },
			caption: `merge_sort(${names(ids)}): slow and fast walk; fast ${fast ? 'has no next' : 'is null'}, so slow (${name(slow)}) ends the first half`,
			line: 'middle',
			vars: { slow: name(slow), fast: name(fast) },
		})
		const [left, right]: Run[] = [
			{ ids: ids.slice(0, half), lo, depth: depth + 1 },
			{ ids: ids.slice(half), lo: lo + half, depth: depth + 1 },
		]
		runs = [...runs.filter((r) => r !== run), left, right]
		push({
			scene: scene(),
			pointers: [pointer('right', right.ids[0])],
			flash: { [slow]: null, [edgeMark(next(slow))]: CHANGED },
			caption: `right = slow.next (${name(right.ids[0])}), slow.next = null: cut in two, ${names(left.ids)} and ${names(right.ids)}`,
			line: 'split',
		})
		cut = edgeMark(next(slow))
		const sortedLeft = sort(left)
		const a = runs.find((r) => r.lo === left.lo && r.depth === left.depth)!
		const sortedRight = sort(right)
		const b = runs.find((r) => r.lo === right.lo && r.depth === right.depth)!
		// Merge them, re-pointing arrows from a dummy where the merged run will go.
		const merging = { dummy: at(lo, depth), targets: {} as Record<string, string> }
		let [i, j, tail] = [0, 0, DUMMY_KEY]
		const pointers = () => [pointer('tail', tail), pointer('a', sortedLeft[i] ?? nullKey(a)), pointer('b', sortedRight[j] ?? nullKey(b))]
		const vars = () => ({ a: name(sortedLeft[i]), b: name(sortedRight[j]), tail: tail === DUMMY_KEY ? 'dummy' : name(tail) })
		push({
			scene: scene(merging),
			pointers: pointers(),
			caption: `merge(${names(sortedLeft)}, ${names(sortedRight)}): dummy = a new node, tail = dummy`,
			line: 'start',
			vars: vars(),
		})
		const order: string[] = []
		let lit: string | undefined
		while (i < sortedLeft.length && j < sortedRight.length) {
			const [x, y] = [sortedLeft[i], sortedRight[j]]
			const fromA = compareKeys(name(x), name(y)) <= 0
			const took = fromA ? x : y
			merging.targets[next(tail)] = took
			order.push(took)
			const edge = edgeMark(next(tail))
			if (fromA) i++
			else j++
			tail = took
			takes.push(frames.length)
			push({
				scene: scene(merging),
				pointers: pointers(),
				flash: { ...(lit ? { [lit]: null } : {}), [edge]: CHANGED },
				caption: `${name(x)} ${fromA ? '≤' : '>'} ${name(y)}: tail.next = ${fromA ? 'a' : 'b'} (${name(took)}); ${fromA ? 'a' : 'b'} and tail move on`,
				line: fromA ? 'take-a' : 'take-b',
				vars: vars(),
			})
			lit = edge
		}
		const rest = i < sortedLeft.length ? sortedLeft.slice(i) : sortedRight.slice(j)
		const restEdge = edgeMark(next(tail))
		merging.targets[next(tail)] = rest[0]
		order.push(...rest)
		push({
			scene: scene(merging),
			pointers: pointers(),
			flash: { ...(lit ? { [lit]: null } : {}), [restEdge]: CHANGED },
			caption: `${i < sortedLeft.length ? 'b' : 'a'} is null: tail.next = the rest (${names(rest)})`,
			line: 'rest',
			vars: vars(),
		})
		// The merged run, in order, up where the run it was cut from was.
		const merged: Run = { ids: order, lo, depth }
		runs = [...runs.filter((r) => r !== a && r !== b), merged]
		// head = merge_sort(head): the list's head moves only when the whole of it is sorted.
		if (depth === 0) headTo = order[0]
		push({
			scene: scene(),
			flash: { [restEdge]: null },
			caption: `return merge(...): ${names(order)}, sorted, up a level`,
			line: 'merge',
		})
		return order
	}
	const sorted = sort(runs[0])
	const asked = asking(frames, 'Merge sort: where is the middle of the list?')
	for (const k of takes) asked[k] = { ...asked[k], ask: 'Which does tail.next take: a or b?' }
	return {
		frames: asked,
		nodes: sorted.map((id) => ({ id, value: value.get(id)!, dx: 0, dy: 0 })),
		code: 'list-merge-sort',
	}
}
