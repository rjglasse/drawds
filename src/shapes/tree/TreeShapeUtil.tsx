import { Vec, type TLShapePartial, type VecLike } from 'tldraw'
import { pruneMarks, type MarkColor, type Marks } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import { fillValues, insertValue } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import type { PointerDirection } from '../../cells/CellShapeUtil'
import { NodeLinkShapeUtil, type NodeOperation } from '../../nodelink/NodeLinkShapeUtil'
import { prunePointers } from '../../pointers/pointers'
import { playOperation, type Frame } from '../../nodelink/playback'
import { assignInOrder, bstDelete, bstInsert, bstViolations } from './bst'
import { bstSearch } from './search'
import { nullKey, treeBasePosition, treeRootCentre, treeScene } from './layout'
import { ORDER_NAMES, traverseTree, type TreeOrder } from './traverse'
import { addChild, levelOrder, mirrorSubtree, parentOf, removeSubtree, swapChildren } from './model'
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
			invariant: 'check',
			nulls: 'hide',
			fill: 'random',
			range: 'medium',
			seed: 0,
			marks: {},
			pointers: [],
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	/** A BST's nodes that break its ordering (each must lie between the bounds its ancestors set). */
	override sceneWarnings(shape: TreeShape) {
		const { kind, invariant, nodes } = shape.props
		return kind === 'bst' && invariant === 'check' ? [...bstViolations(nodes)] : []
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
		const { fill, seed, nodes, kind, range } = shape.props
		const order = levelOrder(nodes)
		const fresh = fillValues(fill, seed, order.length, { range })
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
		const { nodes, fill, seed, range } = shape.props
		const parent = nodes.find((n) => n.id === key)
		if (!parent || parent.children[slot]) return undefined
		const value = insertValue(
			parent.value,
			undefined,
			fill,
			seed,
			nodes.length,
			nodes.map((n) => n.value),
			range
		)
		const added = addChild(nodes, key, slot, value)
		return { update: this.withNodes(shape, added.nodes), key: added.id }
	}

	// Pointers (root, curr...) sit above nodes. Arrow keys follow the tree: Left / Right to that
	// child (or its null marker, when nulls are shown), Up to the parent, Down to the first child.

	override pointerStep(shape: TreeShape, key: string, direction: PointerDirection): string | undefined {
		const { nodes } = shape.props
		const scene = this.getScene(shape)
		const shown = (k: string) => scene.nodes.some((n) => n.key === k)
		const nullOf = /^#null:(.*):(\d)$/.exec(key)
		if (direction === 'up') return nullOf ? nullOf[1] : parentOf(nodes, key)?.id
		const node = nodes.find((n) => n.id === key)
		if (!node) return undefined
		const child = (slot: number) => node.children[slot] ?? (shown(nullKey(node.id, slot)) ? nullKey(node.id, slot) : undefined)
		return direction === 'left' ? child(0) : direction === 'right' ? child(1) : (child(0) ?? child(1))
	}

	pointerNames() {
		return ['root', 'curr', 'parent', 'p', 'q']
	}

	// Traversals from any node, in its context menu: they play step by step on the play bar.
	// Shift at the end keeps the visited nodes as marks.

	nodeOperations(shape: TreeShape, key: string): NodeOperation[] {
		const node = shape.props.nodes.find((n) => n.id === key)
		if (!node) return []
		const search = { group: 'search' }
		// Swapping children or mirroring reorders a plain tree; a BST would lose its order.
		const parent = shape.props.kind === 'tree' && node.children.some(Boolean)
		const root = shape.props.nodes[0]?.id === key
		return [
			...(parent
				? [
						{
							section: 'actions' as const,
							id: 'tree-swap-children',
							label: node.value ? `Swap ${node.value}'s children` : 'Swap its children',
							run: () => this.restructure(shape.id, 'swap children', (nodes) => swapChildren(nodes, key)),
						},
						{
							section: 'actions' as const,
							id: 'tree-mirror',
							label: root ? 'Mirror the tree' : node.value ? `Mirror ${node.value}'s subtree` : 'Mirror this subtree',
							run: () => this.restructure(shape.id, 'mirror', (nodes) => mirrorSubtree(nodes, key)),
						},
					]
				: []),
			...(shape.props.kind === 'bst'
				? [
						...(node.value.trim()
							? [{ ...search, id: 'bst-search', label: `Search for ${node.value}`, run: () => this.search(shape.id, node.value) }]
							: []),
						{
							...search,
							id: 'bst-search-value',
							label: 'Search for a key',
							prompt: 'Key to find',
							run: (value?: string) => value !== undefined && this.search(shape.id, value),
						},
					]
				: []),
			...(['pre', 'in', 'post', 'level'] as const).map((order) => ({
				id: `tree-${order}-order`,
				label: `${ORDER_NAMES[order]} from ${node.value || 'here'}`,
				group: 'traverse',
				run: () => this.traverse(shape.id, key, order),
			})),
		]
	}

	override menuName(shape: TreeShape) {
		return shape.props.kind === 'bst' ? 'Binary search tree' : 'Binary tree'
	}

	override readonly menuId = 'tree'

	override moves(shape: TreeShape) {
		return [
			'Double-click a node to type its value',
			...(shape.props.kind === 'bst'
				? ['The + above the root inserts a key and x on a node deletes it, step by step', 'A dashed red ring marks a key out of order']
				: ['Hover a node: the + at its lower corners adds a child, x removes it and its subtree']),
			'Drag the dot under a node to move it',
			'Style panel: Tree kind (binary tree or binary search tree) and Null children',
		]
	}

	/** Change the tree's shape in one undo step (ids, values, marks and pointers stay with their nodes). */
	private restructure(id: TreeShape['id'], label: string, change: (nodes: TreeShape['props']['nodes']) => TreeShape['props']['nodes']) {
		const shape = this.editor.getShape(id) as TreeShape | undefined
		if (!shape) return
		this.editor.markHistoryStoppingPoint(label)
		this.editor.updateShape<TreeShape>({ id, type: TREE_SHAPE_TYPE, props: { nodes: change(shape.props.nodes) } })
	}

	/** BST search from the root, step by step; nothing changes (Shift at the end keeps the path as marks). */
	private search(id: TreeShape['id'], key: string) {
		const shape = this.editor.getShape(id) as TreeShape | undefined
		if (!shape || !shape.props.nodes.length) return
		const { frames, found } = bstSearch(shape.props.nodes, key, { nulls: shape.props.nulls === 'show' })
		this.play(shape, 'search', frames, false, { flash: found ? { [found]: 'green' } : {} })
	}

	private traverse(id: TreeShape['id'], start: string, order: TreeOrder) {
		const shape = this.editor.getShape(id) as TreeShape | undefined
		if (!shape) return
		const { nodes, nulls, kind } = shape.props
		const { frames, visited } = traverseTree(nodes, start, order, { nulls: nulls === 'show' })
		// The point of in-order on a BST (unless the keys were edited out of order).
		const keys = visited.map((v) => nodes.find((n) => n.id === v)!.value)
		if (order === 'in' && kind === 'bst' && keys.every((k, i) => i === 0 || compareKeys(keys[i - 1], k) <= 0)) {
			const last = frames[frames.length - 1]
			frames[frames.length - 1] = { ...last, caption: `${last.caption}: sorted, as in-order on a BST always is` }
		}
		playOperation(this.editor, {
			shapeId: id,
			label: `${ORDER_NAMES[order].toLowerCase()} traversal`,
			frames,
			withMarks: (_update, highlights) => {
				const current = (this.editor.getShape(id) as TreeShape | undefined) ?? shape
				const marks = pruneMarks(
					{ ...current.props.marks, ...highlights },
					current.props.nodes.map((n) => n.id)
				)
				return this.withMarks(current, marks)
			},
		})
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
		// Each comparison on the way down; the last one says where the new key goes. In predict mode the
		// class is asked each way first, the node to compare with pulsing.
		const frames = result.path.map((id, i): Frame => {
			const v = valueOf.get(id)!
			const cmp = compareKeys(key, v)
			const ask = { ask: i === 0 ? `Insert ${key}, starting at the root: ${key} vs ${v}, which way?` : `${key} vs ${v}: which way?`, askFocus: [id] }
			if (cmp === 0) return { ...TreeShapeUtil.highlight(id, 'orange', `${key} = ${v}: already in the tree`), ...ask }
			const [sign, side] = cmp < 0 ? ['<', 'left'] : ['>', 'right']
			const last = i === result.path.length - 1
			return {
				...TreeShapeUtil.highlight(
					id,
					'orange',
					last ? `${key} ${sign} ${v}, which has no ${side} child: ${key} goes there` : `${key} ${sign} ${v}: go ${side}`
				),
				...ask,
			}
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
	 * New nodes, positioned so the root stays where it is on the page. Marks and pointers on removed
	 * nodes go with them (ids are paths, so a node added later in the same place mustn't inherit one).
	 */
	private withNodes(shape: TreeShape, nodes: TreeNode[]): TLShapePartial<TreeShape> {
		const before = treeRootCentre(shape.props)
		const after = treeRootCentre({ ...shape.props, nodes })
		const shift = Vec.Rot(Vec.Sub(before, after), shape.rotation)
		const marks = pruneMarks(
			shape.props.marks,
			nodes.map((n) => n.id)
		)
		// Pointers may also sit on null markers: any empty slot of a surviving node.
		const slots = nodes.flatMap((n) => [0, 1].filter((slot) => !n.children[slot]).map((slot) => nullKey(n.id, slot)))
		const pointers = prunePointers(shape.props.pointers, [...nodes.map((n) => n.id), ...slots])
		return {
			id: shape.id,
			type: TREE_SHAPE_TYPE,
			x: shape.x + shift.x,
			y: shape.y + shift.y,
			props: { nodes, marks, pointers },
		}
	}

	private update(shape: TreeShape, nodes: TreeNode[]): TLShapePartial<TreeShape> {
		return { id: shape.id, type: TREE_SHAPE_TYPE, props: { nodes } }
	}
}
