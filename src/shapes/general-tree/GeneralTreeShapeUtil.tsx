import type { TLShapePartial, VecLike } from 'tldraw'
import { toggleTranscript, transcriptsOf } from '../../transcript/transcript'
import { pruneMarks, type Marks } from '../../cells/marks'
import type { PointerDirection } from '../../cells/CellShapeUtil'
import { fillValues, insertValue } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import { NodeLinkShapeUtil, nodeCorner, type NodeOperation } from '../../nodelink/NodeLinkShapeUtil'
import { playbackFor, playOperation } from '../../nodelink/playback'
import type { SceneNode } from '../../nodelink/scene'
import { prunePointers } from '../../pointers/pointers'
import { legendMarks } from '../tree/layout'
import { levelOrder, parentOf } from '../tree/model'
import { pathAndSubtree, termMarks, treeTerms } from '../tree/terms'
import { measureTree, type TreeMeasure } from '../tree/measure'
import { ORDER_NAMES, traverseTree, type TreeOrder } from '../tree/traverse'
import type { TreeNode } from '../tree/tree-shape-types'
import { withArity } from './generate'
import {
	GENERAL_TREE_SHAPE_TYPE,
	generalTreeShapeMigrations,
	generalTreeShapeProps,
	type Arity,
	type GeneralTreeShape,
} from './general-tree-shape-types'
import { generalTreeBasePosition, generalTreeMarkKeys, generalTreeScene } from './layout'
import { appendChild, moveAmongSiblings, removeGeneralSubtree, siblingPlace } from './model'

/**
 * A general tree (lecture 8a's other half: a file system, an org chart, a game tree): any number of
 * children a node, in order, with no left and right. Sketched as binary trees are, up to `arity`
 * children a node; a + adds a last child to any node.
 */
export class GeneralTreeShapeUtil extends NodeLinkShapeUtil<GeneralTreeShape> implements Refillable {
	static override type = GENERAL_TREE_SHAPE_TYPE
	static override props = generalTreeShapeProps
	static override migrations = generalTreeShapeMigrations

	/** A path's edges, say: point at an edge and press 1-4. */
	override readonly markableEdges = true

