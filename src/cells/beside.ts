import { createShapeId, type Editor, type TLShape, type TLShapeId, type TLShapePartial } from 'tldraw'
import { followedBy } from './followers'

// Where a shape that follows a structure goes when it is opened (the code beside it, its memory):
// to the structure's right, past its grips and whatever follows it already, top-aligned; if
// something else is in the way there, further right or under it, whichever is nearer.

/** Space between a structure and what is put beside it (a code box's pc room is on its left). */
const GAP = 16

/** A grow grip's radius at 100% (`GrowGrip`): a grip outside the structure's box still needs room. */
const GRIP = 9

interface Rect {
	x: number
	y: number
	w: number
	h: number
}

/**
 * Where a shape beside a structure goes (`box`: where it would go, to the structure's right; page
 * space): there if nothing else is in the way; else further right, past what is in the way, or under
 * the structure, past anything in the way there, whichever is nearer. `gap` from the structure, half
 * that clear of anything else. How far to move it.
 */
export function spotBeside(structure: Rect, box: Rect, others: readonly Rect[], gap = GAP): { x: number; y: number } {
	const clear = gap / 2
	const hit = (x: number, y: number) => others.find((o) => o.x < x + box.w + clear && o.x + o.w + clear > x && o.y < y + box.h + clear && o.y + o.h + clear > y)
	if (!hit(box.x, box.y)) return { x: 0, y: 0 }
	let x = box.x
	for (let o = hit(x, box.y); o; o = hit(x, box.y)) x = o.x + o.w + clear
	let y = structure.y + structure.h + gap
	for (let o = hit(structure.x, y); o; o = hit(structure.x, y)) y = o.y + o.h + clear
	const [right, under] = [{ x: x - box.x, y: 0 }, { x: structure.x - box.x, y: y - box.y }]
	return Math.hypot(right.x, right.y) < Math.hypot(under.x, under.y) ? right : under
}

/**
 * Make `shape` beside `structure`, on its page: to its right past its grips (a matrix's column grip
 * sits outside its box) and anything already following it, top-aligned; further right or under it if
 * something else is in the way there (`spotBeside`, once the new shape's size is known).
 */
export function putBeside<S extends TLShape>(editor: Editor, structure: TLShape, shape: Omit<TLShapePartial<S>, 'id' | 'x' | 'y' | 'parentId'>): TLShapeId | undefined {
	const bounds = editor.getShapePageBounds(structure)
	const page = editor.getAncestorPageId(structure)
	if (!bounds || !page) return
	const shapes = [...editor.getPageShapeIds(page)].flatMap((id) => editor.getShape(id) ?? [])
	const transform = editor.getShapePageTransform(structure)
	const grips = (editor.getShapeHandles(structure) ?? []).map((h) => transform.applyToPoint(h).x + GRIP)
	const followers = shapes.filter((s) => followedBy(s) === structure.id)
	const right = Math.max(bounds.maxX, ...grips, ...followers.map((f) => editor.getShapePageBounds(f)?.maxX ?? -Infinity))
	const id = createShapeId()
	const [x, y] = [right + GAP, bounds.minY]
	editor.createShape({ ...shape, id, parentId: page, x, y } as TLShapePartial)
	const box = editor.getShapePageBounds(id)
	if (!box) return id
	const others = shapes.filter((s) => s.id !== structure.id).flatMap((s) => editor.getShapePageBounds(s) ?? [])
	const by = spotBeside(bounds, box, others)
	if (by.x || by.y) editor.updateShape({ id, type: shape.type, x: x + by.x, y: y + by.y } as TLShapePartial)
	return id
}
