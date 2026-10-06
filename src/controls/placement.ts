import type { TLShape } from 'tldraw'
import type { CellShapeUtil } from '../cells/CellShapeUtil'
import type { Frame, PlaybackView, Strip } from '../nodelink/playback'
import { stripsHeight } from '../nodelink/SceneSvg'

/** Where an operation's strips and play bar go, in shape space. */
export interface Placement {
	strip: { x: number; y: number }
	bar: { x: number; y: number }
}

const placements = new WeakMap<readonly Frame[], { props: object; meta: object; committed: object | undefined; placement: Placement }>()

/**
 * The strips and the bar, placed once for the whole operation, so they hold still while it plays:
 * from the leftmost edge any step reaches, under the lowest point any step reaches (and under the
 * tallest strips). Worked out once per operation and shape props (and again once the result is in,
 * which can move the shape: the steps, and so the bar, stay where they were on the page).
 */
export function placementFor(util: CellShapeUtil<TLShape>, shape: TLShape, view: PlaybackView): Placement {
	const { frames, committed } = view
	const cached = placements.get(frames)
	// The meta too: room made for the steps moves shape space (see playback.ts's ROOM_KEY).
	if (cached?.props === shape.props && cached.meta === shape.meta && cached.committed === committed) return cached.placement
	let left = Infinity
	let bottom = -Infinity
	let tallest = 0
	let strips: Strip[] | undefined
	let gap = 0
	for (const frame of frames.length ? frames : [undefined]) {
		const layout = util.playbackLayout!(shape, frame)
		left = Math.min(left, layout.left)
		bottom = Math.max(bottom, layout.bottom)
		if (frame?.strips) strips = frame.strips
		if (strips?.length) tallest = Math.max(tallest, stripsHeight(strips, layout.metrics))
		gap = layout.metrics.fontSize
	}
	const strip = { x: left, y: bottom + gap }
	const placement = { strip, bar: { x: left, y: tallest ? strip.y + tallest + gap : strip.y } }
	placements.set(frames, { props: shape.props, meta: shape.meta, committed, placement })
	return placement
}
