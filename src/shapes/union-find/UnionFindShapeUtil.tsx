import { SVGContainer, getIndices, type TLHandle, type TLHandleDragInfo, type TLShapePartial, type TLThemeColors } from 'tldraw'
import type { PointerDirection } from '../../cells/CellShapeUtil'
import { pruneMarks, type Marks } from '../../cells/marks'
import { mulberry32, newSeed } from '../../data/random'
import { NodeLinkShapeUtil, type NodeOperation } from '../../nodelink/NodeLinkShapeUtil'
import { playOperation, type Frame } from '../../nodelink/playback'
import type { Scene, SceneNode } from '../../nodelink/scene'
import type { TestValues } from '../code/tests'
import { indexTestValues } from '../../nodelink/scene-tests'
import type { PointerAnchor } from '../../pointers/layout'
import { prunePointers } from '../../pointers/pointers'
import { toggleTranscript, transcriptsOf } from '../../transcript/transcript'
import { getTreeMetrics } from '../tree/layout'
import { edgeKey, elementKey, elementOfKey, parentKey, unionFindScene } from './layout'
import { connectedSteps, findSteps, unionSteps } from './operations'
import { elementOfUnionHandle, unionDragState, unionHandleId, unionTarget, type UnionDrag } from './drag'
import { isBusy, playbackFor } from '../../nodelink/playback'
import { showsStructureControls } from '../../controls/visibility'
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

	/** As trees merge or a path is compressed, nodes glide to their new places: the class sees which tree went where. */
	protected override readonly glides = true

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
				label: `Union ${name} with`,
				prompt: 'Element to union with',
				run: (value) => value !== undefined && this.union(shape.id, i, value),
			},
			{
				group: 'find',
				id: 'uf-connected',
				label: `Same set as`,
				prompt: 'Which element?',
				run: (value) => value !== undefined && this.connected(shape.id, i, value),
			},
		]
	}

	// Union by a gesture: each element's grip (on its right rim, drawn on hover) dragged onto another
	// element, or its cell, plays union(a, b) step by step.

	override getHandles(shape: UnionFindShape): TLHandle[] {
		const own = super.getHandles(shape)
		if (isBusy(playbackFor(this.editor, shape.id))) return own
		const { labels, parent } = shape.props
		const grips = this.getScene(shape)
			.nodes.filter((n) => n.kind === 'circle')
			.flatMap((n) => {
				const i = elementOfKey(n.key)
				return i === undefined || i >= parent.length ? [] : [{ id: unionHandleId(i), type: 'create' as const, x: n.x + n.w / 2, y: n.y, label: `Drag ${labels[i]} onto another element to union them` }]
			})
		const indices = getIndices(own.length + grips.length)
		return [...own.map((h, k) => ({ ...h, index: indices[k] })), ...grips.map((h, k) => ({ ...h, index: indices[own.length + k] }))]
	}

	override onHandleDragStart(shape: UnionFindShape, { handle }: TLHandleDragInfo<UnionFindShape>) {
		const from = elementOfUnionHandle(handle.id)
		if (from !== undefined) unionDragState(this.editor).set({ shapeId: shape.id, from, at: handle })
	}

	override onHandleDrag(shape: UnionFindShape, info: TLHandleDragInfo<UnionFindShape>) {
		const from = elementOfUnionHandle(info.handle.id)
		if (from === undefined) return super.onHandleDrag(shape, info)
		const at = { x: info.handle.x, y: info.handle.y }
		unionDragState(this.editor).set({ shapeId: shape.id, from, at, target: unionTarget(this.getScene(shape), from, at) })
		return undefined
	}

	override onHandleDragEnd(shape: UnionFindShape) {
		const state = unionDragState(this.editor)
		const drag = state.get()
		state.set(null)
		// The handle drag ends first; then union(a, b) plays.
		if (drag?.shapeId === shape.id && drag.target !== undefined) {
			const [a, b] = [drag.from, drag.target]
			this.editor.timers.setTimeout(() => this.unite(shape.id, a, b), 0)
		}
	}

	override onHandleDragCancel() {
		unionDragState(this.editor).set(null)
	}

	override component(shape: UnionFindShape) {
		const drag = unionDragState(this.editor).get()
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		return (
			<>
				{super.component(shape)}
				{drag?.shapeId === shape.id && showsStructureControls(this.editor, shape) && (
					<SVGContainer>
						<UnionPreview shape={shape} drag={drag} scene={this.getScene(shape)} zoom={this.editor.getZoomLevel()} colors={colors} fontFamily={this.getFontFamily(shape)} />
					</SVGContainer>
				)}
			</>
		)
	}

	override shapeOperations(shape: UnionFindShape): NodeOperation[] {
		return [
			{ section: 'actions', id: 'uf-random', label: 'Random unions', run: () => this.randomise(shape.id) },
			{ section: 'actions', id: 'uf-reset', label: 'Every element on its own again', run: () => this.reset(shape.id) },
			// Every move made on it, as code.
			{
				section: 'show',
				id: 'uf-code-beside',
				label: transcriptsOf(this.editor, shape.id).length ? 'Hide the code beside it' : 'Code beside it: every move as code',
				run: () => toggleTranscript(this.editor, shape),
			},
		]
	}

	override menuName() {
		return 'Union-find'
	}

	override readonly menuId = 'uf'

	/** A test reads the parent array (and size, rank) and the step's elements by index (curr, root, ra, rb). */
	override testValues(shape: UnionFindShape, frame: Frame): TestValues {
		const props = { ...shape.props, ...(frame.props as Partial<UnionFindShape['props']> | undefined) }
		const strings = (a: readonly number[]) => a.map(String)
		return indexTestValues(frame, { parent: strings(props.parent), size: strings(props.sizes), rank: strings(props.ranks) })
	}

	override moves() {
		return [
			'Right-click an element: Find its root, Union it with another, or Same set as another? (step by step)',
			"Drag from the dot on an element's right edge onto another element (or its cell) to union them, step by step",
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
		const { frames, forest, code } = findSteps(shape.props, this.forestOf(shape), i)
		this.play(shape, `find(${shape.props.labels[i]})`, frames, forest, code, { i: String(i) })
	}

	private union(id: UnionFindShape['id'], a: number, other: string) {
		const shape = this.editor.getShape(id) as UnionFindShape | undefined
		const b = shape && this.elementNamed(shape, other)
		if (b !== undefined) this.unite(id, a, b)
	}

	/** union(a, b), step by step. */
	private unite(id: UnionFindShape['id'], a: number, b: number) {
		const shape = this.editor.getShape(id) as UnionFindShape | undefined
		if (!shape || a >= shape.props.parent.length || b >= shape.props.parent.length) return
		const { frames, forest, code } = unionSteps(shape.props, a, b)
		this.play(shape, `union(${shape.props.labels[a]}, ${shape.props.labels[b]})`, frames, forest, code, { a: String(a), b: String(b) })
	}

	/** Same set? connected(a, b), step by step: both finds (compressing, if on), the roots compared. */
	private connected(id: UnionFindShape['id'], a: number, other: string) {
		const shape = this.editor.getShape(id) as UnionFindShape | undefined
		const b = shape && this.elementNamed(shape, other)
		if (!shape || b === undefined) return
		const { frames, forest, code } = connectedSteps(shape.props, a, b)
		this.play(shape, `connected(${shape.props.labels[a]}, ${shape.props.labels[b]})`, frames, forest, code, { a: String(a), b: String(b) })
	}

	/** `args`: what its code is called with (elements by index), for the code beside it. */
	private play(shape: UnionFindShape, label: string, frames: Frame[], forest: Forest, code: string, args: Record<string, string>) {
		const final: TLShapePartial<UnionFindShape> = { id: shape.id, type: UNION_FIND_SHAPE_TYPE, props: { ...forest } }
		playOperation(this.editor, {
			shapeId: shape.id,
			label,
			frames,
			final,
			code,
			args,
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

/** A union drag: a dashed line from the element to the pointer, the element it would union with ringed, union(a, b) by the pointer. */
function UnionPreview({ shape, drag, scene, zoom, colors, fontFamily }: { shape: UnionFindShape; drag: UnionDrag; scene: Scene; zoom: number; colors: TLThemeColors; fontFamily: string }) {
	const from = scene.nodes.find((n) => n.kind === 'circle' && n.key === elementKey(drag.from))
	if (!from) return null
	const target = drag.target === undefined ? undefined : scene.nodes.find((n) => n.kind === 'circle' && n.key === elementKey(drag.target!))
	const to = target ?? drag.at
	const stroke = colors.selectionStroke
	const { labels } = shape.props
	return (
		<g pointerEvents="none">
			<line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={stroke} strokeWidth={2 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} strokeLinecap="round" />
			{target && <circle cx={target.x} cy={target.y} r={target.w / 2 + 4 / zoom} fill="none" stroke={stroke} strokeWidth={2 / zoom} />}
			{drag.target !== undefined && (
				<text x={drag.at.x + 10 / zoom} y={drag.at.y - 10 / zoom} fontFamily={fontFamily} fontSize={14 / zoom} fill={stroke}>
					{`union(${labels[drag.from]}, ${labels[drag.target]})`}
				</text>
			)}
		</g>
	)
}
