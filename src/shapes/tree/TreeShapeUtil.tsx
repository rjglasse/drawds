import { Vec, type TLShapePartial, type VecLike } from 'tldraw'
import { pruneMarks } from '../../cells/marks'
import { fillValues, insertValue } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import { NodeLinkShapeUtil } from '../../nodelink/NodeLinkShapeUtil'
import { treeBasePosition, treeRootCentre, treeScene } from './layout'
import { addChild, levelOrder, removeSubtree } from './model'
import {
	TREE_SHAPE_TYPE,
	treeShapeMigrations,
	treeShapeProps,
	type TreeNode,
	type TreeShape,
} from './tree-shape-types'

export class TreeShapeUtil extends NodeLinkShapeUtil<TreeShape> implements Refillable {
	static override type = TREE_SHAPE_TYPE
	static override props = treeShapeProps
	static override migrations = treeShapeMigrations

	getDefaultProps(): TreeShape['props'] {
		return {
			nodes: [{ id: 'n', value: '', children: [null, null], dx: 0, dy: 0 }],
			nulls: 'hide',
			fill: 'random',
			seed: 0,
			marks: {},
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	buildScene(shape: TreeShape) {
		return treeScene(shape.props)
	}

	setNodeValue(shape: TreeShape, key: string, value: string) {
		return this.update(shape, shape.props.nodes.map((n) => (n.id === key ? { ...n, value } : n)))
	}

	moveNode(shape: TreeShape, key: string, to: VecLike): TLShapePartial<TreeShape> {
		const base = treeBasePosition(shape.props, key)
		if (!base) return { id: shape.id, type: TREE_SHAPE_TYPE }
		return this.update(
			shape,
			shape.props.nodes.map((n) => (n.id === key ? { ...n, dx: to.x - base.x, dy: to.y - base.y } : n))
		)
	}

	resetLayout(shape: TreeShape) {
		return this.update(shape, shape.props.nodes.map((n) => ({ ...n, dx: 0, dy: 0 })))
	}

	hasManualLayout(shape: TreeShape) {
		return shape.props.nodes.some((n) => n.dx !== 0 || n.dy !== 0)
	}

	/** Regenerate values in level order. */
	refill(shape: TreeShape) {
		const { fill, seed, nodes } = shape.props
		const order = levelOrder(nodes)
		const values = new Map(fillValues(fill, seed, order.length).map((v, i) => [order[i].id, v]))
		return this.update(shape, nodes.map((n) => ({ ...n, value: values.get(n.id) ?? n.value })))
	}

	// Live edits: x removes a node's subtree (not the root: delete the shape for that), and + on a
	// node's lower corners adds a child in an empty slot. The root stays put on the page.

	canRemoveNode(shape: TreeShape, key: string) {
		return key !== shape.props.nodes[0]?.id
	}

	removeNode(shape: TreeShape, key: string) {
		return this.withNodes(shape, removeSubtree(shape.props.nodes, key))
	}

	getEmptySlots(shape: TreeShape, key: string) {
		const node = shape.props.nodes.find((n) => n.id === key)
		return node ? [0, 1].filter((slot) => !node.children[slot]) : []
	}

	addChildAt(shape: TreeShape, key: string, slot: number) {
		const { nodes, fill, seed } = shape.props
		const parent = nodes.find((n) => n.id === key)
		if (!parent || parent.children[slot]) return undefined
		const value = insertValue(
			parent.value,
			undefined,
			fill,
			seed,
			nodes.length,
			nodes.map((n) => n.value)
		)
		const added = addChild(nodes, key, slot, value)
		return { update: this.withNodes(shape, added.nodes), key: added.id }
	}

	/**
	 * New nodes, positioned so the root stays where it is on the page. Marks on removed nodes go
	 * with them (ids are paths, so a node added later in the same place mustn't inherit a mark).
	 */
	private withNodes(shape: TreeShape, nodes: TreeNode[]): TLShapePartial<TreeShape> {
		const before = treeRootCentre(shape.props)
		const after = treeRootCentre({ ...shape.props, nodes })
		const shift = Vec.Rot(Vec.Sub(before, after), shape.rotation)
		const marks = pruneMarks(
			shape.props.marks,
			nodes.map((n) => n.id)
		)
		return { id: shape.id, type: TREE_SHAPE_TYPE, x: shape.x + shift.x, y: shape.y + shift.y, props: { nodes, marks } }
	}

	private update(shape: TreeShape, nodes: TreeNode[]): TLShapePartial<TreeShape> {
		return { id: shape.id, type: TREE_SHAPE_TYPE, props: { nodes } }
	}
}
