import { Vec, type TLShapePartial, type VecLike } from 'tldraw'
import { pruneMarks } from '../../cells/marks'
import { fillValues } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import { GROW_HANDLE_ID, GROW_START_HANDLE_ID, grownCount } from '../../controls/grow'
import { NodeLinkShapeUtil } from '../../nodelink/NodeLinkShapeUtil'
import type { SceneEdge } from '../../nodelink/scene'
import {
	getListMetrics,
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

export class ListShapeUtil extends NodeLinkShapeUtil<ListShape> implements Refillable {
	static override type = LIST_SHAPE_TYPE
	static override props = listShapeProps
	static override migrations = listShapeMigrations

	getDefaultProps(): ListShape['props'] {
		return {
			nodes: [{ id: 'n0', value: '', dx: 0, dy: 0 }],
			direction: 'right',
			fill: 'random',
			seed: 0,
			marks: {},
			color: 'black',
			size: 'm',
			font: 'mono',
		}
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
		const count = grownCount(nodes.length, from, to, away, getListMetrics(size).step)
		return this.withNodes(shape, initial, resizeList(initial.props, count, atStart))
	}

	removeNode(shape: ListShape, key: string) {
		return this.withNodes(shape, shape, removeListNode(shape.props.nodes, key))
	}

	/** A + on every next pointer (including the tail's pointer to null) inserts after its node. */
	canInsertOnEdge(_shape: ListShape, edge: SceneEdge) {
		return !!edge.fromPointer
	}

	insertOnEdge(shape: ListShape, edgeKey: string) {
		const edge = this.getScene(shape).edges.find((e) => e.key === edgeKey)
		if (!edge) return undefined
		const { nodes, id } = insertListNode(shape.props, edge.from)
		return { update: this.withNodes(shape, shape, nodes), key: id }
	}

	/** A list keeps at least one node; delete the shape to remove it entirely. */
	canRemoveNode(shape: ListShape) {
		return shape.props.nodes.length > 1
	}

	/**
	 * New nodes, positioned so the first surviving node of `initial` stays put on the page; marks on
	 * removed nodes go with them.
	 */
	private withNodes(shape: ListShape, initial: ListShape, nodes: ListNode[]): TLShapePartial<ListShape> {
		const shift = Vec.Rot(anchorShift(initial.props, { ...initial.props, nodes }), initial.rotation)
		const marks = pruneMarks(
			initial.props.marks,
			nodes.map((n) => n.id)
		)
		return { id: shape.id, type: LIST_SHAPE_TYPE, x: initial.x + shift.x, y: initial.y + shift.y, props: { nodes, marks } }
	}

	refill(shape: ListShape) {
		const { fill, seed, nodes } = shape.props
		const values = fillValues(fill, seed, nodes.length)
		return this.updateNodes(shape, (n, i) => ({ ...n, value: values[i] }))
	}

	private updateNodes(shape: ListShape, f: (node: ListNode, i: number) => ListNode): TLShapePartial<ListShape> {
		return { id: shape.id, type: LIST_SHAPE_TYPE, props: { nodes: shape.props.nodes.map(f) } }
	}
}
