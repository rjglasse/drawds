import type { CSSProperties } from 'react'
import { getColorValue, type TLDefaultColorStyle, type TLThemeColors } from 'tldraw'
import type { MarkColor, Marks } from '../cells/marks'
import { arrowHead, badgeDirection, boundaryPoint, labelBox, pointerAnchor, routeScene, valueBox } from './geometry'
import type { Strip } from './playback'
import { edgeCellKey, type Scene, type SceneMetrics, type SceneNode } from './scene'

interface Paint {
	stroke: string
	fill: string
	text: string
	background: string
	strokeWidth: number
	fontSize: number
	labelFontSize: number
}

/**
 * Highlights from an animated operation, on nodes and edges (`edge:<key>`), plus small badges
 * beside nodes (e.g. discovery order): drawn over the scene, fading out once it has committed.
 */
export interface FlashView {
	marks: Marks
	badges?: Record<string, string>
	fading: boolean
	id: number
}

/** Values that just swapped between pairs of nodes, animated arcing from one to the other. */
export interface SwapView {
	pairs: [string, string][]
	/** Values copied from one node to another (`[from, to]`): only the copy moves. */
	moves?: [string, string][]
	id: number
}

/** Draws a scene. Shared by a shape's `component` and `toSvg` so exports match the canvas. */
export function SceneSvg({
	scene,
	colors,
	color,
	fontFamily,
	hiddenKey,
	marks = {},
	flash,
	swaps,
}: {
	scene: Scene
	colors: TLThemeColors
	color: TLDefaultColorStyle
	fontFamily: string
	/** Cell whose value is drawn by the inline editor instead. */
	hiddenKey?: string
	/** Highlight colours on nodes, keyed by node key, and on edges, keyed `edge:<key>`. */
	marks?: Marks
	/** Canvas only: an operation's highlights. */
	flash?: FlashView
	/** Canvas only: values arcing into their new nodes. */
	swaps?: SwapView
}) {
	const { strokeWidth, fontSize, labelFontSize } = scene.metrics
	const paint: Paint = {
		stroke: getColorValue(colors, color, 'solid'),
		fill: getColorValue(colors, color, 'semi'),
		text: colors.text,
		background: colors.background,
		strokeWidth,
		fontSize,
		labelFontSize,
	}
	const routes = routeScene(scene)
	const byKey = new Map(scene.nodes.map((n) => [n.key, n]))

	// Each value of a swapped pair starts at its partner's node and arcs over: one to each side. A
	// copied value arcs in from where it was copied from.
	const swapStyle = (key: string): CSSProperties | undefined => {
		const pairs = [...(swaps?.pairs ?? []), ...(swaps?.moves ?? [])]
		const copies = swaps?.pairs.length ?? 0
		for (const [i, [a, b]] of pairs.entries()) {
			if (key !== b && (key !== a || i >= copies)) continue
			const self = byKey.get(key)
			const other = byKey.get(key === a ? b : a)
			if (!self || !other) return undefined
			const dx = other.x - self.x
			const dy = other.y - self.y
			const len = Math.hypot(dx, dy) || 1
			const lift = (key === a ? 1 : -1) * Math.min(len * 0.35, self.h) * (i % 2 ? -1 : 1)
			return {
				'--from-x': `${dx}px`,
				'--from-y': `${dy}px`,
				'--mid-x': `${dx / 2 + (-dy / len) * lift}px`,
				'--mid-y': `${dy / 2 + (dx / len) * lift}px`,
				animation: 'drawds-swap 380ms ease-in-out',
			} as CSSProperties
		}
		return undefined
	}

	return (
		<g fontFamily={fontFamily} textAnchor="middle" dominantBaseline="central">
			{scene.edges.map((edge) => {
				const route = routes.get(edge.key)
				if (!route) return null
				const labelKey = edgeCellKey(edge.key)
				const label = edge.label !== undefined && labelKey !== hiddenKey ? edge.label : undefined
				const box = label !== undefined ? labelBox(route.labelAt, label, labelFontSize) : undefined
				// A marked edge is drawn heavier, in its mark colour (e.g. a path or a spanning tree).
				const mark = marks[labelKey]
				const stroke = mark ? getColorValue(colors, mark, 'solid') : paint.stroke
				const width = mark ? strokeWidth * 2.2 : strokeWidth
				const flashColor = flash?.marks[labelKey]
				const flashStroke = flashColor && getColorValue(colors, flashColor, 'solid')
				return (
					<g key={edge.key}>
						<path d={route.d} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" />
						{edge.directed && <polygon points={arrowHead(route.tip, route.angle, width * 3 + 6)} fill={stroke} />}
						{flash && flashStroke && (
							// Keyed per step, like node highlights, so the fade restarts when the operation commits.
							<g key={`flash-${flash.id}`} className={flash.fading ? 'drawds-flash drawds-flash-fade' : 'drawds-flash'}>
								<path d={route.d} fill="none" stroke={flashStroke} strokeWidth={strokeWidth * 2.2} strokeLinecap="round" />
								{edge.directed && (
									<polygon points={arrowHead(route.tip, route.angle, strokeWidth * 2.2 * 3 + 6)} fill={flashStroke} />
								)}
							</g>
						)}
						{box && (
							<>
								<rect x={box.x} y={box.y} width={box.w} height={box.h} rx={box.h / 2} fill={paint.background} />
								<text x={route.labelAt.x} y={route.labelAt.y} fontSize={labelFontSize} fill={paint.text}>
									{label}
								</text>
							</>
						)}
					</g>
				)
			})}
			{/* Two passes, shapes then values, so a value in flight is never painted over by a node. */}
			{scene.nodes.map((node) => {
				const flashColor = flash?.marks[node.key]
				return (
					<NodeShapeSvg
						key={node.key}
						node={node}
						paint={marks[node.key] ? markedPaint(paint, colors, marks[node.key]) : paint}
						flash={flashColor && flash ? { paint: markedPaint(paint, colors, flashColor), fading: flash.fading, id: flash.id } : undefined}
					/>
				)
			})}
			{scene.nodes.map((node) => {
				const swap = swapStyle(node.key)
				return (
					<NodeValueSvg
						key={swap && swaps ? `${node.key}:swap-${swaps.id}` : node.key}
						node={node}
						paint={paint}
						hideValue={node.key === hiddenKey}
						swapStyle={swap}
					/>
				)
			})}
			{flash?.badges &&
				scene.nodes.map((node) =>
					flash.badges?.[node.key] ? (
						<NodeBadge
							key={`badge-${node.key}-${flash.id}`}
							node={node}
							direction={badgeDirection(node, scene)}
							text={flash.badges[node.key]}
							paint={paint}
							fading={flash.fading}
						/>
					) : null
				)}
		</g>
	)
}

