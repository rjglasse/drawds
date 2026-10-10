import type { CSSProperties } from 'react'
import {
	Group2d,
	Rectangle2d,
	SVGContainer,
	getColorValue,
	getIndices,
	type SvgExportContext,
	type TLFontFace,
	type TLHandle,
	type TLHandleDragInfo,
	type TLShape,
	type TLShapePartial,
	type TLThemeColors,
	type VecLike,
} from 'tldraw'
import { CellShapeUtil, type NodeOperation, type PlaybackLayout, type PointerDirection } from '../../cells/CellShapeUtil'
import { CueBadge } from '../../cells/CueBadge'
import { exportingStep } from '../../export/exporting'
import { StepExtrasSvg } from '../../export/StepExtrasSvg'
import { cueBadgeAt, showsColourCues } from '../../cells/cues'
import { pruneMarks, type Marks } from '../../cells/marks'
import { GROW_HANDLE_ID, growHandle, grownCount } from '../../controls/grow'
import { ControlButton } from '../../controls/ControlButton'
import { GrowGrip } from '../../controls/GrowGrip'
import { showsStructureControls } from '../../controls/visibility'
import { extendValues, fillValues, insertValue } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import { mulberry32, newSeed } from '../../data/random'
import { seedForSketch } from '../../data/seed'
import { animationMs, isBusy, playOperation, playbackFor, type Frame } from '../../nodelink/playback'
import { placePointers, type PointerAnchor } from '../../pointers/layout'
import { prunePointers, type Pointer } from '../../pointers/pointers'
import { ARRAY_SHAPE_TYPE, arrayShapeMigrations, arrayShapeProps, usedCount, type ArrayShape } from './array-shape-types'
import { arrayCells } from './cells'
import { openRecursionTree } from '../recursion/RecursionTreeShapeUtil'
import {
	allNumbers,
	appendFixed,
	appendMany,
	appendAccounting,
	binarySearch,
	recursiveBinarySearch,
	bubbleSort,
	deleteAt,
	deleteFixed,
	growFixed,
	hoarePartition,
	insertAt,
	insertFixed,
	insertionSort,
	linearSearch,
	mergeSort,
	partitionArray,
	selectionSort,
	sumByHalves,
	sumByRest,
	sumWithInvariant,
	withCell,
	withoutCell,
	withoutUsedCell,
	withUsedCell,
	type ArrayOperation,
	type ArrayState,
	type AuxRow,
} from './operations'
import { parseCutoff, partition3Array, quicksort } from './quicksorts'
import { allUnique, findMax, sentinelSearch } from './scans'
import { fisherYates, unfairShuffle, type ShuffleKind } from './shuffles'
import { everyRunOperation, manyRunsOperation, TALLY_MAX, TREE_MAX, type OutcomesMode } from '../outcomes/outcomes'
import { openOutcomes } from '../outcomes/OutcomesShapeUtil'
import { growthOperation, SORT_NAMES } from '../growth/growth'
import { openGrowth } from '../growth/GrowthShapeUtil'
import { COUNTED_SORTS, type CountedSort } from './sort-counts'
import { movesAnything, rearrange, reversedOrder, shuffledOrder, sortedOrder } from './rearrange'
import { arrayMarkers, frontOf, isUsed, usedIndices } from './kinds'
import { dequeue, enqueue, peekQueue, peekStack, pop, push } from './stack-queue'
import {
	arrayStepVector,
	getArrayGrowPoint,
	getArrayLayout,
	getArrayMetrics,
	getAuxLayout,
	hoveredCell,
	indexAlong,
	type ArrayLayout,
	type ArrayMetrics,
} from './layout'
import { bandReach, type Band } from '../../controls/BandSvg'
import { cellHandleId, cellOfHandle, crossSlides, frameSlides, orderSlides, swapCells, swapState, type Slides, type SwapDrag } from './swap'

/** How long values take to arc into their new cells (a swap, a sort, a shift). */
export const SLIDE_MS = 450

export class ArrayShapeUtil extends CellShapeUtil<ArrayShape> implements Refillable {
	static override type = ARRAY_SHAPE_TYPE
	static override props = arrayShapeProps
	static override migrations = arrayShapeMigrations

	readonly cells = arrayCells

