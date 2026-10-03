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
	type TLShapePartial,
	type TLThemeColors,
	type VecLike,
} from 'tldraw'
import { CellShapeUtil, type NodeOperation, type PlaybackLayout, type PointerDirection } from '../../cells/CellShapeUtil'
import { pruneMarks, type Marks } from '../../cells/marks'
import { GROW_HANDLE_ID, growHandle, grownCount } from '../../controls/grow'
import { GrowGrip } from '../../controls/GrowGrip'
import { showsStructureControls } from '../../controls/visibility'
import { extendValues, fillValues, insertValue } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import { mulberry32, newSeed } from '../../data/random'
import { isBusy, playOperation, playbackFor, type Strip } from '../../nodelink/playback'
import { stripsHeight } from '../../nodelink/SceneSvg'
import { placePointers, type PointerAnchor } from '../../pointers/layout'
import { prunePointers, type Pointer } from '../../pointers/pointers'
import { ARRAY_SHAPE_TYPE, arrayShapeMigrations, arrayShapeProps, type ArrayShape } from './array-shape-types'
import { arrayCells } from './cells'
import {
	binarySearch,
	bubbleSort,
	deleteAt,
	insertAt,
	insertionSort,
	linearSearch,
	selectionSort,
	type ArrayOperation,
	type ArrayState,
} from './operations'
import { movesAnything, rearrange, reversedOrder, shuffledOrder, sortedOrder } from './rearrange'
import { getArrayGrowPoint, getArrayLayout, getArrayMetrics } from './layout'
import { cellHandleId, cellOfHandle, frameSlides, orderSlides, swapCells, swapState, type Slides, type SwapDrag } from './swap'

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
			seed: 0,
			marks: {},
			pointers: [],
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	refill(shape: ArrayShape): TLShapePartial<ArrayShape> {
		const { fill, seed, values } = shape.props
		return { id: shape.id, type: ARRAY_SHAPE_TYPE, props: { values: fillValues(fill, seed, values.length) } }
	}

	/**
	 * A handle under each cell (drag it onto another cell to swap their values; on the right edge
	 * for vertical arrays) plus the grow grip past the end.
	 */
	override getHandles(shape: ArrayShape): TLHandle[] {
		// While an operation shows its steps, the handles would sit on a state that isn't shown.
		if (isBusy(playbackFor(this.editor, shape.id))) return []
		const { values, direction } = shape.props
		const metrics = getArrayMetrics(shape.props)
		const layout = getArrayLayout(values.length, direction, metrics)
		const indices = getIndices(values.length + 1)
		const handles: TLHandle[] = values.map((value, i) => {
			const { x, y } = layout.cellAt(i)
			const at =
				direction === 'horizontal' ? { x: x + metrics.cell / 2, y: y + metrics.cell } : { x: x + metrics.cell, y: y + metrics.cell / 2 }
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
		const { values, direction, fill, seed, marks, pointers } = initial.props
		const axis = direction === 'horizontal' ? { x: 1, y: 0 } : { x: 0, y: 1 }
		const step = getArrayMetrics(initial.props).cell
		const count = grownCount(values.length, this.growPoint(initial), handle, axis, step)
		return {
			id: shape.id,
			type: ARRAY_SHAPE_TYPE,
			props: {
				values: extendValues(values, fill, seed, count),
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
		const { values } = shape.props
		if (!Number.isInteger(k) || k < 0 || k >= values.length) return []
		const v = values[k]
		const search = { submenu: 'Search', submenuId: 'array-search' }
		const shift = { submenu: 'Insert / delete step by step', submenuId: 'array-shift' }
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
			...find('array-linear-search', 'Linear search', linearSearch),
			{ ...shift, id: 'array-insert', label: `Insert at index ${k}`, run: () => this.play(shape.id, 'insert', (a) => this.insertOp(shape.id, a, k)) },
			...(values.length > 1
				? [{ ...shift, id: 'array-delete', label: `Delete a[${k}] (${v})`, run: () => this.play(shape.id, 'delete', (a) => deleteAt(a, k)) }]
				: []),
		]
	}

	override shapeOperations(shape: ArrayShape): NodeOperation[] {
		const sorts = { submenu: 'Sort step by step', submenuId: 'array-sort' }
		const actions = { submenu: 'Array', submenuId: 'array-actions' }
		const sort = (id: string, label: string, op: (a: ArrayState) => ArrayOperation): NodeOperation => ({
			...sorts,
			id,
			label,
			run: () => this.play(shape.id, label.toLowerCase(), op),
		})
		const order = (id: string, label: string, make: (values: string[]) => number[]): NodeOperation => ({
			...actions,
			id,
			label,
			run: () => this.rearrange(shape.id, label.toLowerCase(), make),
		})
		return [
			sort('array-insertion-sort', 'Insertion sort', insertionSort),
			sort('array-selection-sort', 'Selection sort', selectionSort),
			sort('array-bubble-sort', 'Bubble sort', bubbleSort),
			order('array-sort', 'Sort', (values) => sortedOrder(values)),
			order('array-sort-descending', 'Sort descending', (values) => sortedOrder(values, true)),
			order('array-shuffle', 'Shuffle', (values) => shuffledOrder(values.length, mulberry32(newSeed()))),
			order('array-reverse', 'Reverse', (values) => reversedOrder(values.length)),
			{ ...actions, id: 'array-reroll', label: 'New values', run: () => this.reroll(shape.id) },
			{
				...actions,
				id: 'array-indices',
				label: shape.props.showIndices ? 'Hide indices' : 'Show indices',
				run: () => this.update(shape.id, 'toggle indices', (s) => ({ showIndices: !s.props.showIndices })),
			},
		]
	}

	/** Play an operation on the array as it is now; its result (if any) is one undo step. */
	private play(id: ArrayShape['id'], label: string, operation: (array: ArrayState) => ArrayOperation) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		if (!shape) return
		const { values, marks } = shape.props
		const { frames, result, finalFlash } = operation({ values, marks })
		const final = result && this.withValues(shape, result)
		playOperation(this.editor, {
			shapeId: id,
			label,
			frames,
			final,
			finalFlash,
			// Shift: the highlights become marks, on the cells there are afterwards.
			withMarks: (_update, highlights) => {
				const after = result ?? { values, marks }
				const kept = pruneMarks({ ...after.marks, ...highlights }, after.values.map((_, i) => String(i)))
				return final ? { ...final, props: { ...final.props, marks: kept } } : this.withMarks(shape, kept)
			},
		})
	}

	/** Insert a value that fits the fill mode (as growing does), at index k. */
	private insertOp(id: ArrayShape['id'], array: ArrayState, k: number) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		const { fill, seed } = shape?.props ?? this.getDefaultProps()
		const { values } = array
		const value = insertValue(values[k - 1], values[k], fill, seed, Date.now() % 100000, values)
		return insertAt(array, k, value)
	}

	/** New values and marks (pointers past the new end go); marks are dropped with their cells. */
	private withValues(shape: ArrayShape, { values, marks }: ArrayState): TLShapePartial<ArrayShape> {
		const n = values.length
		return {
			id: shape.id,
			type: ARRAY_SHAPE_TYPE,
			props: {
				values,
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
		const order = make(shape.props.values)
		if (!movesAnything(order)) return
		this.editor.markHistoryStoppingPoint(label)
		this.editor.updateShape(this.withValues(shape, rearrange(shape.props.values, shape.props.marks, order)))
		this.slide(shape, orderSlides(order))
	}

	/** New random values from a fresh seed, in the shape's fill mode. */
	private reroll(id: ArrayShape['id']) {
		const shape = this.editor.getShape(id) as ArrayShape | undefined
		if (!shape) return
		const seed = newSeed()
		this.update(id, 'new values', (s) => ({ seed, values: fillValues(s.props.fill, seed, s.props.values.length) }))
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
		const { x, y } = getArrayLayout(n, shape.props.direction, metrics).cellAt(i)
		return { box: { x, y, w: metrics.cell, h: metrics.cell }, side: shape.props.direction === 'horizontal' ? 'above' : 'right' }
	}

	override pointerTargetAt(shape: ArrayShape, point: VecLike): string | undefined {
		const { values, direction } = shape.props
		const metrics = getArrayMetrics(shape.props)
		const { cells } = getArrayLayout(values.length, direction, metrics)
		const [along, across, extent] =
			direction === 'horizontal' ? [point.x - cells.x, point.y - cells.y, cells.h] : [point.y - cells.y, point.x - cells.x, cells.w]
		// Generous across the array, so a pointer dropped on its label row still lands on the cell.
		if (across < -metrics.cell || across > extent + metrics.cell) return undefined
		const i = Math.floor(along / metrics.cell)
		return i >= -1 && i <= values.length ? String(i) : undefined
	}

	pointerStep(shape: ArrayShape, key: string, direction: PointerDirection): string | undefined {
		const step =
			shape.props.direction === 'horizontal'
				? { left: -1, right: 1, up: 0, down: 0 }[direction]
				: { up: -1, down: 1, left: 0, right: 0 }[direction]
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
		return getArrayGrowPoint(shape.props.values.length, shape.props.direction, getArrayMetrics(shape.props))
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
		const count = this.displayShape(shape).props.values.length
		const { width, height } = getArrayLayout(count, shape.props.direction, metrics)
		const body = new Rectangle2d({ ...metrics.origin, width, height, isFilled: true })
		const pointers = this.pointerGeometry(shape)
		if (!pointers.length) return body
		// Cells a pointer reaches past either end are drawn too, so they count in the bounds.
		const slots = this.offEndSlots(shape).map((i) => {
			const { box } = this.pointerAnchor(shape, String(i))!
			return new Rectangle2d({ x: box.x, y: box.y, width: box.w, height: box.h, isFilled: false })
		})
		return new Group2d({ children: [body, ...pointers, ...slots] })
	}

	/** Indices just off the array (-1, n) that a pointer is at. */
	private offEndSlots(shape: ArrayShape, pointers: readonly Pointer[] = shape.props.pointers) {
		const n = shape.props.values.length
		return [-1, n].filter((i) => pointers.some((p) => p.at === String(i)))
	}

	/**
	 * The props being shown: while an operation plays, its step's values and marks over the shape's
	 * own. (Pointers stay the shape's, so the drawing's origin doesn't move.) Reactive.
	 */
	displayShape(shape: ArrayShape): ArrayShape {
		const props = playbackFor(this.editor, shape.id)?.frame?.props as Partial<ArrayShape['props']> | undefined
		return props ? { ...shape, props: { ...shape.props, ...props, pointers: shape.props.pointers } } : shape
	}

	/** The step's own pointers (lo, mid, hi...), if it has any: drawn by the play overlay. */
	private framePointers(shape: ArrayShape): Pointer[] | undefined {
		return playbackFor(this.editor, shape.id)?.frame?.pointers
	}

	override playbackLayout(shape: ArrayShape, strips: readonly Strip[] | undefined): PlaybackLayout {
		const shown = this.displayShape(shape)
		const metrics = getArrayMetrics(shape.props)
		const { values, direction } = shown.props
		const layout = getArrayLayout(values.length, direction, metrics)
		const framePointers = this.framePointers(shape)
		const slots = framePointers
			? this.offEndSlots(shown, framePointers).map((i) => ({ ...layout.cellAt(i), w: metrics.cell, h: metrics.cell }))
			: []
		const sceneMetrics = { fontSize: metrics.fontSize, labelFontSize: metrics.indexFontSize, strokeWidth: metrics.strokeWidth }
		const left = layout.cells.x
		const right = layout.cells.x + layout.cells.w
		let bottom = Math.max(metrics.origin.y + layout.height, ...slots.map((b) => b.y + b.h))
		const gap = metrics.fontSize
		const strip = { x: left, y: bottom + gap }
		if (strips?.length) bottom = strip.y + stripsHeight(strips, sceneMetrics)
		return {
			strip,
			bar: { x: (left + right) / 2, y: bottom + gap },
			metrics: sceneMetrics,
			color: shape.props.color,
			fontFamily: this.getFontFamily(shape),
			pointers: framePointers && {
				placed: placePointers(framePointers, (key) => this.pointerAnchor(shown, key), this.getPointerFontSize(shape)),
				fontSize: this.getPointerFontSize(shape),
				slots,
			},
		}
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
				? { from: frameSlides(frame.swaps, frame.moves), id: playing.id }
				: swapped?.shapeId === shape.id
					? swapped
					: undefined
		return (
			<>
				<SVGContainer>
					<ArraySvg
						shape={this.displayShape(shape)}
						colors={colors}
						fontFamily={this.getFontFamily(shape)}
						hiddenIndex={editingKey === undefined ? undefined : Number(editingKey)}
						drag={dragging?.shapeId === shape.id ? dragging : undefined}
						slides={slides}
						flash={playing && { marks: playing.flash, fading: playing.fading, id: playing.id }}
						dim={playing && !playing.fading ? (playing.dim ?? []) : undefined}
						offEnd={framePointers ? [] : this.offEndSlots(shape)}
					/>
					{!framePointers && this.renderPointers(shape, colors)}
					{showsStructureControls(this.editor, shape) && !isBusy(playing) && (
						<GrowGrip at={this.growPoint(shape)} zoom={this.editor.getZoomLevel()} colors={colors} />
					)}
				</SVGContainer>
				{this.renderOperationPrompt(shape, colors)}
				{this.renderPointerOverlays(shape, colors)}
				{this.renderCellEditor(shape)}
			</>
		)
	}

	override toSvg(shape: ArrayShape, ctx: SvgExportContext) {
		const colors = this.editor.getCurrentTheme().colors[ctx.colorMode]
		return (
			<>
				<ArraySvg shape={shape} colors={colors} fontFamily={this.getFontFamily(shape)} offEnd={this.offEndSlots(shape)} />
				{this.renderPointers(shape, colors, { exporting: true })}
			</>
		)
	}

	getIndicatorPath(shape: ArrayShape) {
		// The values shown, so the outline follows an operation that adds or removes a cell.
		const { cells } = getArrayLayout(
			this.displayShape(shape).props.values.length,
			shape.props.direction,
			getArrayMetrics(shape.props)
		)
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

function ArraySvg({
	shape,
	colors,
	fontFamily,
	hiddenIndex,
	drag,
	slides,
	flash,
	dim,
	offEnd = [],
}: {
	shape: ArrayShape
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
	/** Canvas only, while an operation is open: cells out of play, drawn faded (in or out). */
	dim?: readonly string[]
}) {
	const { values, direction, showIndices, color, marks } = shape.props
	const metrics = getArrayMetrics(shape.props)
	const layout = getArrayLayout(values.length, direction, metrics)
	const { cells, cellAt } = layout
	const { cell, strokeWidth } = metrics
	const stroke = getColorValue(colors, color, 'solid')
	const textSize = (value: string) => metrics.fontSize * Math.min(1, 3 / Math.max(1, value.length))

	// A value arcs from its old cell into its new one: those moving towards the end over the array,
	// those moving back under it, so two that swap or cross pass each other.
	const slideStyle = (i: number): CSSProperties | undefined => {
		const from = slides?.from[i]
		if (from === undefined || from === i) return undefined
		const dx = cellAt(from).x - cellAt(i).x
		const dy = cellAt(from).y - cellAt(i).y
		const lift = (i > from ? -1 : 1) * cell * Math.min(0.9, 0.35 + 0.15 * Math.abs(i - from))
		const [mx, my] = direction === 'horizontal' ? [dx / 2, dy / 2 + lift] : [dx / 2 + lift, dy / 2]
		return {
			'--from-x': `${dx}px`,
			'--from-y': `${dy}px`,
			'--mid-x': `${mx}px`,
			'--mid-y': `${my}px`,
			animation: `drawds-swap ${SLIDE_MS}ms ease-in-out`,
		} as CSSProperties
	}
	const dimmed = new Set(dim)

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
				fill={getColorValue(colors, color, 'semi')}
				stroke={stroke}
				strokeWidth={strokeWidth}
				strokeLinejoin="round"
			/>
			{values.slice(1).map((_, k) => {
				const { x, y } = cellAt(k + 1)
				return direction === 'horizontal' ? (
					<line key={k} x1={x} y1={y} x2={x} y2={y + cell} stroke={stroke} strokeWidth={strokeWidth} />
				) : (
					<line key={k} x1={x} y1={y} x2={x + cell} y2={y} stroke={stroke} strokeWidth={strokeWidth} />
				)
			})}
			{values.map((_, i) => {
				const mark = marks[String(i)]
				if (!mark) return null
				const { x, y } = cellAt(i)
				return (
					<rect
						key={`mark-${i}`}
						x={x}
						y={y}
						width={cell}
						height={cell}
						fill={getColorValue(colors, mark, 'semi')}
						stroke={getColorValue(colors, mark, 'solid')}
						strokeWidth={strokeWidth * 1.6}
						strokeLinejoin="round"
					/>
				)
			})}
			{flash &&
				values.map((_, i) => {
					const color = flash.marks[String(i)]
					if (!color) return null
					const { x, y } = cellAt(i)
					return (
						<rect
							// A new key per step restarts the element, which (once dismissed) starts the fade.
							key={`flash-${i}-${flash.id}`}
							className={flash.fading ? 'drawds-flash drawds-flash-fade' : 'drawds-flash'}
							x={x}
							y={y}
							width={cell}
							height={cell}
							fill={getColorValue(colors, color, 'semi')}
							stroke={getColorValue(colors, color, 'solid')}
							strokeWidth={strokeWidth * 1.6}
							strokeLinejoin="round"
						/>
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
				const animated = slideStyle(i)
				const faded = dimmed.has(String(i))
				return (
					<text
						// A new key per move remounts the texts that move, which restarts their animation.
						key={animated ? `${i}:${slides!.id}` : i}
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
		</g>
	)
}