/** A small round label just outside a node, e.g. the order it was discovered in. */
function NodeBadge({
	node,
	direction,
	text,
	paint,
	fading,
}: {
	node: SceneNode
	direction: { x: number; y: number }
	text: string
	paint: Paint
	fading: boolean
}) {
	const r = paint.labelFontSize * 0.78 * Math.max(1, text.length * 0.6)
	const edge = boundaryPoint(node, { x: node.x + direction.x * node.w, y: node.y + direction.y * node.h })
	const x = edge.x + direction.x * r * 0.75
	const y = edge.y + direction.y * r * 0.75
	return (
		<g className={fading ? 'drawds-flash drawds-flash-fade' : 'drawds-flash'}>
			<circle cx={x} cy={y} r={r} fill={paint.background} stroke={paint.text} strokeWidth={paint.strokeWidth * 0.8} />
			<text x={x} y={y} fontSize={paint.labelFontSize * 0.95} fill={paint.text}>
				{text}
			</text>
		</g>
	)
}

/** A marked node is filled and outlined in its mark colour, with a heavier outline. */
function markedPaint(paint: Paint, colors: TLThemeColors, mark: MarkColor): Paint {
	return {
		...paint,
		fill: getColorValue(colors, mark, 'semi'),
		stroke: getColorValue(colors, mark, 'solid'),
		strokeWidth: paint.strokeWidth * 1.6,
	}
}

