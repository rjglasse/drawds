import { Rectangle2d, SVGContainer, ShapeUtil, getColorValue, type SvgExportContext, type TLFontFace, type TLShapeId, type TLThemeColors } from 'tldraw'
import { CueBadge } from '../../cells/CueBadge'
import { showsColourCues } from '../../cells/cues'
import type { MarkColor, Marks } from '../../cells/marks'
import { exportingStep } from '../../export/exporting'
import { arrowHead } from '../../nodelink/geometry'
import { playbackFor } from '../../nodelink/playback'
import { ARRAY_SHAPE_TYPE, type ArrayShape } from '../array/array-shape-types'
import { arrayMarkers, isUsed, usedIndices } from '../array/kinds'
import { getArrayMetrics } from '../array/layout'
import { ringLayout } from './model'
import { RING_TYPE, ringShapeMigrations, ringShapeProps, type RingShape } from './ring-shape-types'

/** Whether an array is a circular buffer: a queue with a fixed capacity. */
export const isCircularBuffer = (shape: ArrayShape) => shape.props.kind === 'queue' && shape.props.sizing === 'fixed'

/**
 * A fixed-capacity queue's circular buffer as a ring beside it (dds-55z.31): its cells round a
 * circle, front and rear marching round, so the wrap-around reads at a glance. Redrawn whenever the
 * queue changes (it reads it as it renders), an operation's step and highlights included.
 */
export class RingShapeUtil extends ShapeUtil<RingShape> {
	static override type = RING_TYPE
	static override props = ringShapeProps
	static override migrations = ringShapeMigrations

	getDefaultProps(): RingShape['props'] {
		return { structureId: '', color: 'black', size: 'm', font: 'draw' }
	}

	/** The queue as the step on screen has it (`live`), or as it is. */
	private queue(shape: RingShape, live = true) {
		const s = this.editor.getShape(shape.props.structureId as TLShapeId)
		if (!s || s.type !== ARRAY_SHAPE_TYPE) return undefined
		const playing = live ? playbackFor(this.editor, s.id) : undefined
		const props = playing?.frame?.props ? { ...(s as ArrayShape).props, ...(playing.frame.props as Partial<ArrayShape['props']>) } : (s as ArrayShape).props
		return { shape: { ...(s as ArrayShape), props }, playing }
	}

	private layout(shape: RingShape, live = true) {
		const q = this.queue(shape, live)
		const capacity = q ? q.shape.props.values.length : 1
		return ringLayout(capacity, getArrayMetrics({ size: shape.props.size, showIndices: false }).cell)
	}

	getGeometry(shape: RingShape) {
		const { size } = this.layout(shape)
		return new Rectangle2d({ x: 0, y: 0, width: size.w, height: size.h, isFilled: true })
	}

	override canEdit() {
		return false
	}

	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	component(shape: RingShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		return <SVGContainer>{this.draw(shape, colors, true)}</SVGContainer>
	}

	override toSvg(shape: RingShape, ctx: SvgExportContext) {
		// Exporting its queue's steps: the step, as on the canvas.
		const live = !!exportingStep(this.editor, shape.props.structureId as TLShapeId)
		return this.draw(shape, this.editor.getCurrentTheme().colors[ctx.colorMode], live)
	}

