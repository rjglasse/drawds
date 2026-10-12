import { Box, type Editor, type TLShapeId } from 'tldraw'

// Keeping what an operation opens on screen: a recursion tree put to a structure's right can run off
// the window's edge (under the style panel), and the teacher would have to pan or zoom mid-explanation.
// The camera moves once instead: panned just enough if it all fits at this zoom, else zoomed out (never
// in) to fit, top-aligned so the play bar has room under it.

interface Camera {
	x: number
	y: number
	z: number
}

interface Rect {
	x: number
	y: number
	w: number
	h: number
}

/** Never zoom out further than this to fit. */
const MIN_ZOOM = 0.4

/**
 * The camera that shows `box` (page space) inside `room` (screen space), or undefined if it already
 * does: the same zoom panned as little as can be, else zoomed out to fit (not past MIN_ZOOM) and placed
 * at the top of the room, centred across it. tldraw's screen point is (page + camera) × zoom.
 */
export function cameraToShow(camera: Camera, room: Rect, box: Rect): Camera | undefined {
	const z = Math.max(MIN_ZOOM, Math.min(camera.z, room.w / box.w, room.h / box.h))
	if (z < camera.z) return { x: (room.x + (room.w - box.w * z) / 2) / z - box.x, y: room.y / z - box.y, z }
	const shift = (at: number, size: number, from: number, length: number) => (at < from ? from - at : at + size > from + length ? from + length - (at + size) : 0)
	const dx = shift((box.x + camera.x) * z, box.w * z, room.x, room.w)
	const dy = shift((box.y + camera.y) * z, box.h * z, room.y, room.h)
	return dx || dy ? { x: camera.x + dx / z, y: camera.y + dy / z, z } : undefined
}

/** Room kept around what is shown (screen px): the menus at the top, the toolbar and the play bar below, a margin. */
const MARGIN = { left: 16, top: 56, right: 16, bottom: 190 }

/** Move the camera, if need be, so these shapes are all on screen, clear of the style panel. */
export function keepOnScreen(editor: Editor, ids: readonly TLShapeId[]) {
	const boxes = ids.flatMap((id) => editor.getShapePageBounds(id) ?? [])
	if (!boxes.length) return
	const box = Box.Common(boxes)
	const screen = editor.getViewportScreenBounds()
	// The style panel (shown while something is selected) covers the window's top right.
	const panel = editor.getContainer().querySelector('.tlui-style-panel')?.getBoundingClientRect()
	const container = editor.getContainer().getBoundingClientRect()
	const right = panel ? Math.max(MARGIN.right, container.right - panel.left + MARGIN.right) : MARGIN.right
	const room = { x: MARGIN.left, y: MARGIN.top, w: screen.w - MARGIN.left - right, h: screen.h - MARGIN.top - MARGIN.bottom }
	const camera = cameraToShow(editor.getCamera(), room, { x: box.x, y: box.y, w: box.w, h: box.h })
	if (camera) editor.setCamera(camera, { animation: { duration: 320 } })
}