	getDefaultProps(): ArrayShape['props'] {
		return {
			values: [''],
			direction: 'horizontal',
			showIndices: true,
			fill: 'random',
			range: 'medium',
			seed: 0,
			marks: {},
			pointers: [],
			sizing: 'grows',
			used: 1,
			kind: 'array',
			front: 0,
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	/** New values for the cells in use (a fixed array's spare slots stay blank). */
	refill(shape: ArrayShape): TLShapePartial<ArrayShape> {
		const { fill, seed, values, range } = shape.props
		// From index 0: a circular buffer's front goes back there.
		return {
			id: shape.id,
			type: ARRAY_SHAPE_TYPE,
			props: { front: 0, values: padded(fillValues(fill, seed, usedCount(shape.props), { range }), values.length) },
		}
	}

	/**
	 * Switching to a fixed capacity keeps every value in use (the grow grip then adds spare slots);
	 * switching back to growing drops the spare slots. Spare slots stay blank.
	 */
	override onBeforeUpdate(prev: ArrayShape, next: ArrayShape): ArrayShape | void {
		let shape = next
		const { kind, sizing } = next.props
		if (prev.props.sizing !== sizing || prev.props.kind !== kind) {
			// A circular buffer becoming something else is unwrapped first: its front moves to index 0.
			const before = { ...next.props, kind: prev.props.kind, sizing: prev.props.sizing }
			shape = { ...next, props: { ...unwrapped(before), kind, sizing, front: 0 } }
		}
		if (prev.props.sizing !== sizing) {
			const props = shape.props
			if (props.sizing === 'fixed') {
				shape = { ...shape, props: { ...props, used: props.values.length } }
			} else {
				const n = Math.max(1, Math.min(prev.props.used, props.values.length))
				const keep = Array.from({ length: n + 2 }, (_, i) => String(i - 1))
				shape = {
					...shape,
					props: {
						...props,
						used: n,
						values: props.values.slice(0, n),
						marks: pruneMarks(props.marks, keep),
						pointers: prunePointers(props.pointers, keep),
					},
				}
			}
		}
		return super.onBeforeUpdate(prev, shape) ?? (shape === next ? undefined : shape)
	}

	/**
	 * A handle under each cell (drag it onto another cell to swap their values; on the right edge
	 * for vertical arrays) plus the grow grip past the end.
	 */
	override getHandles(shape: ArrayShape): TLHandle[] {
		// While an operation shows its steps, the handles would sit on a state that isn't shown.
		if (isBusy(playbackFor(this.editor, shape.id))) return []
		const { values, kind } = shape.props
		const metrics = getArrayMetrics(shape.props)
		const layout = getArrayLayout(values.length, metrics)
		const indices = getIndices(values.length + 1)
		// A stack or queue changes only by its own operations: no swapping cells by hand.
		const swappable = kind === 'array' ? values.slice(0, usedCount(shape.props)) : []
		const handles: TLHandle[] = swappable.map((value, i) => {
			const { x, y } = layout.cellAt(i)
			const at =
				metrics.axis === 'horizontal' ? { x: x + metrics.cell / 2, y: y + metrics.cell } : { x: x + metrics.cell, y: y + metrics.cell / 2 }
			return { id: cellHandleId(i), type: 'vertex', label: `Swap ${value} with another cell`, index: indices[i], ...at }
		})
		handles.push(growHandle(this.growPoint(shape), indices[values.length]))
		return handles
	}

	override onHandleDragStart(shape: ArrayShape, { handle }: TLHandleDragInfo<ArrayShape>) {
		const from = cellOfHandle(handle.id)
		if (from !== undefined) swapState(this.editor).drag.set({ shapeId: shape.id, from, to: from, at: handle })
	}

	/**
	 * The grow grip adds or removes cells past the end, keeping existing values. A cell handle
	 * doesn't change the shape while dragging: it moves a ghost value and picks the target cell.
	 */
	override onHandleDrag(
		shape: ArrayShape,
		{ handle, initial = shape }: TLHandleDragInfo<ArrayShape>
	): TLShapePartial<ArrayShape> | void {
		const from = cellOfHandle(handle.id)
		if (from !== undefined) {
			const key = this.cells.cellAt(shape, handle)
			swapState(this.editor).drag.set({ shapeId: shape.id, from, to: key === undefined ? undefined : Number(key), at: handle })
			return
		}
		if (handle.id !== GROW_HANDLE_ID) return
		// A circular buffer is unwrapped first (front at 0), so its new spare slots come after its rear.
		const { values, fill, seed, marks, pointers, sizing } = unwrapped(initial.props)
		const metrics = getArrayMetrics(initial.props)
		const fixed = sizing === 'fixed'
		// A fixed array's grip changes its capacity: blank spare slots, never fewer cells than in use.
		const count = Math.max(
			fixed ? Math.max(1, usedCount(initial.props)) : 1,
			grownCount(values.length, this.growPoint(initial), handle, arrayStepVector(metrics.axis), metrics.cell)
		)
		return {
			id: shape.id,
			type: ARRAY_SHAPE_TYPE,
			props: {
				front: 0,
				values: fixed ? padded(values.slice(0, count), count) : extendValues(values, fill, seed, count, { range: shape.props.range }),
				marks: pruneMarks(
					marks,
					Array.from({ length: count }, (_, i) => String(i))
				),
				// Pointers may sit one past either end: -1 .. count.
				pointers: prunePointers(
					pointers,
					Array.from({ length: count + 2 }, (_, i) => String(i - 1))
				),
			},
		}
	}

	/** Dropping a cell on another swaps their values (and marks), with a short animation. */
	override onHandleDragEnd(shape: ArrayShape): TLShapePartial<ArrayShape> | void {
		const { drag } = swapState(this.editor)
		const current = drag.get()
		drag.set(null)
		if (!current || current.shapeId !== shape.id) return
		const { from, to } = current
		if (to === undefined || to === from) return
		this.slide(shape, { [from]: to, [to]: from })
		return { id: shape.id, type: ARRAY_SHAPE_TYPE, props: swapCells(shape.props.values, shape.props.marks, from, to) }
	}

	/** Animate values into their new cells once (`from`: new index -> old index). */
	slide(shape: ArrayShape, from: Record<number, number>) {
		const { last } = swapState(this.editor)
		const id = Date.now()
		last.set({ shapeId: shape.id, from, id })
		// Then forget it, so a later redraw (say, after an operation) doesn't play it again.
		this.editor.timers.setTimeout(() => last.get()?.id === id && last.set(null), SLIDE_MS + 100)
	}

	override onHandleDragCancel() {
		swapState(this.editor).drag.set(null)
	}

	// Operations, from the context menu. Searching and inserting / deleting start at the cell
	// right-clicked; sorting step by step and the instant rearrangements act on the whole array.

	override nodeOperations(shape: ArrayShape, key: string): NodeOperation[] {
		const k = Number(key)
		const { values, sizing, kind } = shape.props
		const n = usedCount(shape.props)
		// Stacks and queues work by their own operations, offered on the whole shape.
		if (kind !== 'array' || !Number.isInteger(k) || k < 0 || k >= n) return []
		const v = values[k]
		const search = { group: 'search', submenu: 'Basics' }
		const shift = { group: 'shift', submenu: 'Basics' }
		const find = (id: string, label: string, op: typeof binarySearch): NodeOperation[] => [
			...(v.trim() ? [{ ...search, id, label: `${label} for ${v}`, run: () => this.play(shape.id, label, (a) => op(a, v)) }] : []),
			{
				...search,
				id: `${id}-value`,
				label: `${label} for a value`,
				prompt: 'Value to find',
				run: (value?: string) => value !== undefined && this.play(shape.id, label, (a) => op(a, value)),
			},
		]
		return [
			...find('array-binary-search', 'Binary search', binarySearch),
			...find('array-binary-search-recursive', 'Binary search, recursive', recursiveBinarySearch),
			...find('array-linear-search', 'Linear search', linearSearch),
			...find('array-sentinel-search', 'Sentinel search', sentinelSearch),
			...(sizing === 'fixed'
				? [
						{
							...shift,
							id: 'array-insert',
							label: `Insert at index ${k}`,
							run: () => this.play(shape.id, 'insert', (a) => insertFixed(a, a.used!, k, this.newValue(shape.props, a.values.slice(0, a.used), k)), { whole: true }),
						},
						{
							...shift,
							id: 'array-delete',
							label: `Delete a[${k}] (${v})`,
							run: () => this.play(shape.id, 'delete', (a) => deleteFixed(a, a.used!, k), { whole: true }),
						},
					]
				: [
						{ ...shift, id: 'array-insert', label: `Insert at index ${k}`, run: () => this.play(shape.id, 'insert', (a) => this.insertOp(shape.id, a, k)) },
						...(values.length > 1
							? [{ ...shift, id: 'array-delete', label: `Delete a[${k}] (${v})`, run: () => this.play(shape.id, 'delete', (a) => deleteAt(a, k)) }]
							: []),
					]),
		]
	}

	override shapeOperations(shape: ArrayShape): NodeOperation[] {
		// Step by step in categories: Basics, Sorts, Shuffles (Misc, if ever needed: see NodeOperationsMenu).
		const sorts = { group: 'sort', submenu: 'Sorts' }
		const partitions = { group: 'partition', submenu: 'Sorts' }
		const quicksorts = { group: 'quicksort', submenu: 'Sorts' }
		const scans = { group: 'scan', submenu: 'Basics' }
		const shuffles = { group: 'shuffle', submenu: 'Shuffles' }
		const sums = { group: 'sum', submenu: 'Basics' }
		const actions = { section: 'actions' } as const
		const capacity = { group: 'capacity', submenu: 'Basics' }
		const sort = (id: string, label: string, op: (a: ArrayState) => ArrayOperation, family = sorts): NodeOperation => ({
			...family,
			id,
			label,
			run: () => this.play(shape.id, label.toLowerCase(), op),
		})
		// Lecture 10b: the sort last played here (insertion sort to begin with), counted as n grows.
		const counted = this.lastSorts.get(shape.id) ?? { sort: 'insertion-sort' as const, cutoff: 3 }
		const order = (id: string, label: string, make: (values: string[]) => number[]): NodeOperation => ({
			...actions,
			id,
			label,
			run: () => this.rearrange(shape.id, label.toLowerCase(), make),
		})
		const { kind } = shape.props
		if (kind !== 'array') return [...this.stackQueueOperations(shape), ...this.kindActions(shape)]
		const fixedOnly: NodeOperation[] =
			shape.props.sizing === 'fixed'
				? [
						{
							...capacity,
							id: 'array-append',
							label: 'Append a value (grows when full)',
							run: () => this.play(shape.id, 'append', (a) => appendFixed(a, a.used!, this.appendValue(shape.id, a)), { whole: true }),
						},
						{
							...capacity,
							id: 'array-grow',
							label: 'Grow: double the capacity',
							run: () => this.play(shape.id, 'grow', (a) => growFixed(a, a.used!), { whole: true }),
						},
						...(['double', 'plus-one'] as const).map((policy) => ({
							...capacity,
							id: `array-append-many-${policy}`,
							label: `Append 10 values, ${policy === 'double' ? 'doubling' : 'growing by one'} when full`,
							run: () => this.play(shape.id, 'append', (a) => appendMany(a, a.used!, this.appendValues(shape.id, a, 10), policy), { whole: true }),
						})),
						// Lecture 7's accounting method: 3 kr an append, 2 of them saved for the copies.
						{
							...capacity,
							id: 'array-append-accounting',
							label: 'Append 10 values, 3 kr each (accounting)',
							run: () => this.play(shape.id, 'append', (a) => appendAccounting(a, a.used!, this.appendValues(shape.id, a, 10)), { whole: true }),
						},
					]
				: []
		const n = usedCount(shape.props)
		return [
			// Scans counted in lectures 2 and 3: the largest value, and whether any two are equal.
			...(n < 1 ? [] : [{ ...scans, id: 'array-find-max', label: 'Find the largest (maxval)', run: () => this.play(shape.id, 'find the largest', findMax) }]),
			...(n < 2 ? [] : [{ ...scans, id: 'array-all-unique', label: 'All unique? (every pair)', run: () => this.play(shape.id, 'all unique?', allUnique) }]),
			// Lecture 2's shuffles, step by step: random picks from the pinned seed, if there is one.
			...(n < 2
				? []
				: [
						{
							...shuffles,
							id: 'array-unfair-shuffle',
							label: 'Unfair shuffle (swap with any)',
							run: () => this.play(shape.id, 'unfair shuffle', (a) => unfairShuffle(a, mulberry32(seedForSketch()))),
						},
						{
							...shuffles,
							id: 'array-fisher-yates',
							label: 'Fisher-Yates shuffle',
							run: () => this.play(shape.id, 'Fisher-Yates shuffle', (a) => fisherYates(a, mulberry32(seedForSketch()))),
						},
						// Every run (lecture 2's drawings) for up to three values; many runs tallied for up to four.
						...(n > TREE_MAX
							? []
							: [
									{
										...shuffles,
										id: 'array-unfair-every-run',
										label: 'Every run of the unfair shuffle (tree)',
										run: () => this.playOutcomes(shape.id, 'unfair', 'tree'),
									},
									{
										...shuffles,
										id: 'array-fisher-yates-every-run',
										label: 'Every run of Fisher-Yates (tree)',
										run: () => this.playOutcomes(shape.id, 'fisher-yates', 'tree'),
									},
								]),
						...(n > TALLY_MAX
							? []
							: [
									{
										...shuffles,
										id: 'array-unfair-many',
										label: 'Run the unfair shuffle many times',
										run: () => this.playOutcomes(shape.id, 'unfair', 'tally'),
									},
									{
										...shuffles,
										id: 'array-fisher-yates-many',
										label: 'Run Fisher-Yates many times',
										run: () => this.playOutcomes(shape.id, 'fisher-yates', 'tally'),
									},
								]),
					]),
			// Sorting needs two values in use.
			...(usedCount(shape.props) < 2
				? []
				: [
						sort('array-insertion-sort', 'Insertion sort', insertionSort),
						sort('array-selection-sort', 'Selection sort', selectionSort),
						sort('array-bubble-sort', 'Bubble sort', bubbleSort),
						sort('array-merge-sort', 'Merge sort', mergeSort),
						sort('array-partition', 'Partition around the last value', partitionArray, partitions),
						sort('array-hoare-partition', 'Hoare partition around the first value', hoarePartition, partitions),
						sort('array-partition-3way', 'Three-way partition (Dutch flag)', partition3Array, partitions),
						// Lecture 10: quicksort, and its improvements one at a time.
						sort('array-quicksort', 'Quicksort', (a) => quicksort(a), quicksorts),
						sort('array-quicksort-random', 'Quicksort, random pivot', (a) => quicksort(a, 'quicksort-random', { rng: mulberry32(seedForSketch()) }), quicksorts),
						sort('array-quicksort-median', 'Quicksort, median-of-three pivot', (a) => quicksort(a, 'quicksort-median'), quicksorts),
						sort('array-quicksort-3way', 'Quicksort, three-way partition', (a) => quicksort(a, 'quicksort-3way'), quicksorts),
						{
							...quicksorts,
							id: 'array-quicksort-cutoff',
							label: 'Quicksort, cut-off to insertion sort',
							prompt: 'Cut-off, e.g. 3',
							promptAt: '0',
							run: (k?: string) =>
								this.play(shape.id, 'quicksort, cut-off to insertion sort', (a) => quicksort(a, 'quicksort-cutoff', { cutoff: parseCutoff(k) }), {
									cutoff: parseCutoff(k),
								}),
						},
						{
							group: 'growth',
							submenu: 'Sorts',
							id: 'array-sort-growth',
							label: `Counts as n grows: ${SORT_NAMES[counted.sort].toLowerCase()}`,
							run: () => this.playGrowth(shape.id, counted.sort, counted.cutoff),
						},
					]),
			// Summing recursively, two ways, each with its recursion tree beside the array.
			...(usedCount(shape.props) < 1 || !allNumbers(shape.props.values.slice(0, usedCount(shape.props)))
				? []
				: [
						{ ...sums, id: 'array-sum-invariant', label: 'Sum with a loop: its invariant', run: () => this.play(shape.id, 'sum with its invariant', sumWithInvariant) },
						{ ...sums, id: 'array-sum-rest', label: 'Sum: last value + sum of the rest', run: () => this.play(shape.id, 'sum by last + rest', sumByRest) },
						{ ...sums, id: 'array-sum-halves', label: 'Sum by halves (divide and conquer)', run: () => this.play(shape.id, 'sum by halves', sumByHalves) },
					]),
			...fixedOnly,
			order('array-sort', 'Sort', (values) => sortedOrder(values)),
			order('array-sort-descending', 'Sort descending', (values) => sortedOrder(values, true)),
			order('array-shuffle', 'Shuffle', (values) => shuffledOrder(values.length, mulberry32(newSeed()))),
			order('array-reverse', 'Reverse', (values) => reversedOrder(values.length)),
			{ ...actions, id: 'array-reroll', label: 'New values', run: () => this.reroll(shape.id) },
			this.indicesToggle(shape),
		]
	}

	/** Indices under the cells, or not: Show in the menu. */
	private indicesToggle(shape: ArrayShape): NodeOperation {
		return {
			section: 'show',
			id: 'array-indices',
			label: shape.props.showIndices ? 'Hide indices' : 'Show indices',
			run: () => this.update(shape.id, 'toggle indices', (s) => ({ showIndices: !s.props.showIndices })),
		}
	}

	override menuName(shape: ArrayShape) {
		return { array: 'Array', stack: 'Stack', queue: 'Queue' }[shape.props.kind]
	}

	override readonly menuId = 'array'

	override moves(shape: ArrayShape) {
		const { kind } = shape.props
		return [
			'Double-click a cell to type; Tab and the arrows move on',
			...(kind === 'array'
				? ['Drag the + at the end to add cells; hover a cell for x (delete) and + (insert)', 'Drag the dot under a cell onto another cell to swap them']
				: [kind === 'stack' ? 'The + and x by the top push and pop, step by step' : 'The + by the rear enqueues and the x by the front dequeues, step by step']),
			'Style panel: Kind (array, stack, queue) and Length (growing, or a fixed capacity)',
		]
	}

	/**
	 * Play an operation on the array as it is now; its result (if any) is one undo step. It works on
	 * the values in use: a fixed array's spare slots are added back to every step, blank.
	 */
	/** The sort last played on each array (and its cut-off), for its counts as n grows. */
	private readonly lastSorts = new Map<ArrayShape['id'], { sort: CountedSort; cutoff: number }>()

	private play(
		id: ArrayShape['id'],
		label: string,
		operation: (array: ArrayState) => ArrayOperation,
		{ whole = false, opened, cutoff = 3 }: { whole?: boolean; opened?: () => void; cutoff?: number } = {}
	) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		if (!shape) return
		// `whole`: the operation gets every cell and the size (a fixed array's insert, grow...).
		const { values, marks } = whole ? shape.props : inUse(shape.props)
		// A growing array is as long as the operation makes it.
		const capacity = shape.props.sizing === 'fixed' && !whole ? shape.props.values.length : 0
		const op = operation({ values, marks, ...(whole ? { used: usedCount(shape.props), front: frontOf(shape.props) } : {}) })
		const frames = op.frames.map((f) => {
			const props = f.props as Partial<ArrayState> | undefined
			return props?.values ? { ...f, props: { ...props, values: padded(props.values, capacity) } } : f
		})
		const { finalFlash, code } = op
		if (code && (COUNTED_SORTS as readonly string[]).includes(code)) this.lastSorts.set(id, { sort: code as CountedSort, cutoff })
		const result = op.result && { ...op.result, values: padded(op.result.values, capacity) }
		const final = result && this.withValues(shape, result, result.used, result.front)
		// A recursive operation's calls go in a tree beside the array (Esc before the result takes it away,
		// and whatever else was `opened` beside it for this operation).
		const tree = openRecursionTree(this.editor, shape, frames, label)
		const onCancel =
			tree || opened
				? () => {
						tree?.()
						opened?.()
					}
				: undefined
		playOperation(this.editor, {
			shapeId: id,
			label,
			frames,
			final,
			finalFlash,
			onCancel,
			code,
			// Shift: the highlights become marks, on the cells there are afterwards.
			withMarks: (_update, highlights) => {
				const after = result ?? { values, marks }
				const kept = pruneMarks({ ...after.marks, ...highlights }, after.values.map((_, i) => String(i)))
				return final ? { ...final, props: { ...final.props, marks: kept } } : this.withMarks(shape, kept)
			},
		})
	}

	/**
	 * A shuffle's outcomes, played on the array as it is: every run as a tree, or many runs tallied,
	 * in a view beside it (opened first; Esc takes it back).
	 */
	private playOutcomes(id: ArrayShape['id'], kind: ShuffleKind, mode: OutcomesMode) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		if (!shape) return
		const seed = seedForSketch()
		const opened = openOutcomes(this.editor, shape, { kind, mode, values: inUse(shape.props).values, seed })
		const label = `${mode === 'tree' ? 'every run of' : 'many runs of'} ${kind === 'unfair' ? 'the unfair shuffle' : 'Fisher-Yates'}`
		this.play(id, label, (a) => (mode === 'tree' ? everyRunOperation(a, kind) : manyRunsOperation(a, kind, seed)), { opened })
	}

