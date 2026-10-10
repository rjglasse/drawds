import type { TLShape } from 'tldraw'
import type { CellShapeUtil } from '../cells/CellShapeUtil'
import { besideBoxes, followersOf } from '../cells/followers'
import type { Frame, PlaybackView, Strip } from '../nodelink/playback'
import { stripSize, stripsHeight } from '../nodelink/SceneSvg'

/** Where an operation's strips and play bar go, in shape space. */
export interface Placement {
	strip: { x: number; y: number }
	bar: { x: number; y: number }
}

const placements = new WeakMap<
	readonly Frame[],
	{ props: object; meta: object; committed: object | undefined; followers: string; placement: Placement }
>()

/**
 * The strips and the bar, placed once for the whole operation, so they hold still while it plays:
 * from the leftmost edge any step reaches, under the lowest point any step reaches (and under the
 * tallest strips). Shapes following the structure beside it (a code box, a recursion tree, a graph's
 * view) are kept clear of: the strips stay right under the structure unless one is in their way, and
 * the bar goes under them all. Worked out once per operation and shape props (and again once the result is in,
 * which can move the shape: the steps, and so the bar, stay where they were on the page). And again
 * if something starts or stops following the shape meanwhile (the code shown beside it): the bar
 * goes under that.
 */
export function placementFor(util: CellShapeUtil<TLShape>, shape: TLShape, view: PlaybackView): Placement {
	const { frames, committed } = view
	const cached = placements.get(frames)
	const followers = followersOf(util.editor, shape.id)
		.map((f) => f.id)
		.join()
	// The meta too: room made for the steps moves shape space (see playback.ts's ROOM_KEY).
	if (cached?.props === shape.props && cached.meta === shape.meta && cached.committed === committed && cached.followers === followers) {
		return cached.placement
	}
	let left = Infinity
	let bottom = -Infinity
	let tallest = 0
	let widest = 0
	let strips: Strip[] | undefined
	let gap = 0
	for (const frame of frames.length ? frames : [undefined]) {
		const layout = util.playbackLayout!(shape, frame)
		left = Math.min(left, layout.left)
		bottom = Math.max(bottom, layout.bottom)
		if (frame?.strips) strips = frame.strips
		if (strips?.length) {
			tallest = Math.max(tallest, stripsHeight(strips, layout.metrics))
			widest = Math.max(widest, ...strips.map((s) => stripSize(s, layout.metrics).w))
		}
		gap = layout.metrics.fontSize
	}
	const beside = besideBoxes(util.editor, shape)
	const under = Math.max(bottom, ...beside.map((b) => b.y + b.h))
	const top = bottom + gap
	const inTheWay = beside.some((b) => b.x < left + widest && b.x + b.w > left && b.y < top + tallest && b.y + b.h > top)
	const strip = { x: left, y: tallest && inTheWay ? under + gap : top }
	const placement = { strip, bar: { x: left, y: Math.max(tallest ? strip.y + tallest + gap : strip.y, under + gap) } }
	placements.set(frames, { props: shape.props, meta: shape.meta, committed, followers, placement })
	return placement
}
