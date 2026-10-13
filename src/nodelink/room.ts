import type { Editor, TLShape, TLShapeId, TLShapePartial } from 'tldraw'
import type { Frame } from './frame'

/**
 * Room an open operation's steps need, in the shape's layout coordinates, kept in its meta: shapes
 * whose steps draw more (or elsewhere) than the shape itself count it in their layout, so their box
 * holds every step, and `CellShapeUtil.onBeforeUpdate` moves the shape so nothing shifts on the page.
 * Set when an operation opens and cleared when it closes, never in the undo history.
 */
export const ROOM_KEY = 'drawdsRoom'

export interface Room {
	minX: number
	minY: number
	maxX: number
	maxY: number
}

export function roomOf(shape: TLShape): Room | undefined {
	// Null once taken away (meta updates merge, so a key can't be dropped).
	const room = shape.meta[ROOM_KEY] as Partial<Room> | null | undefined
	return room && [room.minX, room.minY, room.maxX, room.maxY].every((v) => typeof v === 'number') ? (room as Room) : undefined
}

/** Shapes that need room for their steps work it out (see `NodeLinkShapeUtil.withPlaybackRoom`). */
interface RoomMaker {
	withPlaybackRoom?(shape: TLShape, frames: readonly Frame[] | undefined): TLShapePartial | undefined
}

/** Make room for an operation's `frames` on its shape, or (none) take it away again. */
export function fitRoom(editor: Editor, shapeId: TLShapeId, frames?: readonly Frame[]) {
	const shape = editor.getShape(shapeId)
	if (!shape) return
	const update = (editor.getShapeUtil(shape) as RoomMaker).withPlaybackRoom?.(shape, frames)
	if (update) editor.run(() => editor.updateShape(update), { history: 'ignore', ignoreShapeLock: true })
}
