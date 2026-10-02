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
import { CellShapeUtil, type PointerDirection } from '../../cells/CellShapeUtil'
import { pruneMarks } from '../../cells/marks'
import { GROW_HANDLE_ID, growHandle, grownCount } from '../../controls/grow'
import { GrowGrip } from '../../controls/GrowGrip'
import { showsStructureControls } from '../../controls/visibility'
import { extendValues, fillValues } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import type { PointerAnchor } from '../../pointers/layout'
import { prunePointers } from '../../pointers/pointers'
import { ARRAY_SHAPE_TYPE, arrayShapeMigrations, arrayShapeProps, type ArrayShape } from './array-shape-types'
import { arrayCells } from './cells'
import { getArrayGrowPoint, getArrayLayout, getArrayMetrics } from './layout'
import { cellHandleId, cellOfHandle, swapCells, swapState, type LastSwap, type SwapDrag } from './swap'

/** How long two swapped values take to arc into their new cells. */
const SWAP_MS = 450

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
		const { drag, last } = swapState(this.editor)
		const current = drag.get()
		drag.set(null)
		if (!current || current.shapeId !== shape.id) return
		const { from, to } = current
		if (to === undefined || to === from) return
		last.set({ shapeId: shape.id, a: from, b: to, id: Date.now() })
		return { id: shape.id, type: ARRAY_SHAPE_TYPE, props: swapCells(shape.props.values, shape.props.marks, from, to) }
	}

	override onHandleDragCancel() {
		swapState(this.editor).drag.set(null)
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
		const { width, height } = getArrayLayout(
			shape.props.values.length,
			shape.props.direction,
			getArrayMetrics(shape.props)
		)
		const body = new Rectangle2d({ width, height, isFilled: true })
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
	private offEndSlots(shape: ArrayShape) {
		const n = shape.props.values.length
		return [-1, n].filter((i) => shape.props.pointers.some((p) => p.at === String(i)))
	}

	component(shape: ArrayShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		const editingKey = this.getEditingKey(shape)
		const { drag, last } = swapState(this.editor)
		const dragging = drag.get()
		const swapped = last.get()
		return (
			<>
				<SVGContainer>
					<ArraySvg
						shape={shape}
						colors={colors}
						fontFamily={this.getFontFamily(shape)}
						hiddenIndex={editingKey === undefined ? undefined : Number(editingKey)}
						drag={dragging?.shapeId === shape.id ? dragging : undefined}
						swap={swapped?.shapeId === shape.id ? swapped : undefined}
						offEnd={this.offEndSlots(shape)}
					/>
					{this.renderPointers(shape, colors)}
					{showsStructureControls(this.editor, shape) && (
						<GrowGrip at={this.growPoint(shape)} zoom={this.editor.getZoomLevel()} colors={colors} />
					)}
				</SVGContainer>
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
		const { cells } = getArrayLayout(
			shape.props.values.length,
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
	swap,
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
	/** The latest swap, animated once when it happens (canvas only). */
	swap?: LastSwap
}) {
	const { values, direction, showIndices, color, marks } = shape.props
	const metrics = getArrayMetrics(shape.props)
	const layout = getArrayLayout(values.length, direction, metrics)
	const { cells, cellAt } = layout
	const { cell, strokeWidth } = metrics
	const stroke = getColorValue(colors, color, 'solid')
	const textSize = (value: string) => metrics.fontSize * Math.min(1, 3 / Math.max(1, value.length))

	// Two swapped values arc past each other into their new cells: one over, one under.
	const swapStyle = (i: number): CSSProperties | undefined => {
		if (!swap || (i !== swap.a && i !== swap.b)) return undefined
		const other = i === swap.a ? swap.b : swap.a
		const dx = cellAt(other).x - cellAt(i).x
		const dy = cellAt(other).y - cellAt(i).y
		const lift = (i === swap.a ? -1 : 1) * cell * 0.9
		const [mx, my] = direction === 'horizontal' ? [dx / 2, dy / 2 + lift] : [dx / 2 + lift, dy / 2]
		return {
			'--from-x': `${dx}px`,
			'--from-y': `${dy}px`,
			'--mid-x': `${mx}px`,
			'--mid-y': `${my}px`,
			animation: `drawds-swap ${SWAP_MS}ms ease-in-out`,
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
				const animated = swapStyle(i)
				return (
					<text
						// A new key per swap remounts the two texts, which restarts their animation.
						key={animated ? `${i}:${swap!.id}` : i}
						x={x + cell / 2}
						y={y + cell / 2}
						fontSize={textSize(value)}
						fill={colors.text}
						opacity={drag?.from === i ? 0.25 : 1}
						style={animated}
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
