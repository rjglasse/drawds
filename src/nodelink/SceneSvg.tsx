import type { CSSProperties } from 'react'
import { getColorValue, type TLDefaultColorStyle, type TLThemeColors } from 'tldraw'
import type { MarkColor, Marks } from '../cells/marks'
import { arrowHead, labelBox, pointerAnchor, routeScene, valueBox } from './geometry'
import { edgeCellKey, type Scene, type SceneNode } from './scene'

interface Paint {
	stroke: string
	fill: string
	text: string
	background: string
	strokeWidth: number
	fontSize: number
	labelFontSize: number
}

/** Highlights from an animated operation: drawn over nodes, fading out once it has committed. */
export interface FlashView {
	marks: Marks
	fading: boolean
	id: number
}

/** Values that just swapped between pairs of nodes, animated arcing from one to the other. */
export interface SwapView {
	pairs: [string, string][]
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
	/** Highlight colours on nodes, keyed by node key. */
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

	// Each value of a swapped pair starts at its partner's node and arcs over: one to each side.
	const swapStyle = (key: string): CSSProperties | undefined => {
		for (const [i, [a, b]] of (swaps?.pairs ?? []).entries()) {
			if (key !== a && key !== b) continue
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
				return (
					<g key={edge.key}>
						<path d={route.d} fill="none" stroke={paint.stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
						{edge.directed && (
							<polygon points={arrowHead(route.tip, route.angle, strokeWidth * 3 + 6)} fill={paint.stroke} />
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
