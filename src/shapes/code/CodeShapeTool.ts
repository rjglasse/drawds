import { DefaultSizeStyle, StateNode, createShapeId } from 'tldraw'
import { CODE_TYPE, type CodeShape } from './code-shape-types'
import { createdFrom, type CodeShapeUtil } from './CodeShapeUtil'
import { getCodeMetrics } from './layout'

class Idle extends StateNode {
	static override id = 'idle'

	override onEnter() {
		this.editor.setCursor({ type: 'cross', rotation: 0 })
	}

	// On release, not on press: the press's own focus change is over by then, so the editor keeps it.
	override onPointerUp() {
		const point = this.editor.inputs.getCurrentPagePoint()
		const { padX, padY, lineH } = getCodeMetrics(this.editor.getStyleForNextShape(DefaultSizeStyle))
		const id = createShapeId()
		// The typing that follows goes on from this mark: one undo takes the new box back whole.
		createdFrom.set(id, this.editor.markHistoryStoppingPoint('create code box'))
		// The first line starts at the click.
		this.editor.createShape<CodeShape>({ id, type: CODE_TYPE, x: point.x - padX, y: point.y - padY - lineH / 2 })
		const shape = this.editor.getShape<CodeShape>(id)
		if (shape) (this.editor.getShapeUtil(CODE_TYPE) as CodeShapeUtil).editCell(shape, 'code')
	}

	override onCancel() {
		this.editor.setCurrentTool('select')
	}
}

/** Click to place a code box and start typing in it (the language from the style panel). */
export class CodeShapeTool extends StateNode {
	static override id = CODE_TYPE
	static override initial = 'idle'
	static override children() {
		return [Idle]
	}
	override shapeType = CODE_TYPE
}
