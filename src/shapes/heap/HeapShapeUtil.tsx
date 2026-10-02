import type { TLShapePartial } from 'tldraw'
import { pruneMarks, swapMarks, type MarkColor, type Marks } from '../../cells/marks'
import { fillValues } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import type { PointerDirection } from '../../cells/CellShapeUtil'
import { NodeLinkShapeUtil } from '../../nodelink/NodeLinkShapeUtil'
import type { SceneNode } from '../../nodelink/scene'
import type { PointerAnchor } from '../../pointers/layout'
import { prunePointers } from '../../pointers/pointers'
import { getTreeMetrics } from '../tree/layout'
import { playOperation, type Frame } from '../../nodelink/playback'
import { buildByInsertion, childIndices, heapInsert, heapRemoveAt, heapify, parentIndex, type HeapType, type Sift } from './heap'
import { HEAP_SHAPE_TYPE, heapShapeMigrations, heapShapeProps, type HeapShape } from './heap-shape-types'
import { arrayKey, heapScene, indexOfKey } from './layout'

/** Highlight index i in both views (tree node and array cell). */
const both = (i: number, color: MarkColor): Marks => ({ [String(i)]: color, [arrayKey(i)]: color })

/** Animate a swap of indices a and b in both views. */
const swapPairs = (a: number, b: number): [string, string][] => [
	[String(a), String(b)],
	[arrayKey(a), arrayKey(b)],
]

/**
 * A binary heap, stored as its array and drawn both as a complete tree and as that array. Insert
 * (sift-up) and remove / extract (sift-down) play as a chain of parent-child swaps in both views.
 */
export class HeapShapeUtil extends NodeLinkShapeUtil<HeapShape> implements Refillable {
	static override type = HEAP_SHAPE_TYPE
	static override props = heapShapeProps
	static override migrations = heapShapeMigrations

