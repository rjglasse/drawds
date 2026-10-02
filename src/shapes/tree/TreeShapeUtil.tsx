import { Vec, type TLShapePartial, type VecLike } from 'tldraw'
import { pruneMarks, type MarkColor, type Marks } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import { fillValues, insertValue } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import { NodeLinkShapeUtil } from '../../nodelink/NodeLinkShapeUtil'
import { playOperation, type Frame } from '../../nodelink/playback'
import { assignInOrder, bstDelete, bstInsert } from './bst'
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
			kind: 'tree',
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

	/** Regenerate values: in level order for a plain tree, sorted in in-order for a BST. */
	refill(shape: TreeShape) {
		const { fill, seed, nodes, kind } = shape.props
		const order = levelOrder(nodes)
		const fresh = fillValues(fill, seed, order.length)
		if (kind === 'bst') return this.update(shape, assignInOrder(nodes, fresh))
		const values = new Map(fresh.map((v, i) => [order[i].id, v]))
		return this.update(shape, nodes.map((n) => ({ ...n, value: values.get(n.id) ?? n.value })))
	}

	/** Keep the tree's keys, sorted into in-order positions: a valid BST of the same shape. */
	arrangeAsBst(shape: TreeShape): TLShapePartial<TreeShape> {
		const { nodes } = shape.props
		return this.update(
			shape,
			assignInOrder(
				nodes,
				nodes.map((n) => n.value)
			)
		)
	}

	// Live edits: x removes a node's subtree (not the root: delete the shape for that), and + on a
	// node's lower corners adds a child in an empty slot. The root stays put on the page.

	canRemoveNode(shape: TreeShape, key: string) {
		// A BST can delete its root (the successor takes over), but keeps at least one node.
		if (shape.props.kind === 'bst') return shape.props.nodes.length > 1
		return key !== shape.props.nodes[0]?.id
	}

	removeNode(shape: TreeShape, key: string) {
		return this.withNodes(shape, removeSubtree(shape.props.nodes, key))
	}

	getEmptySlots(shape: TreeShape, key: string) {
		// A BST places keys itself (insert a key), so it offers no free child slots.
		if (shape.props.kind === 'bst') return []
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

	/** One step of an animation that highlights a node, saying why. */
	private static highlight(id: string, color: MarkColor, caption?: string): Frame {
		return { flash: { [id]: color }, caption }
	}

	// BST operations, animated: the comparison path lights up node by node (orange), then the
	// result appears; highlights fade, or with Shift held become marks.

	getInsertPrompt(shape: TreeShape) {
		if (shape.props.kind !== 'bst') return undefined
		const root = this.getScene(shape).nodes.find((n) => n.key === shape.props.nodes[0]?.id)
		return root && { at: { x: root.x, y: root.y - root.h / 2 - 24 }, label: 'Insert a key' }
	}

	insertKey(shape: TreeShape, key: string, keep: boolean) {
		const result = bstInsert(shape.props.nodes, key)
		const valueOf = new Map(shape.props.nodes.map((n) => [n.id, n.value]))
		// Each comparison on the way down; the last one says where the new key goes.
		const frames = result.path.map((id, i) => {
			const v = valueOf.get(id)!
			const cmp = compareKeys(key, v)
			if (cmp === 0) return TreeShapeUtil.highlight(id, 'orange', `${key} = ${v}: already in the tree`)
			const [sign, side] = cmp < 0 ? ['<', 'left'] : ['>', 'right']
			const last = i === result.path.length - 1
			return TreeShapeUtil.highlight(
				id,
				'orange',
				last ? `${key} ${sign} ${v}, which has no ${side} child: ${key} goes there` : `${key} ${sign} ${v}: go ${side}`
			)
		})
		this.play(shape, 'insert key', frames, keep, {
			nodes: result.found ? undefined : result.nodes,
			// Found: the key was already there (blue); otherwise the new node (green).
			flash: result.found ? { [result.found]: 'blue' } : { [result.id!]: 'green' },
		})
	}

	removeNodeAnimated(shape: TreeShape, key: string, keep: boolean) {
		if (shape.props.kind !== 'bst') return false
		const result = bstDelete(shape.props.nodes, key)
		const valueOf = new Map(shape.props.nodes.map((n) => [n.id, n.value]))
		const v = valueOf.get(key)
		const why = {
			leaf: `Delete ${v}: a leaf, so just remove it`,
			'one-child': `Delete ${v}: it has one child, which takes its place`,
			'two-children': `Delete ${v}: two children, so find its successor (the smallest key on its right)`,
		}[result.kind]
		const frames = [
			TreeShapeUtil.highlight(key, 'red', why),
			...result.path.map((id, i) =>
				TreeShapeUtil.highlight(id, 'orange', i === 0 ? `Go right to ${valueOf.get(id)}` : `Go left to ${valueOf.get(id)}`)
			),
			...(result.successor
				? [
						TreeShapeUtil.highlight(
							result.successor,
							'green',
							`${valueOf.get(result.successor)} has no left child: it is the successor, and replaces ${v}`
						),
					]
				: []),
		]
		// With two children the node stays, now holding its successor's value.
		this.play(shape, 'delete key', frames, keep, {
			nodes: result.nodes,
			flash: result.kind === 'two-children' ? { [key]: 'green' } : {},
		})
		return true
	}

	private play(
		shape: TreeShape,
		label: string,
		frames: Frame[],
		keep: boolean,
		result: { nodes?: TreeNode[]; flash: Marks }
	) {
		const final = result.nodes && this.withNodes(shape, result.nodes)
		playOperation(this.editor, {
			shapeId: shape.id,
			label,
			frames,
			final,
			finalFlash: result.flash,
			keep,
			// Shift held: the highlights become marks, in the same undo step as the result.
			withMarks: (_update, highlights) => {
				const nodes = result.nodes ?? shape.props.nodes
				const marks = pruneMarks(
					{ ...(final?.props?.marks ?? shape.props.marks), ...highlights },
					nodes.map((n) => n.id)
				)
				return final ? { ...final, props: { ...final.props, marks } } : this.withMarks(shape, marks)
			},
		})
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
