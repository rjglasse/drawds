import { Vec, type TLShapePartial, type VecLike } from 'tldraw'
import { pruneMarks } from '../../cells/marks'
import { fillValues } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import { GROW_HANDLE_ID, GROW_START_HANDLE_ID, grownCount } from '../../controls/grow'
import type { PointerDirection } from '../../cells/CellShapeUtil'
import { ControlButton } from '../../controls/ControlButton'
import { routeScene, valueBox } from '../../nodelink/geometry'
import { insertValue } from '../../data/fill'
import { NodeLinkShapeUtil, type NodeOperation } from '../../nodelink/NodeLinkShapeUtil'
import { playOperation } from '../../nodelink/playback'
import type { Scene, SceneEdge } from '../../nodelink/scene'
import type { PointerAnchor } from '../../pointers/layout'
import { prunePointers } from '../../pointers/pointers'
import {
	NULL_KEY,
	SENTINEL_KEY,
	chainKeys,
	getListMetrics,
	listVariant,
	listAxis,
	listBasePosition,
	listGrowPoint,
	listScene,
	listStartGripPoint,
} from './layout'
import {
	LIST_SHAPE_TYPE,
	listShapeMigrations,
	listShapeProps,
	type ListNode,
	type ListShape,
} from './list-shape-types'
import { anchorShift, insertListNode, removeListNode, resizeList } from './ops'
import { dequeueFrom, enqueueOnto, peekAt, popFrom, pushOnto } from './stack-queue'
import {
	appendToList,
	deleteFromList,
	detectCycle,
	endTidied,
	findInList,
	findMiddle,
	insertIntoList,
	insertSorted,
	printBackwards,
	printList,
	reverseList,
	type ListOperation,
} from './operations'

export class ListShapeUtil extends NodeLinkShapeUtil<ListShape> implements Refillable {
	static override type = LIST_SHAPE_TYPE
	static override props = listShapeProps
	static override migrations = listShapeMigrations

