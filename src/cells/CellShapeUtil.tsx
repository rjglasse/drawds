import { useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Rectangle2d, ShapeUtil, Vec, type TLShape, type TLShapePartial, type TLThemeColors, type VecLike } from 'tldraw'
import { showsStructureControls } from '../controls/visibility'
import { playbackFor } from '../nodelink/playback'
import { POINTER_FONT_SCALE, placePointers, type PlacedPointer, type PointerAnchor } from '../pointers/layout'
import { PointerOverlays } from '../pointers/PointerOverlays'
import type { Pointer } from '../pointers/pointers'
import { PointersSvg } from '../pointers/PointersSvg'
import { pointerState } from '../pointers/state'
import {
	beginCellEdit,
	endCellEdit,
	getEditingCell,
	type CellDirection,
	type CellKey,
	type EditableCells,
} from './editable-cells'
import type { Marks } from './marks'

export interface CellFont {
	fontFamily: string
	fontSize: number
}

/** Which way an arrow key steps a picked-up pointer. */
export type PointerDirection = 'left' | 'right' | 'up' | 'down'

/**
 * Base for data-structure shapes whose cells can be edited in place. Double-click a cell (or
 * press Enter on a selected shape) to edit it; Tab / Shift+Tab and the arrow keys move between
 * cells, Enter finishes, Esc reverts the current cell and finishes.
 *
 * Subclasses provide `cells`, hide the editing cell's value in their own rendering (see
 * `getEditingKey`), and include `renderCellEditor(shape)` in their component.
 */
export abstract class CellShapeUtil<S extends TLShape> extends ShapeUtil<S> {
	abstract readonly cells: EditableCells<S>

	/** Font for the inline input, so typing looks like the rendered value. */
	abstract getCellFont(shape: S): CellFont

	/** Marks on this shape's cells. Every cell shape stores them as `props.marks`. */
	getMarks(shape: S): Marks {
		return (shape.props as { marks?: Marks }).marks ?? {}
	}

	withMarks(shape: S, marks: Marks): TLShapePartial<S> {
		return { id: shape.id, type: shape.type, props: { marks } } as unknown as TLShapePartial<S>
	}

	// Named pointers (i, curr, root...): stored as `props.pointers`. A shape offers them by saying
	// where a pointer at each element is drawn (`pointerAnchor`) and how arrow keys step one.

	/** Where pointers at element `key` are drawn; undefined if a pointer can't sit there. */
	pointerAnchor?(shape: S, key: string): PointerAnchor | undefined
	/** Where a pointer at `key` goes when stepped with an arrow key, if anywhere. */
	pointerStep?(shape: S, key: string, direction: PointerDirection): string | undefined
	/** The structure's usual pointer names, offered in the context menu. */
	pointerNames?(shape: S): string[]

	/** The element a pointer dragged to `point` (shape space) would land on. */
	pointerTargetAt(shape: S, point: VecLike): string | undefined {
		const key = this.cells.cellAt(shape, point)
		return key !== undefined && this.pointerAnchor?.(shape, key) ? key : undefined
	}

	getPointers(shape: S): Pointer[] {
		return (shape.props as { pointers?: Pointer[] }).pointers ?? []
	}

	withPointers(shape: S, pointers: Pointer[]): TLShapePartial<S> {
		return { id: shape.id, type: shape.type, props: { pointers } } as unknown as TLShapePartial<S>
	}

	getPointerFontSize(shape: S) {
		return this.getCellFont(shape).fontSize * POINTER_FONT_SCALE
	}

	/**
	 * Where the layout's own coordinates sit in shape space. tldraw sizes a shape's box from its
	 * bounds but puts it at the shape's origin, so the drawing must start there: a shape whose layout
	 * reaches left of or above its own origin (a pointer above the top row, a graph whose leftmost
	 * node went) moves it by this much. Anything drawn outside the box is repainted unreliably.
	 */
	layoutOffset(_shape: S): VecLike {
		return { x: 0, y: 0 }
	}