function NodeShapeSvg({
	node,
	paint,
	flash,
}: {
	node: SceneNode
	paint: Paint
	flash?: { paint: Paint; fading: boolean; id: number }
}) {
	if (node.kind === 'null' || node.kind === 'label') return null
	const outline = (p: Paint, className?: string) =>
		node.kind === 'circle' ? (
			<circle className={className} cx={node.x} cy={node.y} r={node.w / 2} fill={p.fill} stroke={p.stroke} strokeWidth={p.strokeWidth} />
		) : (
			<rect
				className={className}
				x={node.x - node.w / 2}
				y={node.y - node.h / 2}
				width={node.w}
				height={node.h}
				fill={p.fill}
				stroke={p.stroke}
				strokeWidth={p.strokeWidth}
				strokeLinejoin="round"
			/>
		)
	const box = valueBox(node)
	const divider = node.pointer && (node.pointer.side === 'right' ? box.x + box.w : box.x)
	const anchor = pointerAnchor(node)
	return (
		<g>
			{outline(paint)}
			{flash && (
				// A new key when the operation commits restarts the element, which starts the fade.
				<g key={`flash-${flash.id}`}>{outline(flash.paint, flash.fading ? 'drawds-flash drawds-flash-fade' : 'drawds-flash')}</g>
			)}
			{divider !== undefined && (
				<>
					<line
						x1={divider}
						y1={node.y - node.h / 2}
						x2={divider}
						y2={node.y + node.h / 2}
						stroke={paint.stroke}
						strokeWidth={paint.strokeWidth}
					/>
					<circle cx={anchor.x} cy={anchor.y} r={paint.strokeWidth * 1.6} fill={paint.stroke} />
				</>
			)}
		</g>
	)
}

function NodeValueSvg({
	node,
	paint,
	hideValue,
	swapStyle,
}: {
	node: SceneNode
	paint: Paint
	hideValue: boolean
	/** Arc in from a partner node (a new key per swap restarts the animation). */
	swapStyle?: CSSProperties
}) {
	const value = hideValue ? null : node.value
	if (node.kind === 'null' || node.kind === 'label') {
		return (
			<text x={node.x} y={node.y} fontSize={paint.labelFontSize} fill={paint.text} opacity={node.kind === 'null' ? 0.55 : 0.8}>
				{value}
			</text>
		)
	}
	const box = valueBox(node)
	return (
		<text
			x={box.x + box.w / 2}
			y={box.y + box.h / 2}
			fontSize={paint.fontSize * Math.min(1, 3 / Math.max(1, node.value.length))}
			fill={paint.text}
			style={swapStyle}
		>
			{value}
		</text>
	)
}

/** Size of a strip: a title line over a row of boxes, one per item. */
export function stripSize(strip: Strip, { fontSize, labelFontSize }: SceneMetrics) {
	const box = fontSize * 1.9
	const title = labelFontSize * 1.5
	return { box, title, w: Math.max(1, strip.items.length) * box, h: title + box }
}

/** Gap between strips stacked one under the other. */
export const stripGap = ({ fontSize }: SceneMetrics) => fontSize * 0.6

/** Height of several strips stacked one under the other. */
export function stripsHeight(strips: readonly Strip[], metrics: SceneMetrics) {
	return strips.reduce((h, s, i) => h + stripSize(s, metrics).h + (i ? stripGap(metrics) : 0), 0)
}

/**
 * An operation's queue or stack, drawn under the structure as a row of boxes (front / bottom on
 * the left) with its title above. Canvas only.
 */
export function StripSvg({
	strip,
	at,
	metrics,
	colors,
	color,
	fontFamily,
}: {
	strip: Strip
	/** Top-left corner, in shape space. */
	at: { x: number; y: number }
	metrics: SceneMetrics
	colors: TLThemeColors
	color: TLDefaultColorStyle
	fontFamily: string
}) {
	const { box, title } = stripSize(strip, metrics)
	const stroke = getColorValue(colors, color, 'solid')
	const y = at.y + title
	return (
		<g data-testid="playback-strip" fontFamily={fontFamily} dominantBaseline="central" pointerEvents="none">
			<text x={at.x} y={at.y + title / 2} fontSize={metrics.labelFontSize} fill={colors.text} opacity={0.75}>
				{strip.title}
			</text>
			{strip.items.length === 0 ? (
				<rect
					x={at.x}
					y={y}
					width={box}
					height={box}
					fill="none"
					stroke={stroke}
					strokeWidth={metrics.strokeWidth}
					strokeDasharray={`${metrics.strokeWidth * 3} ${metrics.strokeWidth * 2}`}
					opacity={0.5}
				/>
			) : (
				strip.items.map((item, i) => (
					<g key={i}>
						<rect
							x={at.x + i * box}
							y={y}
							width={box}
							height={box}
							fill={getColorValue(colors, color, 'semi')}
							stroke={stroke}
							strokeWidth={metrics.strokeWidth}
						/>
						<text x={at.x + i * box + box / 2} y={y + box / 2} textAnchor="middle" fontSize={metrics.fontSize * 0.85} fill={colors.text}>
							{item}
						</text>
					</g>
				))
			)}
		</g>
	)
}
