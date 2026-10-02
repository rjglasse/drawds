import { useEditor, useValue } from 'tldraw'
import { NodeLinkShapeUtil } from '../nodelink/NodeLinkShapeUtil'
import { currentPlayback } from '../nodelink/playback'
import { StripSvg } from '../nodelink/SceneSvg'
import { PlayBar } from './PlayBar'

/**
 * The play bar and the queue / stack strip of the operation being shown, drawn in front of the
 * canvas (tldraw's InFrontOfTheCanvas) under the structure, following the camera. Drawn inside the
 * shape they would lie outside its box, and could leave ghosts when the camera moves.
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
			if (!shape || !(util instanceof NodeLinkShapeUtil)) return null
			const layout = util.playbackLayout(shape, view.strip)
			const transform = editor.getShapePageTransform(shape)
			const toViewport = (p: { x: number; y: number }) => editor.pageToViewport(transform.applyToPoint(p))
			return {
				view,
				layout,
				strip: toViewport(layout.strip),
				bar: toViewport(layout.bar),
				zoom: editor.getZoomLevel(),
				colors: editor.getCurrentTheme().colors[editor.getColorMode()],
			}
		},
		[editor]
	)
	if (!placed) return null
	const { view, layout, strip, bar, zoom, colors } = placed
	return (
		<>
			{view.strip && (
				<svg
					style={{ position: 'absolute', left: strip.x, top: strip.y, overflow: 'visible', pointerEvents: 'none' }}
					width={1}
					height={1}
				>
					<g transform={`scale(${zoom})`}>
						<StripSvg
							strip={view.strip}
							at={{ x: 0, y: 0 }}
							metrics={layout.metrics}
							colors={colors}
							color={layout.color}
							fontFamily={layout.fontFamily}
						/>
					</g>
				</svg>
			)}
			<PlayBar editor={editor} view={view} at={bar} colors={colors} />
		</>
	)
}
