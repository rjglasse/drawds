import type { TLShapePartial } from 'tldraw'
import type { PointerDirection } from '../../cells/CellShapeUtil'
import { pruneMarks, type Marks } from '../../cells/marks'
import { mulberry32, newSeed } from '../../data/random'
import { NodeLinkShapeUtil, type NodeOperation } from '../../nodelink/NodeLinkShapeUtil'
import { playOperation, type Frame } from '../../nodelink/playback'
import type { Scene, SceneNode } from '../../nodelink/scene'
import type { PointerAnchor } from '../../pointers/layout'
import { prunePointers } from '../../pointers/pointers'
import { getTreeMetrics } from '../tree/layout'
import { edgeKey, elementKey, elementOfKey, parentKey, unionFindScene } from './layout'
import { findSteps, unionSteps } from './operations'
import { canSetParent, findPath, randomUnions, recount, singletons, type Forest } from './union-find'
import { UNION_FIND_SHAPE_TYPE, unionFindShapeMigrations, unionFindShapeProps, type UnionFindShape } from './union-find-shape-types'

/**
 * Union-find (disjoint sets): a forest of parent pointers, drawn as trees whose arrows point up to
 * the parent, over the parent array (and the size or rank array the union strategy keeps). Find
 * walks up to the root and compresses the path; union finds both roots and links one under the
 * other, or stops when they are one set already.
 */
export class UnionFindShapeUtil extends NodeLinkShapeUtil<UnionFindShape> {
	static override type = UNION_FIND_SHAPE_TYPE
	static override props = unionFindShapeProps
	static override migrations = unionFindShapeMigrations

	// A parent pointer can be marked: a path, or the links a union made.
	override readonly markableEdges = true

