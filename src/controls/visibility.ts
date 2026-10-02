import type { Editor, TLShape } from 'tldraw'

/**
 * Whether to show a shape's on-canvas controls (grow grips, remove buttons): it's the only
 * selected shape, it can be changed, and the select tool is at rest or dragging one of its handles.
 */
export function showsStructureControls(editor: Editor, shape: TLShape) {
	return (
		!editor.getIsReadonly() &&
		!shape.isLocked &&
		editor.getOnlySelectedShapeId() === shape.id &&
		editor.isInAny('select.idle', 'select.pointing_handle', 'select.dragging_handle')
	)
}
