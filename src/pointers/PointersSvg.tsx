import { getColorValue, type TLThemeColors, type VecLike } from 'tldraw'
import { arrowHead, type Box } from '../nodelink/geometry'
import { pointerLabelSize, type PlacedPointer } from './layout'

/** Pointers are violet: a colour no mark uses, so they never read as a highlight. */
export const POINTER_COLOR = 'violet'

/**
 * Named pointers: a label with a short arrow onto its element. On the canvas each pointer slides
 * to its new element when it moves (a CSS transition on its position); exports place it directly.
 */
export function PointersSvg({
	placed,
	fontSize,
	fontFamily,
	colors,
	animate = false,
	focusId,
	hiddenId,
	drag,
	zoom = 1,
}: {
	placed: readonly PlacedPointer[]
	fontSize: number
	fontFamily: string
	colors: TLThemeColors
	/** Canvas only: slide pointers when they move. */
	animate?: boolean
	/** The picked-up pointer, drawn with a selection ring. */
	focusId?: string
	/** A pointer being dragged: drawn faintly where it was. */
	hiddenId?: string
	/** The dragged pointer at the cursor, and the element it would land on. */
	drag?: { name: string; at: VecLike; target?: Box }
	zoom?: number
}) {
	const color = getColorValue(colors, POINTER_COLOR, 'solid')
	const strokeWidth = Math.max(1.5, fontSize / 9)
	const label = (name: string, box: Box, focused = false) => (
		<>
			<rect
				x={box.x}
				y={box.y}
				width={box.w}
				height={box.h}
				rx={box.h / 2}
				fill={colors.background}
				stroke={focused ? colors.selectionStroke : color}
				strokeWidth={focused ? Math.max(strokeWidth, 2.5 / zoom) : strokeWidth}
			/>
			<text x={box.x + box.w / 2} y={box.y + box.h / 2} fontSize={fontSize} fill={color} fontWeight="bold">
				{name}
			</text>
		</>
	)
	return (
		<g fontFamily={fontFamily} textAnchor="middle" dominantBaseline="central" pointerEvents="none">
			{placed.map(({ pointer, label: box, tail, tip }) => {
				// Drawn relative to the tip, so moving the whole group moves the pointer.
				const rel = { x: box.x - tip.x, y: box.y - tip.y, w: box.w, h: box.h }
				const from = { x: tail.x - tip.x, y: tail.y - tip.y }
				const len = Math.hypot(from.x, from.y) || 1
				const head = strokeWidth * 2.5 + 4
				const end = { x: (from.x / len) * head * 0.8, y: (from.y / len) * head * 0.8 }
				const angle = Math.atan2(-from.y, -from.x)
				const position = animate
					? {
							style: {
								transform: `translate(${tip.x}px, ${tip.y}px)`,
								transition: 'transform 280ms ease-in-out',
							},
						}
					: { transform: `translate(${tip.x} ${tip.y})` }
				return (
					<g key={pointer.id} data-pointer={pointer.name} opacity={pointer.id === hiddenId ? 0.25 : 1} {...position}>
						<line x1={from.x} y1={from.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
						<polygon points={arrowHead({ x: 0, y: 0 }, angle, head)} fill={color} />
						{label(pointer.name, rel, pointer.id === focusId)}
					</g>
				)
			})}
			{drag?.target && (
				<rect
					x={drag.target.x}
					y={drag.target.y}
					width={drag.target.w}
					height={drag.target.h}
					fill="none"
					stroke={colors.selectionStroke}
					strokeWidth={2 / zoom}
					strokeDasharray={`${6 / zoom} ${4 / zoom}`}
				/>
			)}
			{drag &&
				(() => {
					const { w, h } = pointerLabelSize(drag.name, fontSize)
					return <g opacity={0.85}>{label(drag.name, { x: drag.at.x - w / 2, y: drag.at.y - h - 4 / zoom, w, h }, true)}</g>
				})()}
		</g>
	)
}