	/**
	 * A sort's comparisons at n = 10, 100 and 1000 on four kinds of input, filled in a row at a time in
	 * a table beside the array (opened first, unless one counts that sort already; Esc takes it back).
	 */
	private playGrowth(id: ArrayShape['id'], sort: CountedSort, cutoff: number) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		if (!shape) return
		const { seed, opened } = openGrowth(this.editor, shape, { sort, seed: seedForSketch(), cutoff })
		this.play(id, `${SORT_NAMES[sort].toLowerCase()} as n grows`, (a) => growthOperation(a, sort, seed, cutoff), { opened })
	}

	/** Insert a value that fits the fill mode (as growing does), at index k. */
	private insertOp(id: ArrayShape['id'], array: ArrayState, k: number) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		return insertAt(array, k, this.newValue(shape?.props ?? this.getDefaultProps(), array.values, k))
	}

	/**
	 * A stack's push / pop / peek or a queue's enqueue / dequeue / peek, step by step: the value to
	 * add is the fill mode's next one, or typed in.
	 */
	private stackQueueOperations(shape: ArrayShape): NodeOperation[] {
		const { kind, sizing } = shape.props
		const fixed = sizing === 'fixed'
		const id = shape.id
		const state = (a: ArrayState) => ({ ...a, used: a.used ?? a.values.length, front: a.front ?? 0, fixed })
		if (kind === 'stack') {
			const stack = { group: 'stack' }
			const pushIt = (value: string) => this.play(id, 'push', (a) => push(state(a), value), { whole: true })
			return [
				{ ...stack, id: 'array-push', label: 'Push', run: () => pushIt(this.nextValue(id)) },
				{
					...stack,
					id: 'array-push-value',
					label: 'Push a value',
					prompt: 'Value to push',
					promptAt: String(Math.max(0, usedCount(shape.props) - 1)),
					run: (value?: string) => value !== undefined && pushIt(value),
				},
				{ ...stack, id: 'array-pop', label: 'Pop', run: () => this.play(id, 'pop', (a) => pop(state(a)), { whole: true }) },
				{ ...stack, id: 'array-peek', label: 'Peek', run: () => this.play(id, 'peek', (a) => peekStack(state(a)), { whole: true }) },
			]
		}
		const queue = { group: 'queue' }
		const enqueueIt = (value: string) => this.play(id, 'enqueue', (a) => enqueue(state(a), value), { whole: true })
		const rear = arrayMarkers(shape.props).find((p) => p.name === 'rear')?.at ?? '0'
		return [
			{ ...queue, id: 'array-enqueue', label: 'Enqueue', run: () => enqueueIt(this.nextValue(id)) },
			{
				...queue,
				id: 'array-enqueue-value',
				label: 'Enqueue a value',
				prompt: 'Value to enqueue',
				promptAt: rear,
				run: (value?: string) => value !== undefined && enqueueIt(value),
			},
			{ ...queue, id: 'array-dequeue', label: 'Dequeue', run: () => this.play(id, 'dequeue', (a) => dequeue(state(a)), { whole: true }) },
			{ ...queue, id: 'array-peek', label: 'Peek', run: () => this.play(id, 'peek', (a) => peekQueue(state(a)), { whole: true }) },
		]
	}

	/** For a stack or queue: growing a fixed one, new values, indices (no sorting or rearranging). */
	private kindActions(shape: ArrayShape): NodeOperation[] {
		return [
			...(shape.props.sizing === 'fixed'
				? [
						{
							group: 'capacity',
							id: 'array-grow',
							label: 'Grow: double the capacity',
							run: () => this.play(shape.id, 'grow', (a) => growFixed(a, a.used!), { whole: true }),
						},
					]
				: []),
			{ section: 'actions', id: 'array-reroll', label: 'New values', run: () => this.reroll(shape.id) },
			this.indicesToggle(shape),
		]
	}

	/** The fill mode's next value, not one already in use: for a push or an enqueue. */
	private nextValue(id: ArrayShape['id']) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		if (!shape) return ''
		const { fill, seed, values, range } = shape.props
		const inUse = usedIndices(shape.props).map((i) => values[i])
		return extendValues(inUse, fill, seed, inUse.length + 1, { range })[inUse.length]
	}

	/** The next value of the fill mode's stream, for appending to the values in use. */
	private appendValue(id: ArrayShape['id'], array: ArrayState) {
		return this.appendValues(id, array, 1)[0]
	}

	/** The next `count` values of the fill mode's stream. */
	private appendValues(id: ArrayShape['id'], { values, used = values.length }: ArrayState, count: number) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		const { fill, seed, range } = shape?.props ?? this.getDefaultProps()
		return extendValues(values.slice(0, used), fill, seed, used + count, { range }).slice(used)
	}

	/** A value for a cell inserted at index k: between its neighbours if sorted, else not there yet. */
	private newValue({ fill, seed, range }: Pick<ArrayShape['props'], 'fill' | 'seed' | 'range'>, values: readonly string[], k: number) {
		return insertValue(values[k - 1], values[k], fill, seed, Date.now() % 100000, values, range)
	}

	/**
	 * Quick edits while the array is selected: an x on the cell near the pointer deletes it and a +
	 * on the boundary nearest the pointer inserts a value there (opened for typing); the values after
	 * slide over. Touch screens have no hover, so they show every button.
	 */
	private renderCellButtons(shape: ArrayShape, colors: TLThemeColors) {
		const { values, sizing, kind } = shape.props
		// Stacks and queues have their own buttons (push / pop, enqueue / dequeue).
		if (kind !== 'array') return null
		const n = values.length
		const used = usedCount(shape.props)
		const fixed = sizing === 'fixed'
		const metrics = getArrayMetrics(shape.props)
		const direction = metrics.axis
		const layout = getArrayLayout(n, metrics)
		const zoom = this.editor.getZoomLevel()
		const coarse = this.editor.getInstanceState().isCoarsePointer
		const point = this.editor.getPointInShapeSpace(shape, this.editor.inputs.getCurrentPagePoint())
		const hovered = coarse ? undefined : hoveredCell(point, n, metrics, 16 / zoom)
		if (!coarse && !hovered) return null
		const all = [...values.keys(), n]
		// An x on cells in use (a growing array keeps one); a + between them, not past the end where
		// the grow grip adds cells. A fixed array takes a + only while it has a spare slot, up to
		// just after its last value.
		const removable = (coarse ? all : [hovered!.index]).filter((k) => k < used && (fixed || n > 1))
		const boundaries = (coarse ? all : [hovered!.boundary]).filter((b) => (fixed ? used < n && b <= used : b < n))
		const { cell } = metrics
		const nudge = 5 / zoom
		return (
			<>
				{removable.map((k) => {
					const { x, y } = layout.cellAt(k)
					return (
						<ControlButton
							key={`remove-${k}`}
							editor={this.editor}
							kind="remove"
							at={{ x: x + cell + nudge, y: y - nudge }}
							label={`Delete a[${k}] (${values[k]})`}
							testId={`remove-cell-${k}`}
							colors={colors}
							onPress={() => this.pressDelete(shape.id, k)}
						/>
					)
				})}
				{boundaries.map((b) => {
					const { x, y } = layout.cellAt(b)
					return (
						<ControlButton
							key={`insert-${b}`}
							editor={this.editor}
							kind="insert"
							// On the boundary's lower (vertical: left) end, clear of the values and the x.
							at={direction === 'horizontal' ? { x, y: y + cell } : { x, y }}
							label={`Insert a value at index ${b}`}
							testId={`insert-cell-${b}`}
							colors={colors}
							onPress={() => this.pressInsert(shape.id, b)}
						/>
					)
				})}
			</>
		)
	}

	/**
	 * A stack's push (+) and pop (x) on its top cell's corners; a queue's enqueue (+) under its rear
	 * slot and dequeue (x) under its front cell, nudged apart for when the two meet (full or empty).
	 * They play the operations, with the fill mode's next value.
	 */
	private renderKindButtons(shape: ArrayShape, colors: TLThemeColors) {
		const { kind } = shape.props
		if (kind === 'array') return null
		const metrics = getArrayMetrics(shape.props)
		const layout = getArrayLayout(shape.props.values.length, metrics)
		const { cell } = metrics
		const nudge = 5 / this.editor.getZoomLevel()
		const used = usedCount(shape.props)
		const ops = this.stackQueueOperations(shape)
		const run = (id: string) => () => ops.find((op) => op.id === id)?.run()
		const button = (testId: string, kindOf: 'insert' | 'remove', at: VecLike, label: string, opId: string) => (
			<ControlButton key={testId} editor={this.editor} kind={kindOf} at={at} label={label} testId={testId} colors={colors} onPress={run(opId)} />
		)
		if (kind === 'stack') {
			const top = layout.cellAt(Math.max(0, used - 1))
			// Empty: push goes into cell 0, from its bottom edge.
			const edge = used ? top.y : layout.boundaryAt(0)
			return (
				<>
					{button('stack-push', 'insert', { x: top.x - nudge, y: edge - nudge }, 'Push (top = top + 1; a[top] = value)', 'array-push')}
					{used > 0 && button('stack-pop', 'remove', { x: top.x + cell + nudge, y: top.y - nudge }, 'Pop the top value', 'array-pop')}
				</>
			)
		}
		const markers = arrayMarkers(shape.props)
		const front = layout.cellAt(Number(markers[0].at))
		const rear = layout.cellAt(Number(markers[1].at))
		return (
			<>
				{button('queue-enqueue', 'insert', { x: rear.x + cell * 0.3, y: rear.y + cell }, 'Enqueue at the rear', 'array-enqueue')}
				{used > 0 && button('queue-dequeue', 'remove', { x: front.x + cell * 0.7, y: front.y + cell }, 'Dequeue from the front', 'array-dequeue')}
			</>
		)
	}

	/**
	 * Delete cell k at once (one undo step): the values after it slide one cell back. A fixed array
	 * keeps its capacity: its last used slot becomes a spare one.
	 */
	private pressDelete(id: ArrayShape['id'], k: number) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		if (!shape) return
		const { values, marks, sizing } = shape.props
		const used = usedCount(shape.props)
		const fixed = sizing === 'fixed'
		if (!fixed && values.length < 2) return
		this.editor.markHistoryStoppingPoint('delete cell')
		this.editor.updateShape(
			fixed
				? this.withValues(shape, withoutUsedCell({ values, marks }, k), used - 1)
				: this.withValues(shape, withoutCell({ values, marks }, k))
		)
		this.slide(shape, Object.fromEntries(values.slice(k + 1, used).map((_, j) => [k + j, k + j + 1])))
	}

	/**
	 * Insert a value at index k (one undo step), sliding the rest along, and open it for typing. A
	 * fixed array needs a spare slot, which the last value moves into.
	 */
	private pressInsert(id: ArrayShape['id'], k: number) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		if (!shape) return
		const { values, marks, sizing } = shape.props
		const used = usedCount(shape.props)
		const fixed = sizing === 'fixed'
		if (fixed && used >= values.length) return
		const value = this.newValue(shape.props, values.slice(0, used), k)
		this.editor.markHistoryStoppingPoint('insert cell')
		this.editor.updateShape(
			fixed
				? this.withValues(shape, withUsedCell({ values, marks }, used, k, value), used + 1)
				: this.withValues(shape, withCell({ values, marks }, k, value))
		)
		this.slide(shape, Object.fromEntries(values.slice(k, used).map((_, j) => [k + j + 1, k + j])))
		const updated = this.editor.getShape(id) as ArrayShape | undefined
		if (updated) this.editCell(updated, String(k))
	}

	/**
	 * New values and marks (pointers past the new end go); marks are dropped with their cells. For a
	 * fixed array, `used` changes its size.
	 */
	private withValues(shape: ArrayShape, { values, marks }: ArrayState, used?: number, front?: number): TLShapePartial<ArrayShape> {
		const n = values.length
		return {
			id: shape.id,
			type: ARRAY_SHAPE_TYPE,
			props: {
				values,
				...(used === undefined ? {} : { used }),
				...(front === undefined ? {} : { front }),
				marks: pruneMarks(
					marks,
					values.map((_, i) => String(i))
				),
				pointers: prunePointers(
					shape.props.pointers,
					Array.from({ length: n + 2 }, (_, i) => String(i - 1))
				),
			},
		}
	}

	/** Sort, shuffle or reverse at once: each value arcs to its new cell, marks with it. One undo step. */
	private rearrange(id: ArrayShape['id'], label: string, make: (values: string[]) => number[]) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		if (!shape) return
		// The values in use only: a fixed array's spare slots stay where they are.
		const { values, marks } = inUse(shape.props)
		const order = make(values)
		if (!movesAnything(order)) return
		const moved = rearrange(values, marks, order)
		this.editor.markHistoryStoppingPoint(label)
		this.editor.updateShape(this.withValues(shape, { ...moved, values: padded(moved.values, shape.props.values.length) }))
		this.slide(shape, orderSlides(order))
	}

	/** New random values from a fresh seed, in the shape's fill mode. */
	private reroll(id: ArrayShape['id']) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		if (!shape) return
		const seed = newSeed()
		this.update(id, 'new values', (s) => ({
			seed,
			front: 0,
			values: padded(fillValues(s.props.fill, seed, usedCount(s.props), { range: s.props.range }), s.props.values.length),
		}))
	}

	private update(id: ArrayShape['id'], label: string, change: (shape: ArrayShape) => Partial<ArrayShape['props']>) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		if (!shape) return
		this.editor.markHistoryStoppingPoint(label)
		this.editor.updateShape({ id, type: ARRAY_SHAPE_TYPE, props: change(shape) })
	}

	// Pointers: above the cells (right of a vertical array, whose indices are on the left). They can
	// step one past either end, as loops do (i == n, j == -1), where a dashed cell is drawn.

	pointerAnchor(shape: ArrayShape, key: string): PointerAnchor | undefined {
		const i = Number(key)
		const n = shape.props.values.length
		if (!Number.isInteger(i) || i < -1 || i > n) return undefined
		const metrics = getArrayMetrics(shape.props)
		const { x, y } = getArrayLayout(n, metrics).cellAt(i)
		return { box: { x, y, w: metrics.cell, h: metrics.cell }, side: metrics.axis === 'horizontal' ? 'above' : 'right' }
	}

	/** A stack's top, a queue's front and rear: drawn with the pointers, but not the user's to move. */
	markerPointers(shape: ArrayShape) {
		return arrayMarkers(shape.props)
	}

	override pointerTargetAt(shape: ArrayShape, point: VecLike): string | undefined {
		const { values } = shape.props
		const metrics = getArrayMetrics(shape.props)
		const { cells } = getArrayLayout(values.length, metrics)
		const [across, extent] = metrics.axis === 'horizontal' ? [point.y - cells.y, cells.h] : [point.x - cells.x, cells.w]
		// Generous across the array, so a pointer dropped on its label row still lands on the cell.
		if (across < -metrics.cell || across > extent + metrics.cell) return undefined
		const i = indexAlong(point, values.length, metrics)
		return i >= -1 && i <= values.length ? String(i) : undefined
	}

	pointerStep(shape: ArrayShape, key: string, direction: PointerDirection): string | undefined {
		const axis = getArrayMetrics(shape.props).axis
		const step =
			axis === 'horizontal'
				? { left: -1, right: 1, up: 0, down: 0 }[direction]
				: axis === 'vertical'
					? { up: -1, down: 1, left: 0, right: 0 }[direction]
					: { up: 1, down: -1, left: 0, right: 0 }[direction]
		const next = String(Number(key) + step)
		return step && this.pointerAnchor(shape, next) ? next : undefined
	}

	pointerNames() {
		return ['i', 'j', 'k', 'lo', 'mid', 'hi']
	}

	/** Room made above and before the array for pointers (see `getArrayMetrics`). */
	override layoutOffset(shape: ArrayShape) {
		return getArrayMetrics(shape.props).origin
	}

	private growPoint(shape: ArrayShape) {
		return getArrayGrowPoint(shape.props.values.length, getArrayMetrics(shape.props))
	}

	/** A fixed array's spare slots hold nothing to edit: a double-click on one starts no edit. */
	override canEdit(shape: ArrayShape) {
		const point = this.editor.getPointInShapeSpace(shape, this.editor.inputs.getCurrentPagePoint())
		const { cells } = getArrayLayout(shape.props.values.length, getArrayMetrics(shape.props))
		const overCells = point.x >= cells.x && point.x <= cells.x + cells.w && point.y >= cells.y && point.y <= cells.y + cells.h
		return !overCells || this.cells.cellAt(shape, point) !== undefined
	}

	// Cell size comes from the size style, not from dragging handles.
	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	getGeometry(shape: ArrayShape) {
		const metrics = getArrayMetrics(shape.props)
		// The cells shown: an operation's step may have one more (making room to insert). It only
		// ever grows past the end, so the origin stays put. Reactive (tldraw caches it in a computed).
		// (An upright array's extra cells rise above it for a moment: its own cells count.)
		const count = metrics.axis === 'up' ? shape.props.values.length : this.displayShape(shape).props.values.length
		const layout = getArrayLayout(count, metrics)
		const { box } = layout
		const body = new Rectangle2d({ x: box.x, y: box.y, width: box.w, height: box.h, isFilled: true })
		// A second row (a new array being filled) lies under or right of the array: inside the box.
		const aux = this.displayAux(shape)
		const auxBounds = aux && getAuxLayout(aux.values.length, metrics, layout).bounds
		const extra = auxBounds ? [new Rectangle2d({ x: auxBounds.x, y: auxBounds.y, width: auxBounds.w, height: auxBounds.h, isFilled: true })] : []
		const pointers = this.pointerGeometry(shape)
		if (!pointers.length && !extra.length) return body
		// Cells a pointer reaches past either end are drawn too, so they count in the bounds.
		const slots = this.offEndSlots(shape).map((i) => {
			const { box } = this.pointerAnchor(shape, String(i))!
			return new Rectangle2d({ x: box.x, y: box.y, width: box.w, height: box.h, isFilled: false })
		})
		return new Group2d({ children: [body, ...extra, ...pointers, ...slots] })
	}

	/** Indices just off the array (-1, n) that a pointer is at. */
	private offEndSlots(shape: ArrayShape, pointers: readonly Pointer[] = [...shape.props.pointers, ...arrayMarkers(shape.props)]) {
		const n = shape.props.values.length
		return [-1, n].filter((i) => pointers.some((p) => p.at === String(i)))
	}

	/**
	 * The props being shown: while an operation plays, its step's values and marks over the shape's
	 * own. (Pointers stay the shape's, so the drawing's origin doesn't move.) Reactive.
	 */
	displayShape(shape: ArrayShape, frame: Frame | undefined = playbackFor(this.editor, shape.id)?.frame): ArrayShape {
		const props = frame?.props as (Partial<ArrayShape['props']> & { aux?: AuxRow }) | undefined
		if (!props) return shape
		const { aux: _aux, ...rest } = props
		return { ...shape, props: { ...shape.props, ...rest, pointers: shape.props.pointers } }
	}

	/** A second row of cells the operation's step shows under the array (a new array), if any. */
	private displayAux(shape: ArrayShape, frame: Frame | undefined = playbackFor(this.editor, shape.id)?.frame): AuxRow | undefined {
		return (frame?.props as { aux?: AuxRow } | undefined)?.aux
	}

	/** The step's own pointers (lo, mid, hi...), if it has any: drawn by the play overlay. */
	private framePointers(shape: ArrayShape, frame: Frame | undefined = playbackFor(this.editor, shape.id)?.frame): Pointer[] | undefined {
		return frame?.pointers
	}

	/** What a step draws (shape space): the cells it shows, with any second row and dashed slots past the end. */
	override playbackLayout(shape: ArrayShape, frame: Frame | undefined): PlaybackLayout {
		const shown = this.displayShape(shape, frame)
		const metrics = getArrayMetrics(shape.props)
		const { values } = shown.props
		const layout = getArrayLayout(values.length, metrics)
		const framePointers = this.framePointers(shape, frame)
		const slots = framePointers
			? this.offEndSlots(shown, framePointers).map((i) => ({ ...layout.cellAt(i), w: metrics.cell, h: metrics.cell }))
			: []
		const sceneMetrics = { fontSize: metrics.fontSize, labelFontSize: metrics.indexFontSize, strokeWidth: metrics.strokeWidth }
		const aux = this.displayAux(shape, frame)
		const auxBounds = aux && getAuxLayout(aux.values.length, metrics, layout).bounds
		const below = Math.max(layout.box.y + layout.box.h, ...slots.map((b) => b.y + b.h), auxBounds ? auxBounds.y + auxBounds.h : -Infinity)
		// The step's band: under a row of cells (past the indices), or right of a column.
		const band: Band | undefined = frame?.band && this.bandFor(layout, metrics, frame.band, below)
		const bottom = band?.side === 'below' ? band.y + bandReach(sceneMetrics) : below
		return {
			left: layout.box.x,
			bottom,
			band,
			metrics: sceneMetrics,
			color: shape.props.color,
			fontFamily: this.getFontFamily(shape),
			pointers: framePointers && {
				placed: placePointers(framePointers, (key) => this.pointerAnchor(shown, key), this.getPointerFontSize(shape), { apart: true }),
				fontSize: this.getPointerFontSize(shape),
				slots,
			},
		}
	}

	/** Where a step's band goes: along cells from..to, under them in a row (below `under`), right of them in a column. */
	private bandFor(layout: ArrayLayout, metrics: ArrayMetrics, { from, to, label }: NonNullable<Frame['band']>, under: number): Band {
		const [a, b] = [layout.cellAt(from), layout.cellAt(to)]
		const x = Math.min(a.x, b.x)
		const y = Math.min(a.y, b.y)
		const w = Math.abs(a.x - b.x) + metrics.cell
		const h = Math.abs(a.y - b.y) + metrics.cell
		return metrics.axis === 'horizontal'
			? { x, y: under, w, h: 0, side: 'below', label }
			: { x: layout.box.x + layout.box.w, y, w: 0, h, side: 'right', label }
	}

	component(shape: ArrayShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		const editingKey = this.getEditingKey(shape)
		const { drag, last } = swapState(this.editor)
		const dragging = drag.get()
		const swapped = last.get()
		const playing = playbackFor(this.editor, shape.id)
		const frame = playing?.frame
		// While a step shows its own pointers they are drawn in front of the canvas (PlaybackOverlay).
		const framePointers = !!frame?.pointers
		const slides: Slides | undefined =
			frame && (frame.swaps?.length || frame.moves?.length)
				? { from: frameSlides(frame.swaps, frame.moves), id: playing.id, ms: animationMs(SLIDE_MS, playing) }
				: swapped?.shapeId === shape.id
					? swapped
					: undefined
		const aux = this.displayAux(shape)
		const cross = frame?.moves?.length && playing ? { ...crossSlides(frame.moves), id: playing.id } : undefined
		return (
			<>
				<SVGContainer>
					<ArraySvg
						shape={this.displayShape(shape)}
						metrics={getArrayMetrics(shape.props)}
						colors={colors}
						fontFamily={this.getFontFamily(shape)}
						hiddenIndex={editingKey === undefined ? undefined : Number(editingKey)}
						drag={dragging?.shapeId === shape.id ? dragging : undefined}
						slides={slides}
						flash={playing && { marks: playing.flash, fading: playing.fading, id: playing.id }}
						dim={playing && !playing.fading ? (playing.dim ?? []) : undefined}
						pulse={playing && !playing.fading ? playing.pulse : undefined}
						badges={playing && !playing.fading ? playing.badges : undefined}
						offEnd={framePointers ? [] : this.offEndSlots(shape)}
						aux={aux}
						cross={cross}
						cues={showsColourCues()}
					/>
					{!framePointers && this.renderPointers(shape, colors)}
					{showsStructureControls(this.editor, shape) && !isBusy(playing) && (
						<GrowGrip at={this.growPoint(shape)} zoom={this.editor.getZoomLevel()} colors={colors} />
					)}
				</SVGContainer>
				{showsStructureControls(this.editor, shape) &&
					!isBusy(playing) &&
					this.editor.isIn('select.idle') && (
						<>
							{this.renderCellButtons(shape, colors)}
							{this.renderKindButtons(shape, colors)}
						</>
					)}
				{this.renderOperationPrompt(shape, colors)}
				{this.renderPointerOverlays(shape, colors)}
				{this.renderCellEditor(shape)}
			</>
		)
	}

	override toSvg(shape: ArrayShape, ctx: SvgExportContext) {
		const colors = this.editor.getCurrentTheme().colors[ctx.colorMode]
		// Exporting an operation's steps: this one as the canvas shows it (values at rest), with its
		// pointers, strips and caption.
		const step = exportingStep(this.editor, shape.id)
		if (step) {
			const framePointers = !!step.frame?.pointers
			return (
				<>
					<ArraySvg
						shape={this.displayShape(shape)}
						metrics={getArrayMetrics(shape.props)}
						colors={colors}
						fontFamily={this.getFontFamily(shape)}
						flash={{ marks: step.flash, fading: false, id: step.id }}
						dim={step.dim ?? []}
						badges={step.badges}
						offEnd={framePointers ? [] : this.offEndSlots(shape)}
						aux={this.displayAux(shape)}
						cues={showsColourCues()}
					/>
					{!framePointers && this.renderPointers(shape, colors, { exporting: true })}
					<StepExtrasSvg util={this as unknown as CellShapeUtil<TLShape>} shape={shape} view={step} colors={colors} />
				</>
			)
		}
		return (
			<>
				<ArraySvg shape={shape} colors={colors} fontFamily={this.getFontFamily(shape)} offEnd={this.offEndSlots(shape)} cues={showsColourCues()} />
				{this.renderPointers(shape, colors, { exporting: true })}
			</>
		)
	}

	getIndicatorPath(shape: ArrayShape) {
		// The values shown, so the outline follows an operation that adds or removes a cell.
		const { cells } = getArrayLayout(this.displayShape(shape).props.values.length, getArrayMetrics(shape.props))
		const path = new Path2D()
		path.rect(cells.x, cells.y, cells.w, cells.h)
		return path
	}

	override getFontFaces(shape: ArrayShape): TLFontFace[] {
		return this.editor.getCurrentTheme().fonts[shape.props.font].faces ?? []
	}

	getCellFont(shape: ArrayShape) {
		return { fontFamily: this.getFontFamily(shape), fontSize: getArrayMetrics(shape.props).fontSize }
	}

	private getFontFamily(shape: ArrayShape) {
		return this.editor.getCurrentTheme().fonts[shape.props.font].fontFamily
	}
}

