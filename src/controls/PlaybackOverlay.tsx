import { getColorValue, useEditor, useValue, type TLShape } from 'tldraw'
import { CellShapeUtil } from '../cells/CellShapeUtil'
import { currentPlayback } from '../nodelink/playback'
import { StripSvg, stripGap, stripsHeight } from '../nodelink/SceneSvg'
import { PointersSvg } from '../pointers/PointersSvg'
import { BandSvg } from './BandSvg'
import { placementFor } from './placement'
import { PlayBar } from './PlayBar'

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
			{(layout.pointers || layout.band) && (
				<svg
					style={{ position: 'absolute', left: origin.x, top: origin.y, overflow: 'visible', pointerEvents: 'none' }}
					width={1}
					height={1}
				>
					<g transform={`scale(${zoom})`}>
						{layout.band && <BandSvg band={layout.band} metrics={metrics} colors={colors} fontFamily={layout.fontFamily} />}
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
						{layout.pointers && (
							<PointersSvg
								placed={layout.pointers.placed}
								fontSize={layout.pointers.fontSize}
								fontFamily={layout.fontFamily}
								colors={colors}
								animate
								zoom={zoom}
							/>
						)}
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
