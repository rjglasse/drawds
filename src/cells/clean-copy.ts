import { createShapeId, type Editor, type TLShape } from 'tldraw'
import type { Box } from '../nodelink/geometry'
import { ROOM_KEY } from '../nodelink/playback'

/** Page px between a structure and its clean copy. */
const GAP = 40

/**
 * Where a box as big as `box` goes under it (its top, page space): straight below, or further down,
 * past anything in the way, so the copy lands on clear canvas.
 */
export function freeTopBelow(box: Box, others: readonly Box[], gap = GAP): number {
	let y = box.y + box.h + gap
	for (;;) {
		const hit = others.find((o) => o.x < box.x + box.w && o.x + o.w > box.x && o.y < y + box.h + gap && o.y + o.h > y - gap)
		if (!hit) return y
		y = hit.y + hit.h + gap
	}
}

/**
 * The same structure again, under it: its values and shape (and seed), without the marks and
 * pointers a lesson put on it. Its views and recursion trees stay with the original. One undo step;
 * the copy is selected.
 */
export function cleanCopy(editor: Editor, shape: TLShape) {
	const box = editor.getShapePageBounds(shape)
	if (!box) return
	const others = editor
		.getCurrentPageShapes()
		.filter((s) => s.id !== shape.id)
		.flatMap((s) => {
			const b = editor.getShapePageBounds(s)
			return b ? [{ x: b.x, y: b.y, w: b.w, h: b.h }] : []
		})
	const dy = freeTopBelow({ x: box.x, y: box.y, w: box.w, h: box.h }, others) - box.y
	const origin = editor.getShapePageTransform(shape).applyToPoint({ x: 0, y: 0 })
	const at = editor.getPointInParentSpace(shape, { x: origin.x, y: origin.y + dy })
	const props: Record<string, unknown> = { ...shape.props }
	if ('marks' in props) props.marks = {}
	if ('pointers' in props) props.pointers = []
	const { [ROOM_KEY]: _room, ...meta } = shape.meta
	const id = createShapeId()
	editor.markHistoryStoppingPoint('clean copy')
	editor.createShape({ id, type: shape.type, parentId: shape.parentId, x: at.x, y: at.y, rotation: shape.rotation, props, meta })
	editor.select(id)
	editor.zoomToSelectionIfOffscreen(64)
}