	getDefaultProps(): ListShape['props'] {
		return {
			nodes: [{ id: 'n0', value: '', dx: 0, dy: 0 }],
			direction: 'right',
			fill: 'random',
			range: 'medium',
			seed: 0,
			marks: {},
			pointers: [],
			links: 'singly',
			tail: 'none',
			ends: 'null',
			sentinel: 'none',
			cycleTo: '',
			kind: 'list',
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	/** Switching a variant (doubly, tail, circular, sentinel, kind) redraws the list with its head where it was. */
	override onBeforeUpdate(prev: ListShape, next: ListShape): ListShape | void {
		const variants = ['links', 'tail', 'ends', 'sentinel', 'cycleTo', 'kind'] as const
		let shape = next
		if (variants.some((k) => prev.props[k] !== next.props[k]) && prev.props.nodes === next.props.nodes) {
			const shift = Vec.Rot(anchorShift(prev.props, next.props), next.rotation)
			shape = { ...next, x: next.x + shift.x, y: next.y + shift.y }
		}
		return super.onBeforeUpdate(prev, shape) ?? (shape === next ? undefined : shape)
	}

	buildScene(shape: ListShape) {
		return listScene(shape.props)
	}

	setNodeValue(shape: ListShape, key: string, value: string) {
		return this.updateNodes(shape, (n) => (n.id === key ? { ...n, value } : n))
	}

	moveNode(shape: ListShape, key: string, to: VecLike): TLShapePartial<ListShape> {
		const base = listBasePosition(shape.props, key)
		if (!base) return { id: shape.id, type: LIST_SHAPE_TYPE }
		return this.updateNodes(shape, (n) => (n.id === key ? { ...n, dx: to.x - base.x, dy: to.y - base.y } : n))
	}

	resetLayout(shape: ListShape) {
		return this.updateNodes(shape, (n) => ({ ...n, dx: 0, dy: 0 }))
	}

	hasManualLayout(shape: ListShape) {
		return shape.props.nodes.some((n) => n.dx !== 0 || n.dy !== 0)
	}

	/** A grip before the head (insert at head) and one past null (append at the tail). */
	getGrowGrips(shape: ListShape) {
		return [
			{ id: GROW_START_HANDLE_ID, at: listStartGripPoint(shape.props) },
			{ id: GROW_HANDLE_ID, at: listGrowPoint(shape.props) },
		]
	}

	/** Dragging a grip outwards adds nodes at that end; dragging it back removes them. */
	growTo(shape: ListShape, initial: ListShape, gripId: string, to: VecLike): TLShapePartial<ListShape> {
		const atStart = gripId === GROW_START_HANDLE_ID
		const { nodes, direction, size } = initial.props
		const axis = listAxis(direction)
		const away = atStart ? { x: -axis.x, y: -axis.y } : axis
		const from = atStart ? listStartGripPoint(initial.props) : listGrowPoint(initial.props)
		const count = grownCount(nodes.length, from, to, away, getListMetrics(size, initial.props.links === 'doubly').step)
		return this.withNodes(shape, initial, resizeList(initial.props, count, atStart))
	}

	removeNode(shape: ListShape, key: string) {
		return this.withNodes(shape, shape, removeListNode(shape.props.nodes, key))
	}

	/**
	 * A + on every next pointer (including the tail's pointer to null) inserts after its node. Not on
	 * a stack or queue, which only change at their ends (push and pop, enqueue and dequeue).
	 */
	canInsertOnEdge(shape: ListShape, edge: SceneEdge) {
		return shape.props.kind === 'list' && edge.fromPointer === true
	}

	insertOnEdge(shape: ListShape, edgeKey: string) {
		const edge = this.getScene(shape).edges.find((e) => e.key === edgeKey)
		if (!edge) return undefined
		const { nodes, id } = insertListNode(shape.props, edge.from)
		return { update: this.withNodes(shape, shape, nodes), key: id }
	}

	/** A list keeps at least one node; delete the shape to remove it entirely. A stack or queue pops or dequeues. */
	canRemoveNode(shape: ListShape) {
		return shape.props.kind === 'list' && shape.props.nodes.length > 1
	}

	// Pointers (curr, prev...) sit below the list (right of a vertical one), clear of the head label,
	// pointing at the value compartment. The arrow along the list steps to the next node, then null.

	protected override pointerAnchorIn(shape: ListShape, scene: Scene, key: string): PointerAnchor | undefined {
		const anchor = super.pointerAnchorIn(shape, scene, key)
		const node = anchor && scene.nodes.find((n) => n.key === key)
		if (!anchor || !node) return undefined
		const side = listAxis(shape.props.direction).y === 0 ? 'below' : 'right'
		return { box: node.pointer ? valueBox(node) : anchor.box, side }
	}

	override pointerStep(shape: ListShape, key: string, direction: PointerDirection): string | undefined {
		const v = listVariant(shape.props, shape.props.nodes)
		const ends = v.circular || v.cycleTo ? [] : [NULL_KEY]
		const keys = [...chainKeys(shape.props), ...ends]
		const i = keys.indexOf(key)
		const axis = listAxis(shape.props.direction)
		const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[direction]
		const along = d[0] * axis.x + d[1] * axis.y
		if (i < 0 || !along) return undefined
		// Round and round a circular list; on from the last node into a cycle.
		if (v.circular) return keys[(i + along + keys.length) % keys.length]
		return v.cycleTo && along > 0 && i === keys.length - 1 ? v.cycleTo : keys[i + along]
	}

	pointerNames() {
		return ['curr', 'prev', 'next', 'tail']
	}

	// Operations step by step, from a node's context menu: find, insert, delete, reverse, each
	// assignment narrated as code with curr / prev / next walking along. (The x and + buttons stay
	// as the quick edits.) Shift at the end keeps the highlights as marks.

	nodeOperations(shape: ListShape, key: string): NodeOperation[] {
		const { nodes, kind } = shape.props
		const node = nodes.find((n) => n.id === key)
		// A stack or queue offers only its own operations (shapeOperations), wherever it is clicked.
		if (!node || kind !== 'list') return []
		const submenu = 'Step by step'
		const run = (label: string, op: () => ListOperation) => () => this.play(shape.id, label, op)
		const props = () => (this.editor.getShape(shape.id) as ListShape | undefined)?.props ?? shape.props
		const v = listVariant(shape.props, nodes)
		// Walks that run off the end (finding the middle, reversing) never end round a circle or a cycle.
		const ends = !v.circular && !v.cycleTo
		// The last node's next pointed back into the list: a cycle (rho-shaped), for cycle detection.
		// Not on a circular list, whose last node already points at the first.
		const cycle: NodeOperation[] = v.circular
			? []
			: [
					...(v.cycleTo === key ? [] : [{ id: 'list-make-cycle', label: `Make a cycle: last.next = ${node.value}`, run: () => this.setCycle(shape.id, key) }]),
					...(v.cycleTo ? [{ id: 'list-remove-cycle', label: 'Remove the cycle: last.next = null', run: () => this.setCycle(shape.id, '') }] : []),
				]
		return [
			...cycle,
			{ id: 'list-find', label: `Find ${node.value}`, submenu, run: run('find', () => findInList(props(), node.value)) },
			{
				id: 'list-find-value',
				label: 'Find a value',
				prompt: 'Value to find',
				submenu,
				run: (value) => value !== undefined && this.play(shape.id, 'find', () => findInList(props(), value)),
			},
			...(ends ? [{ id: 'list-middle', label: 'Find the middle (slow and fast)', submenu, run: run('find the middle', () => findMiddle(props())) }] : []),
			{ id: 'list-floyd', label: 'Is there a cycle? (slow and fast)', submenu, run: run('cycle detection', () => detectCycle(props())) },
			{ id: 'list-insert-after', label: `Insert after ${node.value}`, submenu, run: run('insert', () => this.insertOp(props(), key)) },
			{
				id: 'list-insert-sorted',
				label: 'Insert in order',
				prompt: 'Value to insert',
				submenu,
				run: (value) => value !== undefined && this.play(shape.id, 'insert', () => insertSorted(props(), this.newId(props()), value)),
			},
			{
				id: 'list-insert-head',
				label: v.sentinel ? 'Insert at the front (after the sentinel)' : 'Insert at the head',
				submenu,
				run: run('insert', () => this.insertOp(props(), undefined)),
			},
			...(nodes.length > 1
				? [{ id: 'list-delete', label: `Delete ${node.value}`, submenu, run: run('delete', () => deleteFromList(props(), key)) }]
				: []),
			...(nodes.length > 1 && ends ? [{ id: 'list-reverse', label: 'Reverse the list', submenu, run: run('reverse', () => reverseList(props())) }] : []),
			// A list with a cycle has no end to append at or print to.
			...(v.cycleTo
				? []
				: [
						{
							id: 'list-append',
							label: v.tail ? 'Append at the end (with the tail)' : 'Append at the end (walk there)',
							submenu,
							run: run('append', () => this.appendOp(props())),
						},
						{ id: 'list-print', label: 'Print the list', submenu, run: run('print', () => printList(props())) },
						...(v.doubly ? [{ id: 'list-print-back', label: 'Print backwards', submenu, run: run('print backwards', () => printBackwards(props())) }] : []),
					]),
		]
	}

	// A stack pushes and pops at its top (the head); a queue enqueues at its rear (a tail pointer) and
	// dequeues at its front. Offered wherever the shape is right-clicked, even when it is empty, and
	// as the + and x beside the top, or the rear and front (renderStructureControls).

	override shapeOperations(shape: ListShape): NodeOperation[] {
		const { kind, nodes } = shape.props
		if (kind === 'list') return []
		const id = shape.id
		const props = () => (this.editor.getShape(id) as ListShape | undefined)?.props ?? shape.props
		const run = (label: string, op: () => ListOperation) => () => this.play(id, label, op)
		const promptAt = nodes[0]?.id ?? NULL_KEY
		if (kind === 'stack') {
			const stack = { submenu: 'Stack', submenuId: 'list-stack' }
			const push = (value: string) => this.play(id, 'push', () => pushOnto(props(), this.newId(props()), value))
			return [
				{ ...stack, id: 'list-push', label: 'Push', run: () => push(this.endValue(props(), 'front')) },
				{ ...stack, id: 'list-push-value', label: 'Push a value', prompt: 'Value to push', promptAt, run: (value) => value !== undefined && push(value) },
				{ ...stack, id: 'list-pop', label: 'Pop', run: run('pop', () => popFrom(props())) },
				{ ...stack, id: 'list-peek', label: 'Peek', run: run('peek', () => peekAt(props())) },
			]
		}
		const queue = { submenu: 'Queue', submenuId: 'list-queue' }
		const enqueue = (value: string) => this.play(id, 'enqueue', () => enqueueOnto(props(), this.newId(props()), value))
		return [
			{ ...queue, id: 'list-enqueue', label: 'Enqueue', run: () => enqueue(this.endValue(props(), 'end')) },
			{
				...queue,
				id: 'list-enqueue-value',
				label: 'Enqueue a value',
				prompt: 'Value to enqueue',
				promptAt: nodes.at(-1)?.id ?? NULL_KEY,
				run: (value) => value !== undefined && enqueue(value),
			},
			{ ...queue, id: 'list-dequeue', label: 'Dequeue', run: run('dequeue', () => dequeueFrom(props())) },
			{ ...queue, id: 'list-peek', label: 'Peek', run: run('peek', () => peekAt(props())) },
		]
	}

	/** A stack's + (push) and x (pop) at its top; a queue's + on the rear's next arrow and x on its front. */
	protected override renderStructureControls(shape: ListShape, colors: Parameters<typeof ControlButton>[0]['colors']) {
		const { kind, nodes } = shape.props
		if (kind === 'list') return null
		const scene = this.getScene(shape)
		const nudge = 5 / this.editor.getZoomLevel()
		// The first node, or the null an empty stack or queue points at.
		const first = scene.nodes.find((n) => n.key === (nodes[0]?.id ?? NULL_KEY))
		if (!first) return null
		const corner = (side: -1 | 1) => ({ x: first.x + side * (first.w / 2 + nudge), y: first.y - first.h / 2 - nudge })
		const ops = this.shapeOperations(shape)
		const button = (testId: string, type: 'insert' | 'remove', at: VecLike, label: string, opId: string) => (
			<ControlButton
				key={testId}
				editor={this.editor}
				kind={type}
				at={at}
				label={label}
				testId={testId}
				colors={colors}
				onPress={() => ops.find((op) => op.id === opId)?.run()}
			/>
		)
		if (kind === 'stack') {
			return (
				<>
					{button('stack-push', 'insert', corner(-1), 'Push (node.next = top; top = node)', 'list-push')}
					{nodes.length > 0 && button('stack-pop', 'remove', corner(1), 'Pop the top value', 'list-pop')}
				</>
			)
		}
		const rearArrow = nodes.length ? routeScene(scene).get(`${nodes[nodes.length - 1].id}->`) : undefined
		return (
			<>
				{button('queue-enqueue', 'insert', rearArrow?.labelAt ?? corner(-1), 'Enqueue at the rear (rear.next = node; rear = node)', 'list-enqueue')}
				{nodes.length > 0 && button('queue-dequeue', 'remove', corner(1), 'Dequeue from the front', 'list-dequeue')}
			</>
		)
	}

	/** A new value that fits the fill mode, for the front (push) or the end (enqueue). */
	private endValue(props: ListShape['props'], at: 'front' | 'end') {
		const { nodes, fill, seed, range } = props
		const values = nodes.map((n) => n.value)
		const index = Number(this.newId(props).slice(1))
		return at === 'front'
			? insertValue(undefined, nodes[0]?.value, fill, seed, index, values, range)
			: insertValue(nodes.at(-1)?.value, undefined, fill, seed, index, values, range)
	}

	/** Point the last node's next at `cycleTo` (a node id), or back at null (''); one undo step. */
	private setCycle(id: ListShape['id'], cycleTo: string) {
		this.editor.markHistoryStoppingPoint(cycleTo ? 'make a cycle' : 'remove the cycle')
		this.editor.updateShape<ListShape>({ id, type: LIST_SHAPE_TYPE, props: { cycleTo } })
	}

	/** Append a new node with a value that fits the fill mode. */
	private appendOp(props: ListShape['props']): ListOperation {
		const { nodes, fill, seed, range } = props
		const index = Number(this.newId(props).slice(1))
		const value = insertValue(nodes[nodes.length - 1]?.value, undefined, fill, seed, index, nodes.map((n) => n.value), range)
		return appendToList(props, `n${index}`, value)
	}

	/** An id no node has: one past the highest. */
	private newId({ nodes }: Pick<ListShape['props'], 'nodes'>) {
		return `n${1 + Math.max(-1, ...nodes.map((n) => Number(n.id.slice(1))).filter(Number.isFinite))}`
	}

	/** Insert a new node with a value that fits the fill mode (as the + on an arrow does). */
	private insertOp(props: ListShape['props'], afterId: string | undefined): ListOperation {
		const { nodes, fill, seed, range } = props
		const i = afterId === undefined ? -1 : nodes.findIndex((n) => n.id === afterId)
		const index = Number(this.newId(props).slice(1))
		const value = insertValue(
			nodes[i]?.value,
			nodes[i + 1]?.value,
			fill,
			seed,
			index,
			nodes.map((n) => n.value),
			range
		)
		return insertIntoList(props, afterId, `n${index}`, value)
	}

	private play(id: ListShape['id'], label: string, operation: () => ListOperation) {
		const shape = this.editor.getShape(id) as ListShape | undefined
		if (!shape) return
		const { frames, nodes, direction, finalFlash } = operation()
		const final = nodes && this.withNodes(shape, shape, nodes, direction)
		playOperation(this.editor, {
			shapeId: id,
			label,
			// Ending on the list as the result draws it, so nothing jumps when it goes in.
			frames: final ? endTidied(shape.props, { ...shape.props, ...final.props }, frames) : frames,
			final,
			finalFlash,
			// Shift: the highlights become marks, on the nodes still in the list.
			withMarks: (_update, highlights) => {
				const keep = (nodes ?? shape.props.nodes).map((n) => n.id)
				const marks = pruneMarks({ ...shape.props.marks, ...highlights }, keep)
				return final ? { ...final, props: { ...final.props, marks } } : this.withMarks(shape, marks)
			},
		})
	}

	/**
	 * New nodes, positioned so the first surviving node of `initial` stays put on the page; marks and
	 * pointers on removed nodes go with them.
	 */
	private withNodes(
		shape: ListShape,
		initial: ListShape,
		nodes: ListNode[],
		direction = initial.props.direction
	): TLShapePartial<ListShape> {
		const shift = Vec.Rot(anchorShift(initial.props, { ...initial.props, nodes, direction }), initial.rotation)
		const marks = pruneMarks(
			initial.props.marks,
			nodes.map((n) => n.id)
		)
		const pointers = prunePointers(initial.props.pointers, [...nodes.map((n) => n.id), NULL_KEY, SENTINEL_KEY])
		// A cycle into a node that has gone is gone too.
		const cycleTo = nodes.some((n) => n.id === initial.props.cycleTo) ? initial.props.cycleTo : ''
		return {
			id: shape.id,
			type: LIST_SHAPE_TYPE,
			x: initial.x + shift.x,
			y: initial.y + shift.y,
			props: { nodes, marks, pointers, direction, cycleTo },
		}
	}

	refill(shape: ListShape) {
		const { fill, seed, nodes, range } = shape.props
		const values = fillValues(fill, seed, nodes.length, { range })
		return this.updateNodes(shape, (n, i) => ({ ...n, value: values[i] }))
	}

	private updateNodes(shape: ListShape, f: (node: ListNode, i: number) => ListNode): TLShapePartial<ListShape> {
		return { id: shape.id, type: LIST_SHAPE_TYPE, props: { nodes: shape.props.nodes.map(f) } }
	}
}