	/** When the offset changes, move the shape the other way, so the drawing stays put on the page. */
	override onBeforeUpdate(prev: S, next: S): S | void {
		// The sketch tools place the shape themselves (see createDragTool).
		if (this.editor.isIn(`${next.type}.sketching`)) return
		const a = this.layoutOffset(prev)
		const b = this.layoutOffset(next)
		if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) return
		const d = Vec.Rot(Vec.Sub(b, a), next.rotation)
		return { ...next, x: next.x - d.x, y: next.y - d.y }
	}

	private placed = new WeakMap<object, PlacedPointer[]>()

	/** The shape's pointers, laid out around their elements (shape space). */
	placedPointers(shape: S): PlacedPointer[] {
		let placed = this.placed.get(shape.props)
		if (!placed) {
			placed = this.pointerAnchor
				? placePointers(this.getPointers(shape), (key) => this.pointerAnchor?.(shape, key), this.getPointerFontSize(shape))
				: []
			this.placed.set(shape.props, placed)
		}
		return placed
	}

	/** Pointer labels as geometry, so they count in the shape's bounds (selection, export). */
	protected pointerGeometry(shape: S) {
		return this.placedPointers(shape).map(
			({ label }) => new Rectangle2d({ x: label.x, y: label.y, width: label.w, height: label.h, isFilled: true })
		)
	}

	/** The pointers as drawn on the canvas (sliding when they move), or in an export. */
	protected renderPointers(
		shape: S,
		colors: TLThemeColors,
		{ exporting = false, placed = this.placedPointers(shape) }: { exporting?: boolean; placed?: PlacedPointer[] } = {}
	): ReactNode {
		const state = pointerState(this.editor)
		const drag = exporting ? undefined : state.drag.get()
		const dragging = drag?.shapeId === shape.id ? drag : undefined
		const focus = exporting ? undefined : state.focus.get()
		const target = dragging?.target !== undefined ? this.pointerAnchor?.(shape, dragging.target)?.box : undefined
		const name = dragging && this.getPointers(shape).find((p) => p.id === dragging.pointerId)?.name
		if (!placed.length && !dragging) return null
		return (
			<PointersSvg
				placed={placed}
				fontSize={this.getPointerFontSize(shape)}
				fontFamily={this.getCellFont(shape).fontFamily}
				colors={colors}
				animate={!exporting}
				focusId={focus?.shapeId === shape.id && this.editor.getOnlySelectedShapeId() === shape.id ? focus.pointerId : undefined}
				hiddenId={dragging?.pointerId}
				drag={dragging && name !== undefined ? { name, at: dragging.at, target } : undefined}
				zoom={this.editor.getZoomLevel()}
			/>
		)
	}

	/** Picking up, dragging, renaming and removing pointers, while the shape is selected. */
	protected renderPointerOverlays(shape: S, colors: TLThemeColors): ReactNode {
		if (!this.pointerAnchor) return null
		const interactive =
			showsStructureControls(this.editor, shape) && this.editor.isIn('select.idle') && !playbackFor(this.editor, shape.id)
		return (
			<PointerOverlays util={this} shape={shape} placed={this.placedPointers(shape)} interactive={interactive} colors={colors} />
		)
	}

	/** The element a mark at `point` (shape space) applies to: by default, the cell there. */
	markKeyAt(shape: S, point: VecLike): string | undefined {
		return this.cells.cellAt(shape, point)
	}

	override canEdit() {
		return true
	}

	/** Cell requested by `editCell`, picked up by `onEditStart`. */
	private requestedCell: CellKey | undefined

	/** Select the shape and start editing one of its cells, as if it had been double-clicked. */
	editCell(shape: S, key: CellKey) {
		this.requestedCell = key
		this.editor.select(shape.id)
		this.editor.setEditingShape(shape.id)
		this.editor.setCurrentTool('select.editing_shape')
	}

	override onEditStart(shape: S) {
		// A double-click edits the cell under the pointer. Enter leaves the pointer wherever it
		// was, so fall back to the first cell when it isn't over one.
		const point = this.editor.getPointInShapeSpace(shape, this.editor.inputs.getCurrentPagePoint())
		const key = this.requestedCell ?? this.cells.cellAt(shape, point) ?? this.cells.firstCell(shape)
		this.requestedCell = undefined
		if (key !== undefined) beginCellEdit(this.editor, shape.id, key)
	}

	override onEditEnd(shape: S) {
		endCellEdit(this.editor, shape.id)
	}

	/** The cell being edited in this shape, if any. Reactive when read from `component`. */
	protected getEditingKey(shape: S): CellKey | undefined {
		const cell = getEditingCell(this.editor)
		return cell && cell.shapeId === shape.id && this.editor.getEditingShapeId() === shape.id
			? cell.key
			: undefined
	}

	protected renderCellEditor(shape: S) {
		const cell = getEditingCell(this.editor)
		if (!cell || this.getEditingKey(shape) === undefined) return null
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		return (
			<CellInput
				key={cell.key}
				util={this}
				shape={shape}
				cellKey={cell.key}
				markId={cell.markId}
				textColor={colors.text}
				outlineColor={colors.selectionStroke}
			/>
		)
	}
}

