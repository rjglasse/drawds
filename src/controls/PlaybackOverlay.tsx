import { getColorValue, useEditor, useValue, type TLShape } from 'tldraw'
import { CellShapeUtil } from '../cells/CellShapeUtil'
import { currentPlayback, type Frame, type PlaybackView, type Strip } from '../nodelink/playback'
import { StripSvg, stripGap, stripsHeight } from '../nodelink/SceneSvg'
import { PointersSvg } from '../pointers/PointersSvg'
import { PlayBar } from './PlayBar'

/** Where an operation's strips and play bar go, in shape space. */
interface Placement {
	strip: { x: number; y: number }
	bar: { x: number; y: number }
}

const placements = new WeakMap<readonly Frame[], { props: object; committed: object | undefined; placement: Placement }>()

/**
 * The strips and the bar, placed once for the whole operation, so they hold still while it plays:
 * from the leftmost edge any step reaches, under the lowest point any step reaches (and under the
 * tallest strips). Worked out once per operation and shape props (and again once the result is in,
 * which can move the shape: the steps, and so the bar, stay where they were on the page).
 */
function placementFor(util: CellShapeUtil<TLShape>, shape: TLShape, view: PlaybackView): Placement {
	const { frames, committed } = view
	const cached = placements.get(frames)
	if (cached?.props === shape.props && cached.committed === committed) return cached.placement
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
	placements.set(frames, { props: shape.props, committed, placement })
	return placement
}

/**
 * The play bar and the queue / stack strip of the operation being shown, drawn in front of the
 * canvas (tldraw's InFrontOfTheCanvas) under the structure, following the camera, with the step's
 * own pointers. Drawn inside the shape they would lie outside its box, and could leave ghosts when
 * the camera moves.
 */
export function PlaybackOverlay() {
	const editor = useEditor()
	const placed = useValue(
		'playback overlay',
		() => {
			const view = currentPlayback(editor)
			if (!view || view.fading) return null
			const shape = editor.getShape(view.shapeId)
			const util = shape && editor.getShapeUtil(shape)
			if (!shape || !(util instanceof CellShapeUtil) || !util.playbackLayout) return null
			const layout = util.playbackLayout(shape, view.frame)
			const placement = placementFor(util as CellShapeUtil<TLShape>, shape, view)
			const transform = editor.getShapePageTransform(shape)
			const toViewport = (p: { x: number; y: number }) => editor.pageToViewport(transform.applyToPoint(p))
			return {
				view,
				layout,
				strip: toViewport(placement.strip),
				bar: toViewport(placement.bar),
				origin: toViewport({ x: 0, y: 0 }),
				zoom: editor.getZoomLevel(),
				colors: editor.getCurrentTheme().colors[editor.getColorMode()],
			}
		},
		[editor]
	)
	if (!placed) return null
	const { view, layout, strip, bar, origin, zoom, colors } = placed
	const { metrics } = layout
	return (
		<>
			{layout.pointers && (
				<svg
					style={{ position: 'absolute', left: origin.x, top: origin.y, overflow: 'visible', pointerEvents: 'none' }}
					width={1}
					height={1}
				>
					<g transform={`scale(${zoom})`}>
						{layout.pointers.slots.map((box) => (
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
						<PointersSvg
							placed={layout.pointers.placed}
							fontSize={layout.pointers.fontSize}
							fontFamily={layout.fontFamily}
							colors={colors}
							animate
							zoom={zoom}
						/>
					</g>
				</svg>
			)}
			{view.strips?.length ? (
				<svg
					style={{ position: 'absolute', left: strip.x, top: strip.y, overflow: 'visible', pointerEvents: 'none' }}
					width={1}
					height={1}
				>
					<g transform={`scale(${zoom})`}>
						{view.strips.map((s, i) => (
							<StripSvg
								key={s.title}
								strip={s}
								at={{ x: 0, y: stripsHeight(view.strips!.slice(0, i), layout.metrics) + (i ? stripGap(layout.metrics) : 0) }}
								metrics={layout.metrics}
								colors={colors}
								color={layout.color}
								fontFamily={layout.fontFamily}
							/>
						))}
					</g>
				</svg>
			) : null}
			<PlayBar editor={editor} view={view} at={bar} colors={colors} />
		</>
	)
}
