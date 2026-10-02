import { getColorValue, type TLDefaultColorStyle, type TLThemeColors } from 'tldraw'
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

/** Draws a scene. Shared by a shape's `component` and `toSvg` so exports match the canvas. */
export function SceneSvg({
	scene,
	colors,
	color,
	fontFamily,
	hiddenKey,
}: {
	scene: Scene
	colors: TLThemeColors
	color: TLDefaultColorStyle
	fontFamily: string
	/** Cell whose value is drawn by the inline editor instead. */
	hiddenKey?: string
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
			{scene.nodes.map((node) => (
				<NodeSvg key={node.key} node={node} paint={paint} hideValue={node.key === hiddenKey} />
			))}
		</g>
	)
}

function NodeSvg({ node, paint, hideValue }: { node: SceneNode; paint: Paint; hideValue: boolean }) {
	const { stroke, fill, text, strokeWidth, fontSize } = paint
	const value = hideValue ? null : node.value

	if (node.kind === 'null' || node.kind === 'label') {
		return (
			<text x={node.x} y={node.y} fontSize={paint.labelFontSize} fill={text} opacity={node.kind === 'null' ? 0.55 : 0.8}>
				{value}
			</text>
		)
	}

	const box = valueBox(node)
	const valueText = (
		<text
			x={box.x + box.w / 2}
			y={box.y + box.h / 2}
			fontSize={fontSize * Math.min(1, 3 / Math.max(1, node.value.length))}
			fill={text}
		>
			{value}
		</text>
	)

	if (node.kind === 'circle') {
		return (
			<g>
				<circle cx={node.x} cy={node.y} r={node.w / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
				{valueText}
			</g>
		)
	}

	const outer = { x: node.x - node.w / 2, y: node.y - node.h / 2 }
	const divider = node.pointer && (node.pointer.side === 'right' ? box.x + box.w : box.x)
	const anchor = pointerAnchor(node)
	return (
		<g>
			<rect
				x={outer.x}
				y={outer.y}
				width={node.w}
				height={node.h}
				fill={fill}
				stroke={stroke}
				strokeWidth={strokeWidth}
				strokeLinejoin="round"
			/>
			{divider !== undefined && (
				<>
					<line x1={divider} y1={outer.y} x2={divider} y2={outer.y + node.h} stroke={stroke} strokeWidth={strokeWidth} />
					<circle cx={anchor.x} cy={anchor.y} r={strokeWidth * 1.6} fill={stroke} />
				</>
			)}
			{valueText}
		</g>
	)
}
