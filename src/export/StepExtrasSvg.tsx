import { Box, getColorValue, type TLShape, type TLThemeColors } from 'tldraw'
import type { CellShapeUtil } from '../cells/CellShapeUtil'
import { placementFor } from '../controls/placement'
import type { PlaybackView } from '../nodelink/playback'
import { StripSvg, stripGap, stripSize, stripsHeight } from '../nodelink/SceneSvg'
import { PointersSvg } from '../pointers/PointersSvg'
import { BandSvg, bandReach } from '../controls/BandSvg'
import { wrapText } from './caption'
import { stepDrawing } from './exporting'

/** The sans-serif the play bar uses, for the caption under an exported step. */
const CAPTION_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/**
 * What an exported step adds to the structure, in shape space: the step's own pointers (drawn in
 * front of the canvas while it plays), the strips, and where the play bar would be, the step's
 * number, running counts and caption, wrapped to the structure's width (at least a slide's worth).
 */
function stepExtras(util: CellShapeUtil<TLShape>, shape: TLShape, view: PlaybackView) {
	const layout = util.playbackLayout!(shape, view.frame)
	const placement = placementFor(util, shape, view)
	const { metrics } = layout
	const right = util.editor.getShapeGeometry(shape).bounds.maxX
	const size = metrics.fontSize * 0.8
	const width = Math.max(right - placement.bar.x, size * 30)
	const header = stepHeader(view)
	const captions = stepDrawing(util.editor).captions
	const lines = captions ? wrapText(view.frame?.caption ?? '', Math.max(20, Math.floor(width / (size * 0.52)))) : []
	const lineH = size * 1.35
	const caption = captions ? { x: placement.bar.x, y: placement.bar.y, header, headerSize: size * 0.8, lines, size, lineH, width } : undefined
	const strips = (view.strips ?? []).map((strip, i) => ({
		strip,
		at: { x: placement.strip.x, y: placement.strip.y + stripsHeight(view.strips!.slice(0, i), metrics) + (i ? stripGap(metrics) : 0) },
	}))
	const boxes: Box[] = [
		...(caption ? [new Box(caption.x, caption.y, width, caption.headerSize * 1.5 + lines.length * lineH)] : []),
		...strips.map(({ strip, at }) => new Box(at.x, at.y, stripSize(strip, metrics).w, stripSize(strip, metrics).h)),
		...(layout.pointers?.placed ?? []).map(({ label }) => new Box(label.x, label.y, label.w, label.h)),
		...(layout.pointers?.slots ?? []).map((b) => new Box(b.x, b.y, b.w, b.h)),
		// A band and its label (a label beside a column can be long: room for twenty characters or so).
		...(layout.band
			? [
					layout.band.side === 'below'
						? new Box(layout.band.x, layout.band.y, layout.band.w, bandReach(metrics))
						: new Box(layout.band.x, layout.band.y, bandReach(metrics) + metrics.fontSize * 0.65 * 0.6 * layout.band.label.length, layout.band.h),
				]
			: []),
	]
	return { layout, caption, strips, extent: boxes.length ? Box.Common(boxes) : new Box(placement.bar.x, placement.strip.y, 1, 1) }
}

/** `Step 3 of 7 · comparisons 2`: the step's number and running counts. */
export function stepHeader(view: PlaybackView) {
	const counts = Object.entries(view.counts ?? {})
		.map(([name, n]) => `${name} ${n}`)
		.join(' · ')
	return `Step ${view.step + 1} of ${view.steps}${counts ? ` · ${counts}` : ''}`
}

/** The room an exported step takes beyond the shape (shape space), to export with. */
export function stepExtent(util: CellShapeUtil<TLShape>, shape: TLShape, view: PlaybackView): Box {
	return stepExtras(util, shape, view).extent
}

/** The step's pointers, strips and caption, drawn into an export of the shape. */
export function StepExtrasSvg({ util, shape, view, colors }: { util: CellShapeUtil<TLShape>; shape: TLShape; view: PlaybackView; colors: TLThemeColors }) {
	const { layout, caption, strips } = stepExtras(util, shape, view)
	const { metrics } = layout
	return (
		<g pointerEvents="none">
			{layout.pointers?.slots.map((box) => (
				<rect
					key={`${box.x},${box.y}`}
					x={box.x}
					y={box.y}
					width={box.w}
					height={box.h}
					fill="none"
					stroke={getColorValue(colors, layout.color, 'solid')}
					strokeWidth={metrics.strokeWidth}
					strokeDasharray={`${metrics.strokeWidth * 3} ${metrics.strokeWidth * 2.5}`}
					opacity={0.45}
				/>
			))}
			{layout.band && <BandSvg band={layout.band} metrics={metrics} colors={colors} fontFamily={layout.fontFamily} />}
			{layout.pointers && <PointersSvg placed={layout.pointers.placed} fontSize={layout.pointers.fontSize} fontFamily={layout.fontFamily} colors={colors} />}
			{strips.map(({ strip, at }) => (
				<StripSvg key={strip.title} strip={strip} at={at} metrics={metrics} colors={colors} color={layout.color} fontFamily={layout.fontFamily} />
			))}
			{caption && (
				<g fontFamily={CAPTION_FONT} fill={colors.text} dominantBaseline="hanging">
					<text x={caption.x} y={caption.y} fontSize={caption.headerSize} opacity={0.6}>
						{caption.header}
					</text>
					{caption.lines.map((line, i) => (
						<text key={i} x={caption.x} y={caption.y + caption.headerSize * 1.5 + i * caption.lineH} fontSize={caption.size}>
							{line}
						</text>
					))}
				</g>
			)}
		</g>
	)
}