/** Values padded with blank spare slots to `capacity` cells. */
function padded(values: readonly string[], capacity: number): string[] {
	return values.length >= capacity ? [...values] : [...values, ...Array<string>(capacity - values.length).fill('')]
}

/** A circular buffer moved round so its front is index 0, marks with its values; anything else as it is. */
function unwrapped(props: ArrayShape['props']): ArrayShape['props'] {
	if (!frontOf(props)) return props
	const order = usedIndices(props)
	const marks: Marks = {}
	order.forEach((i, k) => {
		const mark = props.marks[String(i)]
		if (mark) marks[String(k)] = mark
	})
	return { ...props, front: 0, marks, values: padded(order.map((i) => props.values[i]), props.values.length) }
}

/** The values in use and their marks (all of them, unless the capacity is fixed). */
function inUse(props: ArrayShape['props']): ArrayState {
	const n = usedCount(props)
	return {
		values: props.values.slice(0, n),
		marks: pruneMarks(
			props.marks,
			Array.from({ length: n }, (_, i) => String(i))
		),
	}
}

function ArraySvg({
	shape,
	colors,
	fontFamily,
	hiddenIndex,
	drag,
	slides,
	flash,
	badges,
	dim,
	pulse,
	offEnd = [],
	aux,
	cross,
	cues,
	metrics = getArrayMetrics(shape.props),
}: {
	shape: ArrayShape
	/** The shape's own metrics: a step showing more cells mustn't move an upright array's origin. */
	metrics?: ArrayMetrics
	colors: TLThemeColors
	fontFamily: string
	/** Indices just off the array that a pointer is at: drawn as dashed cells. */
	offEnd?: number[]
	/** Cell whose value is drawn by the inline editor instead. */
	hiddenIndex?: number
	/** A cell being dragged onto another (canvas only). */
	drag?: SwapDrag
	/** Values arcing into their new cells: a swap, a sort, a step's swaps or shifts (canvas only). */
	slides?: Slides
	/** Canvas only: an operation's highlights, fading out once it is dismissed. */
	flash?: { marks: Marks; fading: boolean; id: number }
	/** A step's small notes in cells' corners, by index (the kronor an append saved there). */
	badges?: Record<string, string>
	/** Canvas only, while an operation is open: cells out of play, drawn faded (in or out). */
	dim?: readonly string[]
	/** Canvas only, in predict mode: the cells the play bar's question is about, ringed in pulsing violet. */
	pulse?: readonly string[]
	/** Canvas only: a second row under the array, such as a new array being filled. */
	aux?: AuxRow
	/** Values moving between the array and the second row this step. */
	cross?: { toAux: Record<number, number>; toMain: Record<number, number>; id: number }
	/** Colour-blind cues: marked and highlighted cells get a shape badge (`cues.ts`). */
	cues?: boolean
}) {
	const { values, showIndices, color, marks, sizing, kind } = shape.props
	const direction = metrics.axis
	const layout = getArrayLayout(values.length, metrics)
	const fixed = sizing === 'fixed'
	const used = usedCount(shape.props)
	const { cells, cellAt } = layout
	const { cell, strokeWidth } = metrics
	const stroke = getColorValue(colors, color, 'solid')
	const textSize = (value: string) => metrics.fontSize * Math.min(1, 2.5 / Math.max(1, value.length))
	const badgeAt = (i: number) => {
		const { x, y } = cellAt(i)
		return cueBadgeAt({ x: x + cell / 2, y: y + cell / 2, w: cell, h: cell }, false, strokeWidth * 1.2)
	}

	// A value arcs from its old cell into its new one: those moving towards the end over the array,
	// those moving back under it, so two that swap or cross pass each other. When every value moves
	// the same way (a shift) none cross, so they slide straight along.
	const moves = Object.entries(slides?.from ?? {}).map(([to, from]) => Math.sign(Number(to) - from))
	const crossing = moves.includes(1) && moves.includes(-1)
	const slideStyle = (i: number): CSSProperties | undefined => {
		const from = slides?.from[i]
		if (from === undefined || from === i) return undefined
		const dx = cellAt(from).x - cellAt(i).x
		const dy = cellAt(from).y - cellAt(i).y
		const lift = crossing ? (i > from ? -1 : 1) * cell * Math.min(0.9, 0.35 + 0.15 * Math.abs(i - from)) : 0
		const [mx, my] = direction === 'horizontal' ? [dx / 2, dy / 2 + lift] : [dx / 2 + lift, dy / 2]
		return {
			'--from-x': `${dx}px`,
			'--from-y': `${dy}px`,
			'--mid-x': `${mx}px`,
			'--mid-y': `${my}px`,
			animation: `drawds-swap ${slides?.ms ?? SLIDE_MS}ms ease-in-out`,
		} as CSSProperties
	}
	const dimmed = new Set(dim)
	const auxLayout = aux && getAuxLayout(aux.values.length, metrics, layout)
	// Values moving up from a second row the step no longer draws (a = newArr): where it was, as
	// long as the array now is.
	const fromBelow = auxLayout ?? (cross && Object.keys(cross.toMain).length ? getAuxLayout(values.length, metrics, layout) : undefined)
	// Between the rows a value moves straight down (or across) to its cell, or back up.
	const crossStyle = (to: { x: number; y: number }, from: { x: number; y: number }): CSSProperties => {
		const dx = from.x - to.x
		const dy = from.y - to.y
		return {
			'--from-x': `${dx}px`,
			'--from-y': `${dy}px`,
			'--mid-x': `${dx / 2}px`,
			'--mid-y': `${dy / 2}px`,
			animation: `drawds-swap ${slides?.ms ?? SLIDE_MS}ms ease-in-out`,
		} as CSSProperties
	}

	return (
		<g fontFamily={fontFamily} textAnchor="middle" dominantBaseline="central">
			{offEnd.map((i) => (
				<rect
					key={`off-${i}`}
					x={cellAt(i).x}
					y={cellAt(i).y}
					width={cell}
					height={cell}
					fill="none"
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 2.5}`}
					opacity={0.45}
				/>
			))}
			<rect
				x={cells.x}
				y={cells.y}
				width={cells.w}
				height={cells.h}
				fill={values.length ? getColorValue(colors, color, 'semi') : 'none'}
				stroke={stroke}
				strokeWidth={strokeWidth}
				strokeLinejoin="round"
				// An emptied growing stack or queue: a dashed outline where its first value would go.
				strokeDasharray={values.length ? undefined : `${strokeWidth * 3} ${strokeWidth * 2.5}`}
				opacity={values.length ? 1 : 0.5}
			/>
			{fixed &&
				// Spare slots: blank, so the cells in use stand out (a circular buffer's may wrap round).
				values.map((_, i) =>
					isUsed(shape.props, i) ? null : (
						<rect
							key={`spare-${i}`}
							x={cellAt(i).x + strokeWidth / 2}
							y={cellAt(i).y + strokeWidth / 2}
							width={cell - strokeWidth}
							height={cell - strokeWidth}
							fill={colors.background}
						/>
					)
				)}
			{values.slice(1).map((_, k) => {
				const at = layout.boundaryAt(k + 1)
				const { x, y } = cellAt(k + 1)
				// Where the cells in use end, a heavier line (a queue has its front and rear instead).
				const width = fixed && kind !== 'queue' && k + 1 === used ? strokeWidth * 2.4 : strokeWidth
				return direction === 'horizontal' ? (
					<line key={k} x1={at} y1={y} x2={at} y2={y + cell} stroke={stroke} strokeWidth={width} />
				) : (
					<line key={k} x1={x} y1={at} x2={x + cell} y2={at} stroke={stroke} strokeWidth={width} />
				)
			})}
			{fixed && (
				<text
					x={layout.footerAt.x}
					y={layout.footerAt.y}
					textAnchor="start"
					fontSize={metrics.indexFontSize}
					fill={colors.text}
					opacity={0.7}
					data-testid="array-capacity"
				>
					size {used} · capacity {values.length}
				</text>
			)}
			{values.map((_, i) => {
				const mark = marks[String(i)]
				if (!mark) return null
				const { x, y } = cellAt(i)
				return (
					<g key={`mark-${i}`}>
						<rect
							x={x}
							y={y}
							width={cell}
							height={cell}
							fill={getColorValue(colors, mark, 'semi')}
							stroke={getColorValue(colors, mark, 'solid')}
							strokeWidth={strokeWidth * 1.6}
							strokeLinejoin="round"
						/>
						{cues && <CueBadge color={mark} at={badgeAt(i)} colors={colors} strokeWidth={strokeWidth} />}
					</g>
				)
			})}
			{flash &&
				values.map((_, i) => {
					const color = flash.marks[String(i)]
					if (!color) return null
					const { x, y } = cellAt(i)
					return (
						// A new key per step restarts the element, which (once dismissed) starts the fade.
						<g key={`flash-${i}-${flash.id}`} className={flash.fading ? 'drawds-flash drawds-flash-fade' : 'drawds-flash'}>
							<rect
								x={x}
								y={y}
								width={cell}
								height={cell}
								fill={getColorValue(colors, color, 'semi')}
								stroke={getColorValue(colors, color, 'solid')}
								strokeWidth={strokeWidth * 1.6}
								strokeLinejoin="round"
							/>
							{cues && <CueBadge color={color} at={badgeAt(i)} colors={colors} strokeWidth={strokeWidth} />}
						</g>
					)
				})}
			{dim &&
				values.map((_, i) => {
					const { x, y } = cellAt(i)
					return (
						<rect
							key={`dim-${i}`}
							x={x}
							y={y}
							width={cell}
							height={cell}
							fill={colors.background}
							opacity={dimmed.has(String(i)) ? 0.6 : 0}
							style={{ transition: 'opacity 300ms ease-in-out' }}
						/>
					)
				})}
			{pulse?.map((key) => {
				const i = Number(key)
				if (!Number.isInteger(i) || i < 0 || i >= values.length) return null
				const { x, y } = cellAt(i)
				// Inside the cell: neighbours share its edges, and the shape's box ends at the outer ones.
				return (
					<rect
						key={`pulse-${i}`}
						className="drawds-pulse"
						data-pulse={key}
						x={x + strokeWidth * 2}
						y={y + strokeWidth * 2}
						width={cell - strokeWidth * 4}
						height={cell - strokeWidth * 4}
						rx={strokeWidth}
						fill="none"
						stroke={getColorValue(colors, 'violet', 'solid')}
						strokeWidth={strokeWidth * 2}
					/>
				)
			})}
			{drag?.to !== undefined && drag.to !== drag.from && (
				<rect
					x={cellAt(drag.to).x + strokeWidth}
					y={cellAt(drag.to).y + strokeWidth}
					width={cell - strokeWidth * 2}
					height={cell - strokeWidth * 2}
					fill="none"
					stroke={colors.selectionStroke}
					strokeWidth={strokeWidth * 1.5}
					strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 2}`}
				/>
			)}
			{values.map((value, i) => {
				if (i === hiddenIndex) return null
				const { x, y } = cellAt(i)
				const up = cross?.toMain[i]
				const animated = up !== undefined && fromBelow ? crossStyle(cellAt(i), fromBelow.cellAt(up)) : slideStyle(i)
				// A spare slot's value (what a pop left there) is still in memory but off the stack: faded.
				const faded = dimmed.has(String(i)) || (fixed && !isUsed(shape.props, i))
				return (
					<text
						// A new key per move remounts the texts that move, which restarts their animation.
						key={up !== undefined ? `${i}:up-${cross!.id}` : animated ? `${i}:${slides!.id}` : i}
						x={x + cell / 2}
						y={y + cell / 2}
						fontSize={textSize(value)}
						fill={colors.text}
						opacity={drag?.from === i ? 0.25 : faded ? 0.35 : 1}
						style={{ ...animated, transition: 'opacity 300ms ease-in-out' }}
					>
						{value}
					</text>
				)
			})}
			{badges &&
				values.map((_, i) => {
					const note = badges[String(i)]
					if (!note) return null
					const { x, y } = cellAt(i)
					return (
						<text
							key={`badge-${i}`}
							data-badge={i}
							x={x + cell - strokeWidth * 2}
							y={y + strokeWidth * 2}
							fontSize={metrics.indexFontSize * 0.85}
							textAnchor="end"
							dominantBaseline="hanging"
							fill={getColorValue(colors, 'green', 'solid')}
						>
							{note}
						</text>
					)
				})}
			{drag && (
				<text x={drag.at.x} y={drag.at.y - cell * 0.35} fontSize={textSize(values[drag.from] ?? '')} fill={colors.text} opacity={0.85}>
					{values[drag.from]}
				</text>
			)}
			{showIndices &&
				[...values.keys(), ...offEnd].map((i) => {
					const { x, y } = layout.indexAt(i)
					return (
						<text key={`i${i}`} x={x} y={y} fontSize={metrics.indexFontSize} fill={colors.text} opacity={i < 0 || i >= values.length ? 0.3 : 0.5}>
							{i}
						</text>
					)
				})}
			{aux && auxLayout && (
				<g data-testid="array-aux">
					<text x={auxLayout.titleAt.x} y={auxLayout.titleAt.y} textAnchor="start" fontSize={metrics.indexFontSize} fill={colors.text} opacity={0.8}>
						{aux.title}
					</text>
					<rect
						x={auxLayout.cells.x}
						y={auxLayout.cells.y}
						width={auxLayout.cells.w}
						height={auxLayout.cells.h}
						fill={getColorValue(colors, color, 'semi')}
						stroke={stroke}
						strokeWidth={strokeWidth}
						strokeLinejoin="round"
					/>
					{aux.values.slice(1).map((_, k) => {
						const { x, y } = auxLayout.cellAt(k + 1)
						// Upright, the line between cells k and k + 1 is the bottom of cell k + 1.
						const lineY = direction === 'up' ? y + cell : y
						return direction === 'horizontal' ? (
							<line key={k} x1={x} y1={y} x2={x} y2={y + cell} stroke={stroke} strokeWidth={strokeWidth} />
						) : (
							<line key={k} x1={x} y1={lineY} x2={x + cell} y2={lineY} stroke={stroke} strokeWidth={strokeWidth} />
						)
					})}
					{aux.values.map((value, j) => {
						const { x, y } = auxLayout.cellAt(j)
						const down = cross?.toAux[j]
						return (
							<text
								key={down !== undefined ? `aux${j}:${cross!.id}` : `aux${j}`}
								x={x + cell / 2}
								y={y + cell / 2}
								fontSize={textSize(value)}
								fill={colors.text}
								style={down !== undefined ? crossStyle(auxLayout.cellAt(j), cellAt(down)) : undefined}
							>
								{value}
							</text>
						)
					})}
					{showIndices &&
						aux.values.map((_, j) => {
							const { x, y } = auxLayout.indexAt(j)
							return (
								<text key={`ai${j}`} x={x} y={y} fontSize={metrics.indexFontSize} fill={colors.text} opacity={0.5}>
									{j}
								</text>
							)
						})}
				</g>
			)}
		</g>
	)
}