	getDefaultProps(): GeneralTreeShape['props'] {
		return {
			nodes: [{ id: 'n', value: '', children: [], dx: 0, dy: 0 }],
			arity: '3',
			depth: 1,
			fullness: 0.5,
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

	/** With the terms shown (and no operation open): root, internal and leaf in their colours, under any marks. */
	override sceneMarks(shape: GeneralTreeShape) {
		const marks = this.getMarks(shape)
		if (!shape.props.terms || playbackFor(this.editor, shape.id)) return marks
		return { ...termMarks(treeTerms(shape.props.nodes)), ...legendMarks(), ...marks }
	}

	/** With the terms shown: each node's height (edges down to its deepest leaf). */
	override sceneBadges(shape: GeneralTreeShape) {
		if (!shape.props.terms) return undefined
		return Object.fromEntries([...treeTerms(shape.props.nodes).height].map(([id, h]) => [id, String(h)]))
	}

	/** With the terms shown, pointing at a node lights its path from the root and its subtree. */
	hoverHighlights(shape: GeneralTreeShape, key: string): Marks {
		return shape.props.terms ? pathAndSubtree(shape.props.nodes, key) : {}
	}

	buildScene(shape: GeneralTreeShape) {
		return generalTreeScene(shape.props)
	}

	setNodeValue(shape: GeneralTreeShape, key: string, value: string) {
		return this.update(shape, shape.props.nodes.map((n) => (n.id === key ? { ...n, value } : n)))
	}

	moveNode(shape: GeneralTreeShape, key: string, to: VecLike): TLShapePartial<GeneralTreeShape> {
		const base = generalTreeBasePosition(shape.props, key)
		if (!base) return { id: shape.id, type: GENERAL_TREE_SHAPE_TYPE }
		return this.update(
			shape,
			shape.props.nodes.map((n) => (n.id === key ? { ...n, dx: to.x - base.x, dy: to.y - base.y } : n))
		)
	}

	resetLayout(shape: GeneralTreeShape) {
		return this.update(shape, shape.props.nodes.map((n) => ({ ...n, dx: 0, dy: 0 })))
	}

	hasManualLayout(shape: GeneralTreeShape) {
		return shape.props.nodes.some((n) => n.dx !== 0 || n.dy !== 0)
	}

	/** Regenerate values, in level order. */
	refill(shape: GeneralTreeShape) {
		const { fill, seed, nodes, range } = shape.props
		const order = levelOrder(nodes)
		const fresh = fillValues(fill, seed, order.length, { range })
		const values = new Map(fresh.map((v, i) => [order[i].id, v]))
		return this.update(shape, nodes.map((n) => ({ ...n, value: values.get(n.id) ?? n.value })))
	}

	/** The tree sketched again with another arity (picked in the style panel with it selected): see `withArity`. */
	withArity(shape: GeneralTreeShape, arity: Arity): TLShapePartial<GeneralTreeShape> {
		const update = this.withNodes(shape, withArity(shape.props.nodes, shape.props, Number(shape.props.arity), Number(arity)))
		return { ...update, props: { ...update.props, arity } }
	}

	// Live edits: x removes a node's subtree (not the root: delete the shape for that), and + on a
	// node's lower right adds a last child. The root stays put on the page.

	canRemoveNode(shape: GeneralTreeShape, key: string) {
		// Only nodes (not the terms' legend dots), and not the root.
		return shape.props.nodes.some((n) => n.id === key) && key !== shape.props.nodes[0]?.id
	}

	removeNode(shape: GeneralTreeShape, key: string) {
		return this.withNodes(shape, removeGeneralSubtree(shape.props.nodes, key))
	}

	/** Every node can take another child: one slot, after its last. */
	getEmptySlots(shape: GeneralTreeShape, key: string) {
		const node = shape.props.nodes.find((n) => n.id === key)
		return node ? [node.children.filter(Boolean).length] : []
	}

	/** The + for a new last child, on the node's lower right, where the rightmost edge leaves it. */
	protected override slotButton(n: SceneNode, _slot: number, nudge: number) {
		return { at: nodeCorner(n, 1, 1, nudge), label: `Add a child to ${n.value}`, testId: `add-child-${n.key}` }
	}

	addChildAt(shape: GeneralTreeShape, key: string) {
		const { nodes, fill, seed, range } = shape.props
		const parent = nodes.find((n) => n.id === key)
		if (!parent) return undefined
		const value = insertValue(
			parent.value,
			undefined,
			fill,
			seed,
			nodes.length,
			nodes.map((n) => n.value),
			range
		)
		const added = appendChild(nodes, key, value)
		return { update: this.withNodes(shape, added.nodes), key: added.id }
	}

	// Pointers (root, curr...) sit above nodes. Arrow keys follow the tree: Up to the parent, Down to
	// the first child, Left / Right to the sibling before or after.

	override pointerStep(shape: GeneralTreeShape, key: string, direction: PointerDirection): string | undefined {
		const { nodes } = shape.props
		if (direction === 'up') return parentOf(nodes, key)?.id
		if (direction === 'down') return nodes.find((n) => n.id === key)?.children.find(Boolean) ?? undefined
		const siblings = parentOf(nodes, key)?.children.filter(Boolean) ?? []
		const i = siblings.indexOf(key)
		return i < 0 ? undefined : (siblings[i + (direction === 'left' ? -1 : 1)] ?? undefined)
	}

	pointerNames() {
		return ['root', 'curr', 'parent', 'child', 'p']
	}

	// A node's menu: move it among its siblings (its subtree goes with it), and the traversals from
	// it, played step by step (Shift at the end keeps the visited nodes as marks).

	nodeOperations(shape: GeneralTreeShape, key: string): NodeOperation[] {
		const node = shape.props.nodes.find((n) => n.id === key)
		if (!node) return []
		const place = siblingPlace(shape.props.nodes, key)
		const name = node.value || 'it'
		const moves = (
			[
				[-1, 'left', place && place.index > 0],
				[1, 'right', place && place.index < place.count - 1],
			] as const
		).flatMap(([by, side, can]) =>
			can
				? [
						{
							section: 'actions' as const,
							id: `general-tree-move-${side}`,
							label: `Move ${name} ${side} (its subtree too)`,
							run: () => this.restructure(shape.id, `move ${side}`, (nodes) => moveAmongSiblings(nodes, key, by)),
						},
					]
				: []
		)
		return [
			...moves,
			...(['pre', 'post', 'level'] as const).map((order) => ({
				id: `general-tree-${order}-order`,
				label: `${ORDER_NAMES[order]} from ${node.value || 'here'}`,
				group: 'traverse',
				run: () => this.traverse(shape.id, key, order),
			})),
			// Lecture 8a's recursion that returns values, a loop over the children in each call.
			...(
				[
					['height', `Height of ${node.value || 'this subtree'} (a leaf is 0)`],
					['height-levels', `Height of ${node.value || 'this subtree'} (a leaf is 1)`],
					['leaves', `Count the leaves under ${node.value || 'here'}`],
					['size', `Size of ${node.value ? `${node.value}'s` : 'this'} subtree`],
				] as const
			).map(([measure, label]) => ({
				id: `general-tree-${measure}`,
				label,
				group: 'measure',
				run: () => this.measure(shape.id, key, measure),
			})),
		]
	}

	/** Height, leaves or size of the subtree at `start`, worked out recursively, step by step. */
	private measure(id: GeneralTreeShape['id'], start: string, measure: TreeMeasure) {
		const shape = this.editor.getShape(id) as GeneralTreeShape | undefined
		if (!shape) return
		const { frames, code } = measureTree(shape.props.nodes, start, measure, { general: true })
		playOperation(this.editor, { shapeId: id, label: measure.startsWith('height') ? 'height' : measure, frames, code })
	}

	override shapeOperations(shape: GeneralTreeShape): NodeOperation[] {
		return [
			// Lecture 8a's terms, as on binary trees.
			{
				section: 'show',
				id: 'general-tree-terms',
				label: shape.props.terms ? 'Hide the tree terms' : 'Tree terms: root, internal, leaf, depth, height',
				run: () => this.toggleTerms(shape.id),
			},
			// Every move made on it, as code.
			{
				section: 'show',
				id: 'general-tree-code-beside',
				label: transcriptsOf(this.editor, shape.id).length ? 'Hide the code beside it' : 'Code beside it: every move as code',
				run: () => toggleTranscript(this.editor, shape),
			},
		]
	}

	override menuName() {
		return 'General tree'
	}

	override readonly menuId = 'general-tree'

	override moves() {
		return [
			'Double-click a node to type its value (a long name widens it)',
			'Hover a node: the + at its lower right adds a child after its last, x removes it and its subtree',
			'Right-click a node to move it left or right among its siblings',
			'Drag the dot under a node to move it',
			'Style panel: Children per node, how many a node may get when it is sketched (with the tree selected, it is sketched again)',
		]
	}

	/** The terms beside the tree, or not: one undo step. */
	private toggleTerms(id: GeneralTreeShape['id']) {
		const shape = this.editor.getShape(id) as GeneralTreeShape | undefined
		if (!shape) return
		this.editor.markHistoryStoppingPoint('toggle tree terms')
		this.editor.updateShape<GeneralTreeShape>({ id, type: GENERAL_TREE_SHAPE_TYPE, props: { terms: !shape.props.terms } })
	}

	/** Change the tree's shape in one undo step (ids, values, marks and pointers stay with their nodes). */
	private restructure(id: GeneralTreeShape['id'], label: string, change: (nodes: TreeNode[]) => TreeNode[]) {
		const shape = this.editor.getShape(id) as GeneralTreeShape | undefined
		if (!shape) return
		this.editor.markHistoryStoppingPoint(label)
		this.editor.updateShape<GeneralTreeShape>({ id, type: GENERAL_TREE_SHAPE_TYPE, props: { nodes: change(shape.props.nodes) } })
	}

	private traverse(id: GeneralTreeShape['id'], start: string, order: TreeOrder) {
		const shape = this.editor.getShape(id) as GeneralTreeShape | undefined
		if (!shape) return
		const { frames, code } = traverseTree(shape.props.nodes, start, order, { general: true })
		playOperation(this.editor, {
			shapeId: id,
			label: `${ORDER_NAMES[order].toLowerCase()} traversal`,
			frames,
			code,
			withMarks: (_update, highlights) => {
				const current = (this.editor.getShape(id) as GeneralTreeShape | undefined) ?? shape
				const marks = pruneMarks({ ...current.props.marks, ...highlights }, generalTreeMarkKeys(current.props.nodes))
				return this.withMarks(current, marks)
			},
		})
	}

	/**
	 * New nodes (the root stays where it is on the page: layouts are anchored on it). Marks and pointers
	 * on removed nodes go with them, and marks on the edges to them.
	 */
	private withNodes(shape: GeneralTreeShape, nodes: TreeNode[]): TLShapePartial<GeneralTreeShape> {
		const marks = pruneMarks(shape.props.marks, generalTreeMarkKeys(nodes))
		const pointers = prunePointers(
			shape.props.pointers,
			nodes.map((n) => n.id)
		)
		return { id: shape.id, type: GENERAL_TREE_SHAPE_TYPE, props: { nodes, marks, pointers } }
	}

	private update(shape: GeneralTreeShape, nodes: TreeNode[]): TLShapePartial<GeneralTreeShape> {
		return { id: shape.id, type: GENERAL_TREE_SHAPE_TYPE, props: { nodes } }
	}
}