	getDefaultProps(): HeapShape['props'] {
		return {
			values: [''],
			heapType: 'min',
			fill: 'random',
			seed: 0,
			marks: {},
			pointers: [],
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	buildScene(shape: HeapShape) {
		return heapScene(shape.props)
	}

	/** Marks are kept per index; draw them on both views. */
	override sceneMarks(shape: HeapShape): Marks {
		const marks: Marks = {}
		for (const [key, color] of Object.entries(shape.props.marks)) Object.assign(marks, both(Number(key), color))
		return marks
	}

	/**
	 * Point at index i (in either view) to see the index arithmetic: i in blue, its parent
	 * ((i - 1) / 2) in orange, its children (2i + 1, 2i + 2) in green, in both views.
	 */
	hoverHighlights(shape: HeapShape, key: string): Marks {
		const i = indexOfKey(key)
		if (i === undefined) return {}
		const n = shape.props.values.length
		const children = childIndices(i).filter((c) => c < n)
		return Object.assign(
			{},
			...children.map((c) => both(c, 'green')),
			i > 0 ? both(parentIndex(i), 'orange') : {},
			both(i, 'blue')
		)
	}

	/** Editing either view edits the same slot (no re-heapify: a broken heap is a fine exercise). */
	setNodeValue(shape: HeapShape, key: string, value: string): TLShapePartial<HeapShape> {
		const i = indexOfKey(key)
		if (i === undefined) return { id: shape.id, type: HEAP_SHAPE_TYPE }
		return this.update(shape, shape.props.values.map((v, j) => (j === i ? value : v)))
	}

	/** Heap nodes sit where the heap order puts them; they aren't dragged. */
	moveNode(shape: HeapShape): TLShapePartial<HeapShape> {
		return { id: shape.id, type: HEAP_SHAPE_TYPE }
	}

	resetLayout(shape: HeapShape): TLShapePartial<HeapShape> {
		return { id: shape.id, type: HEAP_SHAPE_TYPE }
	}

	hasManualLayout() {
		return false
	}

	refill(shape: HeapShape) {
		const { fill, seed, values, heapType } = shape.props
		return this.update(shape, buildByInsertion(fillValues(fill, seed, values.length), heapType))
	}

	/** Rebuild the heap property (Floyd), e.g. after switching between min and max. */
	reheapify(shape: HeapShape): TLShapePartial<HeapShape> {
		return this.update(shape, heapify(shape.props.values, shape.props.heapType).values)
	}

	// Pointers (i, parent, child...) stay at indices: above tree nodes, below array cells (under their
	// index). Arrow keys do the index arithmetic: Left / Right to children 2i + 1 / 2i + 2 and Up to
	// (i - 1) / 2 in the tree, Left / Right to i - 1 / i + 1 in the array.

	override pointerSide(_shape: HeapShape, node: SceneNode) {
		return node.key.startsWith('a') ? ('below' as const) : ('above' as const)
	}

	override pointerAnchor(shape: HeapShape, key: string): PointerAnchor | undefined {
		const anchor = super.pointerAnchor(shape, key)
		if (!anchor || !key.startsWith('a')) return anchor
		const { labelFontSize } = getTreeMetrics(shape.props.size)
		return { ...anchor, box: { ...anchor.box, h: anchor.box.h + labelFontSize * 1.8 } }
	}

	override pointerStep(shape: HeapShape, key: string, direction: PointerDirection): string | undefined {
		const i = indexOfKey(key)
		const n = shape.props.values.length
		if (i === undefined) return undefined
		const inArray = key.startsWith('a')
		const j = inArray
			? { left: i - 1, right: i + 1, up: -1, down: -1 }[direction]
			: { left: 2 * i + 1, right: 2 * i + 2, down: 2 * i + 1, up: i > 0 ? parentIndex(i) : -1 }[direction]
		if (j < 0 || j >= n) return undefined
		return inArray ? arrayKey(j) : String(j)
	}

	pointerNames() {
		return ['i', 'parent', 'child', 'last']
	}

	// Live operations. x on a tree node removes it (on the root: extract-min / extract-max); the
	// Insert button appends a typed value and sifts it up.

	canRemoveNode(shape: HeapShape, key: string) {
		return !key.startsWith('a') && shape.props.values.length > 1
	}

	removeNodeAnimated(shape: HeapShape, key: string, keep: boolean) {
		const i = indexOfKey(key)
		const { values, heapType, marks } = shape.props
		if (i === undefined) return false
		const result = heapRemoveAt(values, i, heapType)
		const last = values.length - 1
		const moved = values.slice(0, -1)
		if (i < moved.length) moved[i] = values[last]
		// The removed value's mark goes; the last value's mark moves with it into the gap.
		let after: Marks = { ...marks }
		delete after[String(i)]
		if (i < last && marks[String(last)]) after[String(i)] = marks[String(last)]
		delete after[String(last)]
		const frames: Frame[] = [
			{
				flash: both(i, 'red'),
				caption: i === 0 ? `Extract the ${heapType}, ${values[0]}` : `Remove ${values[i]} (index ${i})`,
			},
			...(i < last
				? [{ props: { values: moved }, flash: both(i, 'orange'), caption: `Move the last value, ${values[last]}, into index ${i}` }]
				: []),
			// heapRemoveAt sifts the moved value up only if it now beats its parent, which means a swap.
			...this.siftFrames(moved, result, heapType, result.swaps.length > 0 && result.swaps[0][1] < result.swaps[0][0]),
		]
		after = result.swaps.reduce((m, [a, b]) => swapMarks(m, String(a), String(b)), after)
		this.play(shape, 'remove from heap', frames, keep, result.values, after, result.at >= 0 ? both(result.at, 'green') : {})
		return true
	}

	getInsertPrompt(shape: HeapShape) {
		const last = this.getScene(shape).nodes.find((n) => n.key === arrayKey(shape.props.values.length - 1))
		return last && { at: { x: last.x + last.w / 2 + 60, y: last.y }, label: 'Insert a value' }
	}

	insertKey(shape: HeapShape, value: string, keep: boolean) {
		const { values, heapType, marks } = shape.props
		const result = heapInsert(values, value, heapType)
		const appended = [...values, value]
		const frames: Frame[] = [
			{ props: { values: appended }, flash: both(values.length, 'orange'), caption: `Append ${value} at the end (index ${values.length})` },
			...this.siftFrames(appended, result, heapType, true),
		]
		const after = result.swaps.reduce((m, [a, b]) => swapMarks(m, String(a), String(b)), marks)
		this.play(shape, 'insert into heap', frames, keep, result.values, after, both(result.at, 'green'))
	}

	/**
	 * One frame per swap of a sift that moves a value `up` or down from `start` (the two values arc
	 * between their nodes), then one showing where it came to rest and why.
	 */
	private siftFrames(start: readonly string[], sift: Sift, type: HeapType, up: boolean): Frame[] {
		const values = [...start]
		// In a min heap smaller values go up; in a max heap larger ones.
		const [beats, yields, holds, child] = type === 'min' ? ['<', '≥', '≤', 'smaller'] : ['>', '≤', '≥', 'larger']
		const frames: Frame[] = sift.swaps.map(([a, b]) => {
			const caption = up
				? `${values[a]} ${beats} ${values[b]}, its parent: swap them`
				: `${values[b]} ${beats} ${values[a]}: ${values[b]} is the ${child} child, so swap them`
			;[values[a], values[b]] = [values[b], values[a]]
			return { props: { values: [...values] }, swaps: swapPairs(a, b), flash: { ...both(a, 'orange'), ...both(b, 'orange') }, caption }
		})
		const at = sift.at
		if (at < 0) return frames
		const v = values[at]
		const kids = childIndices(at).filter((c) => c < values.length)
		const caption = up
			? at === 0
				? `${v} is at the root: done`
				: `${v} ${yields} ${values[parentIndex(at)]}, its parent: done`
			: kids.length
				? `${v} ${holds} its children (${kids.map((c) => values[c]).join(', ')}): done`
				: `${v} has no children: done`
		return [...frames, { props: { values: [...values] }, flash: both(at, 'green'), caption }]
	}

	private play(
		shape: HeapShape,
		label: string,
		frames: Frame[],
		keep: boolean,
		values: string[],
		marks: Marks,
		finalFlash: Marks
	) {
		const keys = values.map((_, i) => String(i))
		// Pointers stay at their index in either view; one past the new end goes.
		const pointers = prunePointers(shape.props.pointers, [...keys, ...keys.map((k) => arrayKey(Number(k)))])
		const final: TLShapePartial<HeapShape> = {
			id: shape.id,
			type: HEAP_SHAPE_TYPE,
			props: { values, marks: pruneMarks(marks, keys), pointers },
		}
		playOperation(this.editor, {
			shapeId: shape.id,
			label,
			frames,
			final,
			finalFlash,
			keep,
			// Shift held: highlights become marks (stored per index, so drop the array-view keys).
			withMarks: (_update, highlights) => {
				const kept = Object.fromEntries(Object.entries(highlights).filter(([key]) => !key.startsWith('a')))
				return { ...final, props: { ...final.props, marks: pruneMarks({ ...final.props!.marks, ...kept }, keys) } }
			},
		})
	}

	private update(shape: HeapShape, values: string[]): TLShapePartial<HeapShape> {
		return { id: shape.id, type: HEAP_SHAPE_TYPE, props: { values } }
	}
}
