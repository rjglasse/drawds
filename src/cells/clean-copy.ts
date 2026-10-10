import { createShapeId, type Editor, type TLCreateShapePartial, type TLShape } from 'tldraw'
import type { Box } from '../nodelink/geometry'
import { ROOM_KEY } from '../nodelink/playback'
import { CellShapeUtil } from './CellShapeUtil'

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
	const props: Record<string, unknown> = { ...shape.props }
	if ('marks' in props) props.marks = {}
	if ('pointers' in props) props.pointers = []
	// Room the original's pointers took moves its drawing off its origin; the copy has none.
	const util = editor.getShapeUtil(shape)
	const before = util instanceof CellShapeUtil ? util.layoutOffset(shape) : { x: 0, y: 0 }
	const after = util instanceof CellShapeUtil ? util.layoutOffset({ ...shape, props } as TLShape) : before
	const origin = editor.getShapePageTransform(shape).applyToPoint({ x: before.x - after.x, y: before.y - after.y })
	const at = editor.getPointInParentSpace(shape, { x: origin.x, y: origin.y + dy })
	const { [ROOM_KEY]: _room, ...meta } = shape.meta
	const id = createShapeId()
	editor.markHistoryStoppingPoint('clean copy')
	// Any shape's partial (the union of every shape type's is too big for TypeScript to check).
	const copy = { id, type: shape.type, parentId: shape.parentId, x: at.x, y: at.y, rotation: shape.rotation, props, meta }
	editor.createShape(copy as TLCreateShapePartial)
	editor.select(id)
	editor.zoomToSelectionIfOffscreen(64)
}
