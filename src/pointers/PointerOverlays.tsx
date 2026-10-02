import { useEffect, useRef, type PointerEvent } from 'react'
import { useValue, type TLShape, type TLThemeColors } from 'tldraw'
import type { CellShapeUtil, PointerDirection } from '../cells/CellShapeUtil'
import { ControlButton } from '../controls/ControlButton'
import { isTyping, swallowKeyUp } from '../controls/keys'
import { KeyPrompt } from '../controls/KeyPrompt'
import { isPlaying } from '../nodelink/playback'
import { placePointers, type PlacedPointer } from './layout'
import { movePointer, placePointer, removePointer, renamePointer, type Pointer } from './pointers'
import { pointerState } from './state'

const ARROWS: Record<string, PointerDirection> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

/**
 * The interactive side of a shape's pointers, while it is the only selected shape: drag a pointer
 * onto another element, click it to pick it up (then arrow keys step it, Delete removes it, Enter
 * or a double-click renames it), and the prompt that names a new pointer.
 */
export function PointerOverlays<S extends TLShape>({
	util,
	shape,
	placed,
	interactive,
	colors,
}: {
	util: CellShapeUtil<S>
	shape: S
	placed: readonly PlacedPointer[]
	/** Whether pointers can be picked up and dragged now (the shape is selected and at rest). */
	interactive: boolean
	colors: TLThemeColors
}) {
	const { editor } = util
	const state = pointerState(editor)
	const focus = useValue('pointer focus', () => state.focus.get(), [state])
	const prompt = useValue('pointer prompt', () => state.prompt.get(), [state])
	const focused = interactive && focus?.shapeId === shape.id ? placed.find((p) => p.pointer.id === focus.pointerId) : undefined
	const zoom = editor.getZoomLevel()

	const latest = () => editor.getShape(shape.id) as S | undefined
	const update = (label: string, f: (pointers: Pointer[]) => Pointer[]) => {
		const current = latest()
		if (!current) return
		editor.markHistoryStoppingPoint(label)
		editor.updateShape(util.withPointers(current, f(util.getPointers(current))))
	}

	// Keys for the picked-up pointer, ahead of tldraw (whose arrows would nudge the shape).
	const focusedId = focused?.pointer.id
	useEffect(() => {
		if (!focusedId) return
		const win = editor.getContainer().ownerDocument.defaultView ?? window
		const onKeyDown = (e: KeyboardEvent) => {
			if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || isPlaying(editor)) return
			const current = latest()
			const pointer = current && util.getPointers(current).find((p) => p.id === focusedId)
			if (!current || !pointer) return
			const direction = ARROWS[e.key]
			if (direction) {
				const next = util.pointerStep?.(current, pointer.at, direction)
				if (next !== undefined) update('step pointer', (ps) => movePointer(ps, pointer.id, next))
			} else if (e.key === 'Delete' || e.key === 'Backspace') {
				update('remove pointer', (ps) => removePointer(ps, pointer.id))
				state.focus.set(null)
			} else if (e.key === 'Enter') {
				state.prompt.set({ shapeId: shape.id, at: pointer.at, pointerId: pointer.id })
			} else if (e.key === 'Escape') {
				state.focus.set(null)
			} else {
				return
			}
			e.preventDefault()
			e.stopPropagation()
			swallowKeyUp(win, e.key)
		}
		// Pressing anywhere but on a pointer puts it down.
		const onPointerDown = (e: globalThis.PointerEvent) => {
			if (!(e.target as HTMLElement | null)?.closest?.('[data-pointer-control]')) state.focus.set(null)
		}
		win.addEventListener('keydown', onKeyDown, true)
		win.addEventListener('pointerdown', onPointerDown, true)
		return () => {
			win.removeEventListener('keydown', onKeyDown, true)
			win.removeEventListener('pointerdown', onPointerDown, true)
		}
	}, [focusedId, editor, shape.id])

	// Where the name prompt goes: on the pointer being renamed, or where a new one would sit.
	const promptHere = prompt?.shapeId === shape.id ? prompt : undefined
	const promptAt = (() => {
		if (!promptHere) return undefined
		const current = latest() ?? shape
		const pointers = promptHere.pointerId
			? util.getPointers(current)
			: [...util.getPointers(current), { id: '#new', name: 'name', at: promptHere.at }]
		const spot = placePointers(pointers, (key) => util.pointerAnchor?.(current, key), util.getPointerFontSize(current)).find(
			(p) => p.pointer.id === (promptHere.pointerId ?? '#new')
		)
		return spot && { x: spot.label.x + spot.label.w / 2, y: spot.label.y + spot.label.h / 2 }
	})()

	return (
		<>
			{interactive &&
				placed.map((p) => (
					<PointerHandle
						key={p.pointer.id}
						util={util}
						shape={shape}
						placed={p}
						onMove={(at) => update('move pointer', (ps) => movePointer(ps, p.pointer.id, at))}
						onClick={() => state.focus.set(focusedId === p.pointer.id ? null : { shapeId: shape.id, pointerId: p.pointer.id })}
						onRename={() => state.prompt.set({ shapeId: shape.id, at: p.pointer.at, pointerId: p.pointer.id })}
					/>
				))}
			{focused && !promptHere && (
				<span data-pointer-control>
					<ControlButton
						editor={editor}
						kind="remove"
						at={{ x: focused.label.x + focused.label.w + 9 / zoom, y: focused.label.y + focused.label.h / 2 }}
						label={`Remove pointer ${focused.pointer.name}`}
						testId={`remove-pointer-${focused.pointer.name}`}
						colors={colors}
						onPress={() => {
							update('remove pointer', (ps) => removePointer(ps, focused.pointer.id))
							state.focus.set(null)
						}}
					/>
				</span>
			)}
			{promptHere && promptAt && (
				<KeyPrompt
					editor={editor}
					at={promptAt}
					label={promptHere.pointerId ? 'Rename pointer' : 'Pointer name'}
					colors={colors}
					onCancel={() => state.prompt.set(null)}
					onSubmit={(name) => {
						state.prompt.set(null)
						const { pointerId, at } = promptHere
						update(pointerId ? 'rename pointer' : 'add pointer', (ps) =>
							pointerId ? renamePointer(ps, pointerId, name) : placePointer(ps, name, at)
						)
					}}
				/>
			)}
		</>
	)
}

