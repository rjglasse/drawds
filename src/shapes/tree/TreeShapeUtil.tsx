import type { TLShapePartial, VecLike } from 'tldraw'
import { pruneMarks, type Marks } from '../../cells/marks'
import { compareKeys } from '../../data/compare'
import { fillValues, insertValue } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import type { PointerDirection } from '../../cells/CellShapeUtil'
import { NodeLinkShapeUtil, type NodeOperation } from '../../nodelink/NodeLinkShapeUtil'
import { prunePointers } from '../../pointers/pointers'
import { playbackFor, playOperation, type Frame } from '../../nodelink/playback'
import { assignInOrder, bstViolations } from './bst'
import { bstBuild, bstDeleteSteps, bstExtreme, bstInsertSteps, bstSearch } from './search'
import { mulberry32 } from '../../data/random'
import { seedForSketch } from '../../data/seed'
import { shuffledOrder } from '../array/rearrange'
import { legendMarks, nullKey, treeBasePosition, treeScene } from './layout'
import { pathAndSubtree, termMarks, treeTerms } from './terms'
import { ORDER_NAMES, traverseTree, type TreeOrder } from './traverse'
import { measureTree, type TreeMeasure } from './measure'
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
			terms: false,
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

	/** With the terms shown (and no operation open): root, internal and leaf in their colours, under any marks. */
	override sceneMarks(shape: TreeShape) {
		const marks = this.getMarks(shape)
		if (!shape.props.terms || playbackFor(this.editor, shape.id)) return marks
		return { ...termMarks(treeTerms(shape.props.nodes)), ...legendMarks(), ...marks }
	}

	/** With the terms shown: each node's height (edges down to its deepest leaf). */
	override sceneBadges(shape: TreeShape) {
		if (!shape.props.terms) return undefined
		return Object.fromEntries([...treeTerms(shape.props.nodes).height].map(([id, h]) => [id, String(h)]))
	}

	/** With the terms shown, pointing at a node lights its path from the root and its subtree. */
	hoverHighlights(shape: TreeShape, key: string): Marks {
		return shape.props.terms ? pathAndSubtree(shape.props.nodes, key) : {}
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
		// Only nodes: not the terms' legend dots.
		if (!shape.props.nodes.some((n) => n.id === key)) return false
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
						// Lecture 8b: as far left (right) as it goes, the hops counted.
						...(['min', 'max'] as const).map((side) => ({
							...search,
							id: `bst-${side}`,
							label: `${side === 'min' ? 'Minimum' : 'Maximum'}${root ? '' : ` of ${node.value || 'this'}'s subtree`}`,
							run: () => this.extreme(shape.id, key, side),
						})),
					]
				: []),
			...(['pre', 'in', 'post', 'level'] as const).map((order) => ({
				id: `tree-${order}-order`,
				label: `${ORDER_NAMES[order]} from ${node.value || 'here'}`,
				group: 'traverse',
				run: () => this.traverse(shape.id, key, order),
			})),
			// Lecture 8a: recursion that returns values, its answers badged on the nodes as they come back.
			...(
				[
					['height', `Height of ${node.value || 'this subtree'} (a leaf is 0)`],
					['height-levels', `Height of ${node.value || 'this subtree'} (a leaf is 1)`],
					['leaves', `Count the leaves under ${node.value || 'here'}`],
					['size', `Size of ${node.value ? `${node.value}'s` : 'this'} subtree`],
				] as const
			).map(([measure, label]) => ({
				id: `tree-${measure}`,
				label,
				group: 'measure',
				run: () => this.measure(shape.id, key, measure),
			})),
		]
	}

	/**
	 * Lecture 8b's priority queue as a BST: these keys inserted one by one into an empty tree, sorted
	 * (a stick) or shuffled first (bushy). The new tree is the result (one undo step).
	 */
	override shapeOperations(shape: TreeShape): NodeOperation[] {
		// Lecture 8a's terms, on any tree.
		const terms: NodeOperation = {
			section: 'show',
			id: 'tree-terms',
			label: shape.props.terms ? 'Hide the tree terms' : 'Tree terms: root, internal, leaf, depth, height',
			run: () => this.toggleTerms(shape.id),
		}
		if (shape.props.kind !== 'bst' || shape.props.nodes.length < 2) return [terms]
		const build = { group: 'build' }
		return [
			...(['sorted', 'shuffled'] as const).map((order) => ({
				...build,
				id: `bst-build-${order}`,
				label: order === 'sorted' ? 'Insert these keys in sorted order (a stick)' : 'Insert these keys shuffled',
				run: () => this.build(shape.id, order),
			})),
			terms,
		]
	}

	/** The terms beside the tree, or not: one undo step. */
	private toggleTerms(id: TreeShape['id']) {
		const shape = this.editor.getShape(id) as TreeShape | undefined
		if (!shape) return
		this.editor.markHistoryStoppingPoint('toggle tree terms')
		this.editor.updateShape<TreeShape>({ id, type: TREE_SHAPE_TYPE, props: { terms: !shape.props.terms } })
	}

	private build(id: TreeShape['id'], order: 'sorted' | 'shuffled') {
		const shape = this.editor.getShape(id) as TreeShape | undefined
		if (!shape) return
		const keys = shape.props.nodes.map((n) => n.value).filter((v) => v.trim())
		const sorted = [...keys].sort(compareKeys)
		const ordered = order === 'sorted' ? sorted : shuffledOrder(sorted.length, mulberry32(seedForSketch())).map((i) => sorted[i])
		const { frames, nodes } = bstBuild(ordered, order)
		this.play(shape, order === 'sorted' ? 'insert sorted keys' : 'insert shuffled keys', frames, false, { nodes, flash: {} })
	}

	/** The minimum or maximum of the subtree at `start`, step by step, its code beside it. */
	private extreme(id: TreeShape['id'], start: string, side: 'min' | 'max') {
		const shape = this.editor.getShape(id) as TreeShape | undefined
		if (!shape) return
		const { frames, found } = bstExtreme(shape.props.nodes, start, side)
		playOperation(this.editor, { shapeId: id, label: side === 'min' ? 'minimum' : 'maximum', frames, finalFlash: { [found]: 'green' }, code: `bst-${side}` })
	}

	/** Height, leaves or size of the subtree at `start`, worked out recursively, step by step. */
	private measure(id: TreeShape['id'], start: string, measure: TreeMeasure) {
		const shape = this.editor.getShape(id) as TreeShape | undefined
		if (!shape) return
		const { frames, code } = measureTree(shape.props.nodes, start, measure, { nulls: shape.props.nulls === 'show' })
		playOperation(this.editor, { shapeId: id, label: measure.startsWith('height') ? 'height' : measure, frames, code })
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
		this.play(shape, 'search', frames, false, { flash: found ? { [found]: 'green' } : {} }, 'bst-search')
	}

	private traverse(id: TreeShape['id'], start: string, order: TreeOrder) {
		const shape = this.editor.getShape(id) as TreeShape | undefined
		if (!shape) return
		const { nodes, nulls, kind } = shape.props
		const { frames, visited, code } = traverseTree(nodes, start, order, { nulls: nulls === 'show' })
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
			code,
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

	// BST operations, animated: the comparison path lights up node by node (orange), then the
	// result appears; highlights fade, or with Shift held become marks.

	getInsertPrompt(shape: TreeShape) {
		if (shape.props.kind !== 'bst') return undefined
		const root = this.getScene(shape).nodes.find((n) => n.key === shape.props.nodes[0]?.id)
		return root && { at: { x: root.x, y: root.y - root.h / 2 - 24 }, label: 'Insert a key' }
	}

	insertKey(shape: TreeShape, key: string, keep: boolean) {
		const { result, frames } = bstInsertSteps(shape.props.nodes, key)
		this.play(
			shape,
			'insert key',
			frames,
			keep,
			{
				nodes: result.found ? undefined : result.nodes,
				// Found: the key was already there (blue); otherwise the new node (green).
				flash: result.found ? { [result.found]: 'blue' } : { [result.id!]: 'green' },
			},
			'bst-insert'
		)
	}

	removeNodeAnimated(shape: TreeShape, key: string, keep: boolean) {
		if (shape.props.kind !== 'bst') return false
		const { result, frames } = bstDeleteSteps(shape.props.nodes, key)
		const s = result.successor
		// With two children the successor node moves up: nodes are relinked, no key copied.
		this.play(
			shape,
			'delete key',
			frames,
			keep,
			{
				nodes: result.nodes,
				flash: s ? { [s]: 'green' } : {},
			},
			'bst-delete'
		)
		return true
	}

	private play(
		shape: TreeShape,
		label: string,
		frames: Frame[],
		keep: boolean,
		result: { nodes?: TreeNode[]; flash: Marks },
		code?: string
	) {
		const final = result.nodes && this.withNodes(shape, result.nodes)
		playOperation(this.editor, {
			shapeId: shape.id,
			label,
			frames,
			final,
			code,
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
	 * New nodes (the root stays where it is on the page: layouts are anchored on it). Marks and pointers
	 * on removed nodes go with them (ids are paths, so a node added later in the same place mustn't inherit one).
	 */
	private withNodes(shape: TreeShape, nodes: TreeNode[]): TLShapePartial<TreeShape> {
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
			props: { nodes, marks, pointers },
		}
	}

	private update(shape: TreeShape, nodes: TreeNode[]): TLShapePartial<TreeShape> {
		return { id: shape.id, type: TREE_SHAPE_TYPE, props: { nodes } }
	}
}