	getDefaultProps(): UnionFindShape['props'] {
		return {
			labels: ['0'],
			parent: [0],
			sizes: [1],
			ranks: [0],
			unionBy: 'size',
			compression: 'on',
			seed: 0,
			marks: {},
			pointers: [],
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	buildScene(shape: UnionFindShape): Scene {
		return unionFindScene(shape.props)
	}

	/** An element's mark lights its parent cell too. */
	override sceneMarks(shape: UnionFindShape): Marks {
		const marks: Marks = {}
		for (const [key, color] of Object.entries(shape.props.marks)) {
			marks[key] = color
			if (/^\d+$/.test(key)) marks[parentKey(Number(key))] = color
		}
		return marks
	}

	/** Marks are kept per element (a cell's mark is its element's) and per parent pointer. */
	override markKeyAt(shape: UnionFindShape, point: { x: number; y: number }) {
		const key = super.markKeyAt(shape, point)
		const i = key === undefined ? undefined : elementOfKey(key)
		return i === undefined ? key : elementKey(i)
	}

	/** Point at an element to see its way up: it in blue, the parents on the way in orange, the root in green. */
	hoverHighlights(shape: UnionFindShape, key: string): Marks {
		const i = elementOfKey(key)
		if (i === undefined || i >= shape.props.parent.length) return {}
		const path = findPath(shape.props.parent, i)
		const marks: Marks = {}
		for (const c of path.slice(0, -1)) Object.assign(marks, { [elementKey(c)]: 'orange', [parentKey(c)]: 'orange', [`edge:${edgeKey(c)}`]: 'orange' })
		const root = path[path.length - 1]
		return { ...marks, [elementKey(root)]: 'green', [parentKey(root)]: 'green', [elementKey(i)]: 'blue', [parentKey(i)]: 'blue' }
	}

	/**
	 * Type an element's name into its node, or a parent into its cell (an element's index): the
	 * forest is redrawn, and sizes and ranks recounted to fit. A parent that would make a loop is refused.
	 */
	setNodeValue(shape: UnionFindShape, key: string, value: string): TLShapePartial<UnionFindShape> {
		const i = elementOfKey(key)
		const { labels, parent } = shape.props
		if (i === undefined || i >= parent.length) return { id: shape.id, type: UNION_FIND_SHAPE_TYPE }
		if (key === elementKey(i)) return this.update(shape, { labels: labels.map((l, j) => (j === i ? value : l)) })
		const p = this.elementNamed(shape, value)
		if (p === undefined || !canSetParent(parent, i, p)) return { id: shape.id, type: UNION_FIND_SHAPE_TYPE }
		const next = parent.map((q, j) => (j === i ? p : q))
		return this.update(shape, { parent: next, ...recount(next) })
	}

	/** Nodes sit where the forest puts them. */
	moveNode(shape: UnionFindShape): TLShapePartial<UnionFindShape> {
		return { id: shape.id, type: UNION_FIND_SHAPE_TYPE }
	}

	resetLayout(shape: UnionFindShape): TLShapePartial<UnionFindShape> {
		return { id: shape.id, type: UNION_FIND_SHAPE_TYPE }
	}

	hasManualLayout() {
		return false
	}

	// Pointers (i, j, root...) sit above elements and below parent cells; Up goes to the parent,
	// Left / Right to the neighbouring index.

	override pointerSide(_shape: UnionFindShape, node: SceneNode) {
		return node.kind === 'box' ? ('below' as const) : ('above' as const)
	}

	protected override pointerAnchorIn(shape: UnionFindShape, scene: Scene, key: string): PointerAnchor | undefined {
		const anchor = super.pointerAnchorIn(shape, scene, key)
		if (!anchor || !key.startsWith('p') || shape.props.unionBy === 'naive') return anchor
		// Below the size / rank row.
		const { cell } = getTreeMetrics(shape.props.size)
		return { ...anchor, box: { ...anchor.box, h: anchor.box.h + cell } }
	}

	override pointerStep(shape: UnionFindShape, key: string, direction: PointerDirection): string | undefined {
		const i = elementOfKey(key)
		const n = shape.props.parent.length
		if (i === undefined) return undefined
		const inArray = key.startsWith('p')
		if (direction === 'up') return inArray || shape.props.parent[i] === i ? undefined : elementKey(shape.props.parent[i])
		if (direction === 'down') return undefined
		const j = direction === 'left' ? i - 1 : i + 1
		if (j < 0 || j >= n) return undefined
		return inArray ? parentKey(j) : elementKey(j)
	}

	pointerNames() {
		return ['i', 'j', 'root', 'curr']
	}

	nodeOperations(shape: UnionFindShape, key: string): NodeOperation[] {
		const i = elementOfKey(key)
		if (i === undefined || i >= shape.props.parent.length) return []
		const name = shape.props.labels[i]
		return [
			{ group: 'find', id: 'uf-find', label: `Find the root of ${name}`, run: () => this.find(shape.id, i) },
			{
				group: 'find',
				id: 'uf-union',
				label: `Union ${name} with…`,
				prompt: 'Element to union with',
				run: (value) => value !== undefined && this.union(shape.id, i, value),
			},
		]
	}

	override shapeOperations(shape: UnionFindShape): NodeOperation[] {
		return [
			{ section: 'actions', id: 'uf-random', label: 'Random unions', run: () => this.randomise(shape.id) },
			{ section: 'actions', id: 'uf-reset', label: 'Every element on its own again', run: () => this.reset(shape.id) },
		]
	}

	override menuName() {
		return 'Union-find'
	}

	override readonly menuId = 'uf'

	override moves() {
		return [
			'Right-click an element: Find its root, or Union it with another (step by step)',
			'Point at an element to see its way up to the root',
			'Double-click an element to name it, or a parent cell to set parent[i] by hand',
			'The + after the array adds an element, in a set of its own',
			'Style panel: union by size, rank or naively; path compression on or off',
		]
	}

	getInsertPrompt(shape: UnionFindShape) {
		const last = this.getScene(shape).nodes.find((n) => n.key === parentKey(shape.props.parent.length - 1))
		return last && { at: { x: last.x + last.w / 2 + 40, y: last.y }, label: 'Add an element' }
	}

	/** A new element, in a set of its own, named as typed (its index if left blank). */
	insertKey(shape: UnionFindShape, value: string) {
		const { labels, parent, sizes, ranks } = shape.props
		const n = parent.length
		this.editor.markHistoryStoppingPoint('add element')
		this.editor.updateShape(
			this.update(shape, { labels: [...labels, value.trim() || String(n)], parent: [...parent, n], sizes: [...sizes, 1], ranks: [...ranks, 0] })
		)
	}

	/** The element a typed name stands for: its label, else its index. */
	private elementNamed(shape: UnionFindShape, value: string): number | undefined {
		const name = value.trim()
		const byLabel = shape.props.labels.indexOf(name)
		if (byLabel >= 0) return byLabel
		const i = Number(name)
		return name !== '' && Number.isInteger(i) && i >= 0 && i < shape.props.parent.length ? i : undefined
	}

	private find(id: UnionFindShape['id'], i: number) {
		const shape = this.editor.getShape(id) as UnionFindShape | undefined
		if (!shape) return
		const { frames, forest } = findSteps(shape.props, this.forestOf(shape), i)
		this.play(shape, `find(${shape.props.labels[i]})`, frames, forest)
	}

	private union(id: UnionFindShape['id'], a: number, other: string) {
		const shape = this.editor.getShape(id) as UnionFindShape | undefined
		if (!shape) return
		const b = this.elementNamed(shape, other)
		if (b === undefined) return
		const { frames, forest } = unionSteps(shape.props, a, b)
		this.play(shape, `union(${shape.props.labels[a]}, ${shape.props.labels[b]})`, frames, forest)
	}

	private play(shape: UnionFindShape, label: string, frames: Frame[], forest: Forest) {
		const final: TLShapePartial<UnionFindShape> = { id: shape.id, type: UNION_FIND_SHAPE_TYPE, props: { ...forest } }
		playOperation(this.editor, {
			shapeId: shape.id,
			label,
			frames,
			final,
			// Shift: the step's highlights stay as marks (per element, and on parent pointers).
			withMarks: (_update, highlights) => {
				const kept = Object.fromEntries(Object.entries(highlights).filter(([k]) => /^\d+$/.test(k) || k.startsWith('edge:')))
				return { ...final, props: { ...final.props, marks: { ...shape.props.marks, ...kept } } }
			},
		})
	}

	private randomise(id: UnionFindShape['id']) {
		const shape = this.editor.getShape(id) as UnionFindShape | undefined
		if (!shape) return
		const n = shape.props.parent.length
		const seed = newSeed()
		const forest = randomUnions(singletons(n), shape.props.unionBy, Math.ceil(n * 0.6), mulberry32(seed))
		this.editor.markHistoryStoppingPoint('random unions')
		this.editor.updateShape(this.update(shape, { ...forest, seed }))
	}

	private reset(id: UnionFindShape['id']) {
		const shape = this.editor.getShape(id) as UnionFindShape | undefined
		if (!shape) return
		this.editor.markHistoryStoppingPoint('reset union-find')
		this.editor.updateShape(this.update(shape, singletons(shape.props.parent.length)))
	}

	private forestOf(shape: UnionFindShape): Forest {
		const { parent, sizes, ranks } = shape.props
		return { parent: [...parent], sizes: [...sizes], ranks: [...ranks] }
	}

	/** A props change; marks and pointers on elements, cells and pointers that are gone go with them. */
	private update(shape: UnionFindShape, props: Partial<UnionFindShape['props']>): TLShapePartial<UnionFindShape> {
		const parent = props.parent ?? shape.props.parent
		const keys = [
			...parent.flatMap((p, i) => [elementKey(i), parentKey(i), `w${i}`, ...(p === i ? [] : [`edge:${edgeKey(i)}`])]),
		]
		return {
			id: shape.id,
			type: UNION_FIND_SHAPE_TYPE,
			props: { ...props, marks: pruneMarks(shape.props.marks, keys), pointers: prunePointers(shape.props.pointers, keys) },
		}
	}
}
