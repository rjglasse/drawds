import {
	StateNode,
	Vec,
	createShapeId,
	maybeSnapToGrid,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
	type TLStateNodeConstructor,
	type VecLike,
} from 'tldraw'
import { newSeed } from '../data/random'
import { INITIAL_SKETCH, nextSketchState, sameSketch, type SketchState } from './line-sketch'

export interface LineSketchConfig<S extends TLShape> {
	/** Tool id, which is also the type of shape it creates. The shape must have a `seed` prop. */
	type: S['type']
	/** Pointer travel (page px) that adds one item. */
	step(shape: S): number
	/** The shape for a sketch state: page position of its top-left, plus any props to change. */
	layout(shape: S, origin: VecLike, sketch: SketchState): Pick<TLShapePartial<S>, 'x' | 'y' | 'props'>
}

/**
 * A press-and-drag tool that creates a shape and grows it by one item every `step` the pointer
 * travels along the dominant axis (see `nextSketchState`). One undo step per sketch; Esc cancels.
 */
export function createLineSketchTool<S extends TLShape>(config: LineSketchConfig<S>): TLStateNodeConstructor {
	class Idle extends StateNode {
		static override id = 'idle'

		override onEnter() {
			this.editor.setCursor({ type: 'cross', rotation: 0 })
		}

		override onPointerDown() {
			this.parent.transition('sketching')
		}

		override onCancel() {
			this.editor.setCurrentTool('select')
		}
	}

	class Sketching extends StateNode {
		static override id = 'sketching'

		private shapeId: TLShapeId = createShapeId()
		private markId = ''
		private origin = new Vec()
		private sketch: SketchState = INITIAL_SKETCH

		override onEnter() {
			this.markId = this.editor.markHistoryStoppingPoint(`sketch ${config.type}`)
			this.origin = maybeSnapToGrid(this.editor.inputs.getOriginPagePoint().clone(), this.editor)
			this.shapeId = createShapeId()
			this.sketch = INITIAL_SKETCH
			// S is generic, so TS can't see that it has a `seed` prop or relate config.type to it.
			this.editor.createShape({
				id: this.shapeId,
				type: config.type,
				props: { seed: newSeed() },
			} as unknown as TLShapePartial<S>)
			this.update(true)
		}

		override onPointerMove() {
			this.update()
		}

		override onPointerUp() {
			this.complete()
		}

		override onComplete() {
			this.complete()
		}

		override onCancel() {
			this.cancel()
		}

		override onInterrupt() {
			this.cancel()
		}

		private update(force = false) {
			const shape = this.editor.getShape(this.shapeId) as S | undefined
			if (!shape) return
			const point = this.editor.inputs.getCurrentPagePoint()
			const next = nextSketchState(this.sketch, point.x - this.origin.x, point.y - this.origin.y, config.step(shape))
			if (!force && sameSketch(next, this.sketch)) return
			this.sketch = next
			this.editor.updateShape({
				id: this.shapeId,
				type: config.type,
				...config.layout(shape, this.origin, next),
			} as unknown as TLShapePartial<S>)
		}

		private complete() {
			if (this.editor.getInstanceState().isToolLocked) {
				this.parent.transition('idle')
				return
			}
			this.editor.setCurrentTool('select.idle')
			this.editor.select(this.shapeId)
		}

		private cancel() {
			this.editor.bailToMark(this.markId)
			this.parent.transition('idle')
		}
	}

	return class LineSketchTool extends StateNode {
		static override id = config.type
		static override initial = 'idle'
		static override isLockable = true
		static override children() {
			return [Idle, Sketching]
		}
		override shapeType = config.type
	}
}
