import type { IndexKey, TLHandle, VecLike } from 'tldraw'

/** Handle ids of the grips that grow a sequence (array, list) at its end and at its start. */
export const GROW_HANDLE_ID = 'grow'
export const GROW_START_HANDLE_ID = 'grow-start'

export function isGrowHandle(id: string) {
	return id === GROW_HANDLE_ID || id === GROW_START_HANDLE_ID
}

/** Upper bound on elements added by dragging, so a wild drag can't create thousands. */
export const MAX_ELEMENTS = 200

/**
 * A grow grip's handle. It's a 'create' handle, which tldraw only draws on hover; the shape draws
 * its own '+' grip (GrowGrip) at the same spot.
 */
export function growHandle(at: VecLike, index: IndexKey, id = GROW_HANDLE_ID): TLHandle {
	const where = id === GROW_START_HANDLE_ID ? 'at the start' : 'at the end'
	return { id, type: 'create', label: `Drag to add or remove elements ${where}`, index, x: at.x, y: at.y }
}

/**
 * Element count after dragging a grip from `from` to `to`: one element per `step` travelled along
 * `axis` (a unit vector pointing away from the structure), at least 1.
 */
export function grownCount(count: number, from: VecLike, to: VecLike, axis: VecLike, step: number): number {
	const along = (to.x - from.x) * axis.x + (to.y - from.y) * axis.y
	return Math.min(MAX_ELEMENTS, Math.max(1, count + Math.round(along / step)))
}