/** An invisible hit area over a pointer's label: drag it elsewhere, click to pick it up. */
function PointerHandle<S extends TLShape>({
	util,
	shape,
	placed,
	onMove,
	onClick,
	onRename,
}: {
	util: CellShapeUtil<S>
	shape: S
	placed: PlacedPointer
	onMove(at: string): void
	onClick(): void
	onRename(): void
}) {
	const { editor } = util
	const state = pointerState(editor)
	const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null)
	const { label, pointer } = placed

	const toShape = (e: PointerEvent) => editor.getPointInShapeSpace(shape, editor.screenToPage({ x: e.clientX, y: e.clientY }))

	return (
		<div
			data-pointer-control
			data-testid={`pointer-${pointer.name}`}
			title={`${pointer.name}: drag to another element, or click and use the arrow keys`}
			onPointerDown={(e) => {
				editor.markEventAsHandled(e)
				e.currentTarget.setPointerCapture(e.pointerId)
				start.current = { x: e.clientX, y: e.clientY, dragging: false }
			}}
			onPointerMove={(e) => {
				editor.markEventAsHandled(e)
				const s = start.current
				if (!s) return
				if (!s.dragging && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 4) return
				s.dragging = true
				const current = (editor.getShape(shape.id) as S | undefined) ?? shape
				const at = toShape(e)
				state.drag.set({ shapeId: shape.id, pointerId: pointer.id, at, target: util.pointerTargetAt(current, at) })
			}}
			onPointerUp={(e) => {
				editor.markEventAsHandled(e)
				const s = start.current
				start.current = null
				if (!s?.dragging) return onClick()
				const target = state.drag.get()?.target
				state.drag.set(null)
				if (target !== undefined && target !== pointer.at) onMove(target)
			}}
			onPointerCancel={() => {
				start.current = null
				state.drag.set(null)
			}}
			onDoubleClick={(e) => {
				editor.markEventAsHandled(e)
				onRename()
			}}
			style={{
				position: 'absolute',
				left: label.x,
				top: label.y,
				width: label.w,
				height: label.h,
				borderRadius: label.h / 2,
				pointerEvents: 'all',
				cursor: 'grab',
				touchAction: 'none',
			}}
		/>
	)
}