function caretAt(input: HTMLInputElement, edge: 'start' | 'end') {
	const { selectionStart: start, selectionEnd: end, value } = input
	if (start === 0 && end === value.length) return true // whole value selected
	return start === end && start === (edge === 'start' ? 0 : value.length)
}

function CellInput<S extends TLShape>({
	util,
	shape,
	cellKey,
	markId,
	textColor,
	outlineColor,
}: {
	util: CellShapeUtil<S>
	shape: S
	cellKey: CellKey
	markId: string
	textColor: string
	outlineColor: string
}) {
	const { editor, cells } = util
	const ref = useRef<HTMLInputElement>(null)

	useLayoutEffect(() => {
		ref.current?.focus()
		ref.current?.select()
		if (!editor.inputs.getIsPointing()) return

		// A double-click starts editing on its second press, before that press's mousedown, whose
		// default action would move focus to the canvas container. Cancel just that focus change.
		const doc = editor.getContainer().ownerDocument
		const keepFocus = (e: MouseEvent) => {
			e.preventDefault()
			stop()
		}
		const stop = () => {
			doc.removeEventListener('mousedown', keepFocus, true)
			doc.removeEventListener('pointerup', stop, true)
		}
		doc.addEventListener('mousedown', keepFocus, true)
		doc.addEventListener('pointerup', stop, true)
		return stop
	}, [editor])

	const latest = () => editor.getShape(shape.id) as S | undefined

	const move = (direction: CellDirection) => {
		const current = latest()
		const next = current && cells.neighbor(current, cellKey, direction)
		if (next === undefined) return false
		beginCellEdit(editor, shape.id, next)
		return true
	}

	// tldraw listens for keys on its container, which the event reaches before React's
	// bubble-phase handlers run. Handling keys in the capture phase and marking them as handled
	// keeps tldraw from also acting on them (e.g. Esc would end editing before we could revert).
	const onKeyDownCapture = (e: KeyboardEvent<HTMLInputElement>) => {
		editor.markEventAsHandled(e)
		const input = e.currentTarget
		let consumed = true
		switch (e.key) {
			case 'Enter':
				editor.complete()
				break
			case 'Escape':
				editor.bailToMark(markId)
				editor.cancel()
				break
			case 'Tab':
				move(e.shiftKey ? 'prev' : 'next')
				break
			case 'ArrowUp':
				consumed = move('up')
				break
			case 'ArrowDown':
				consumed = move('down')
				break
			case 'ArrowLeft':
				consumed = caretAt(input, 'start') && move('left')
				break
			case 'ArrowRight':
				consumed = caretAt(input, 'end') && move('right')
				break
			default:
				consumed = false
		}
		if (consumed) e.preventDefault()
	}

	const onInput = () => {
		const current = latest()
		if (current && ref.current) editor.updateShape(cells.setValue(current, cellKey, ref.current.value))
	}

	// While editing, clicks on other cells switch to them instead of going to the canvas.
	const onOverlayPointerDown = (e: PointerEvent<HTMLDivElement>) => {
		const current = latest()
		if (!current) return
		const point = editor.getPointInShapeSpace(current, editor.screenToPage({ x: e.clientX, y: e.clientY }))
		const key = cells.cellAt(current, point)
		if (key === undefined) return
		editor.markEventAsHandled(e)
		e.preventDefault()
		if (key !== cellKey) beginCellEdit(editor, shape.id, key)
	}

	const box = cells.cellBox(shape, cellKey)
	const bounds = editor.getShapeGeometry(shape).bounds
	const { fontFamily, fontSize } = util.getCellFont(shape)

	return (
		<>
			<div
				style={{
					position: 'absolute',
					left: bounds.x,
					top: bounds.y,
					width: bounds.w,
					height: bounds.h,
					pointerEvents: 'all',
				}}
				onPointerDown={onOverlayPointerDown}
			/>
			<input
				ref={ref}
				defaultValue={cells.getValue(shape, cellKey)}
				aria-label={`Cell ${cellKey}`}
				spellCheck={false}
				autoComplete="off"
				onInput={onInput}
				onKeyDownCapture={onKeyDownCapture}
				onPointerDown={(e) => editor.markEventAsHandled(e)}
				style={{
					position: 'absolute',
					left: box.x,
					top: box.y,
					width: box.w,
					height: box.h,
					boxSizing: 'border-box',
					margin: 0,
					padding: 0,
					border: 'none',
					outline: `2px solid ${outlineColor}`,
					outlineOffset: -1,
					borderRadius: box.round ? '50%' : 0,
					background: 'transparent',
					color: textColor,
					fontFamily,
					fontSize,
					textAlign: 'center',
					pointerEvents: 'all',
				}}
			/>
		</>
	)
}