	private draw(shape: RingShape, colors: TLThemeColors, live: boolean) {
		const q = this.queue(shape, live)
		const fontFamily = this.editor.getCurrentTheme().fonts[shape.props.font].fontFamily
		const metrics = getArrayMetrics({ size: shape.props.size, showIndices: false })
		const { cell, fontSize, indexFontSize, strokeWidth } = metrics
		if (!q || !isCircularBuffer(q.shape)) {
			return (
				<text x={0} y={20} fontFamily={fontFamily} fontSize={14} fill={colors.text} opacity={0.6}>
					{q ? '(not a circular buffer: a queue with a fixed capacity)' : '(the queue is gone)'}
				</text>
			)
		}
		const { props } = q.shape
		const ring = this.layout(shape, live)
		const stroke = getColorValue(colors, shape.props.color, 'solid')
		const violet = getColorValue(colors, 'violet', 'solid')
		const flash = q.playing && { marks: q.playing.flash as Marks, fading: q.playing.fading, id: q.playing.id }
		const cues = showsColourCues()
		const tint = (c: MarkColor, i: number, key: string, className?: string) => (
			<g key={key} className={className}>
				<path d={ring.cells[i].path} fill={getColorValue(colors, c, 'semi')} stroke={getColorValue(colors, c, 'solid')} strokeWidth={strokeWidth * 1.6} />
				{cues && <CueBadge color={c} at={{ ...ring.cells[i].centre, r: cell * 0.12 }} colors={colors} strokeWidth={strokeWidth} />}
			</g>
		)
		const markers = arrayMarkers(props)
		const used = usedIndices(props).length
		return (
			<g fontFamily={fontFamily} textAnchor="middle" dominantBaseline="central">
				{ring.cells.map((c, i) => (
					<path key={`cell-${i}`} d={c.path} fill={colors.background} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
				))}
				{ring.cells.map((_, i) => (props.marks[String(i)] ? tint(props.marks[String(i)], i, `mark-${i}`) : null))}
				{flash &&
					ring.cells.map((_, i) =>
						flash.marks[String(i)] ? tint(flash.marks[String(i)]!, i, `flash-${i}-${flash.id}`, flash.fading ? 'drawds-flash drawds-flash-fade' : 'drawds-flash') : null
					)}
				{ring.cells.map((c, i) => {
					const v = props.values[i] ?? ''
					return v ? (
						// A value in a spare slot is faded, as on the row: off the queue until overwritten.
						<text key={`value-${i}`} data-ring-cell={i} x={c.centre.x} y={c.centre.y} fontSize={fontSize * Math.min(1, 2.5 / v.length)} fill={colors.text} opacity={isUsed(props, i) ? 1 : 0.3}>
							{v}
						</text>
					) : null
				})}
				{ring.cells.map((c, i) => (
					<text key={`index-${i}`} x={c.index.x} y={c.index.y} fontSize={indexFontSize} fill={colors.text} opacity={0.5}>
						{i}
					</text>
				))}
				{[...new Set(markers.map((m) => m.at))].map((at) => {
					// Markers on one cell (front == rear: empty or full) share its arrow.
					const names = markers.filter((m) => m.at === at).map((m) => m.name)
					const { from, to, label } = ring.marker(Number(at))
					const angle = Math.atan2(to.y - from.y, to.x - from.x)
					return (
						<g key={`marker-${at}`} data-ring-marker={names.join(',')}>
							<line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={violet} strokeWidth={strokeWidth * 1.2} />
							<polygon points={arrowHead(to, angle, cell * 0.16)} fill={violet} />
							<text x={label.x} y={label.y} fontSize={indexFontSize * 1.1} fill={violet}>
								{names.join(', ')}
							</text>
						</g>
					)
				})}
				<text x={ring.centre.x} y={ring.centre.y - indexFontSize * 0.7} fontSize={indexFontSize} fill={colors.text} opacity={0.7}>
					size {used}
				</text>
				<text x={ring.centre.x} y={ring.centre.y + indexFontSize * 0.7} fontSize={indexFontSize} fill={colors.text} opacity={0.7}>
					of {props.values.length}
				</text>
			</g>
		)
	}

	getIndicatorPath(shape: RingShape) {
		const { size } = this.layout(shape)
		const path = new Path2D()
		path.rect(0, 0, size.w, size.h)
		return path
	}

	override getFontFaces(shape: RingShape): TLFontFace[] {
		return this.editor.getCurrentTheme().fonts[shape.props.font].faces ?? []
	}
}
