import type { TLShape } from 'tldraw'
import type { CellShapeUtil } from '../cells/CellShapeUtil'
import { besideBoxes, followersOf } from '../cells/followers'
import type { Frame, PlaybackView, Strip } from '../nodelink/playback'
import { stripSize, stripsHeight } from '../nodelink/SceneSvg'

/** Where an operation's strips and play bar go, in shape space. */
export interface Placement {
	strip: { x: number; y: number }
	/** Under everything beside the structure too: where the bar goes when it can't fit closer. */
	bar: { x: number; y: number }
	/**
	 * Closer spots, highest first: right under the structure (and its strips), then under each thing
	 * beside it that reaches lower, each with how wide the bar may be there before it would run into
	 * something beside the structure reaching further down (a tall code box past a recursion tree);
	 * Infinity when nothing does. The overlay takes the first the bar fits at the zoom it is drawn at.
	 */
	spots: { x: number; y: number; room: number }[]
}

/** The narrowest a play bar may be (screen px): its buttons, the counts and a little caption. */
export const MIN_BAR_WIDTH = 480

/** Where the bar goes at `zoom`: the highest spot it fits (and how wide it may be there), else under everything. */
export function barSpot({ bar, spots }: Placement, zoom: number): { x: number; y: number; maxWidth?: number } {
	const spot = spots.find((s) => s.room * zoom >= MIN_BAR_WIDTH)
	if (!spot) return bar
	return spot.room === Infinity ? { x: spot.x, y: spot.y } : { x: spot.x, y: spot.y, maxWidth: spot.room * zoom }
}

/**
 * The spots, highest first: under the structure, then under each box beside it in turn, each with
 * its room: up to the nearest box still reaching below it (Infinity: none), less a gap. Boxes are in
 * shape space, right of `left`.
 */
export function barSpots(left: number, closeY: number, beside: readonly { x: number; y: number; w: number; h: number }[], gap: number) {
	const ys = [closeY, ...beside.map((b) => b.y + b.h + gap).filter((y) => y > closeY)].sort((a, b) => a - b)
	return [...new Set(ys)].map((y) => {
		const blocking = beside.filter((b) => b.y + b.h > y && b.x > left)
		return { x: left, y, room: blocking.length ? Math.min(...blocking.map((b) => b.x)) - left - gap : Infinity }
	})
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
	const closeY = tallest ? strip.y + tallest + gap : strip.y
	const placement = {
		strip,
		bar: { x: left, y: Math.max(closeY, under + gap) },
		spots: barSpots(left, closeY, beside, gap),
	}
	placements.set(frames, { props: shape.props, meta: shape.meta, committed, followers, placement })
	return placement
}
