import { getColorValue, type TLThemeColors } from 'tldraw'
import { CUE_SHAPES, type CueBadgeAt, type CueShape } from './cues'
import type { MarkColor } from './marks'

/**
 * A colour-blind cue: a small round badge holding the colour's shape (see `CUE_SHAPES`). The badge is
 * filled with the background, so a highlight's badge covers a mark's underneath and, as the
 * highlight fades, the mark's shows again.
 */
export function CueBadge({
	color,
	at,
	colors,
	strokeWidth,
	className,
}: {
	color: MarkColor
	at: CueBadgeAt
	colors: TLThemeColors
	strokeWidth: number
	className?: string
}) {
	const solid = getColorValue(colors, color, 'solid')
	const line = Math.min(strokeWidth * 0.7, at.r * 0.25)
	return (
		<g className={className} data-cue={color} pointerEvents="none">
			<circle cx={at.x} cy={at.y} r={at.r - line / 2} fill={colors.background} stroke={solid} strokeWidth={line} />
			<CueShapeSvg shape={CUE_SHAPES[color]} x={at.x} y={at.y} s={at.r * 0.52} fill={solid} />
		</g>
	)
}

/** A shape about `2s` across, centred on (x, y). */
function CueShapeSvg({ shape, x, y, s, fill }: { shape: CueShape; x: number; y: number; s: number; fill: string }) {
	switch (shape) {
		case 'triangle': {
			// Centred on its centroid, so it sits in the middle of the badge.
			const h = s * 1.9
			const w = s * 1.1
			return <polygon points={`${x},${y - (h * 2) / 3} ${x + w},${y + h / 3} ${x - w},${y + h / 3}`} fill={fill} />
		}
		case 'diamond': {
			const d = s * 1.15
			return <polygon points={`${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}`} fill={fill} />
		}
		case 'square':
			return <rect x={x - s * 0.8} y={y - s * 0.8} width={s * 1.6} height={s * 1.6} fill={fill} />
		case 'circle':
			return <circle cx={x} cy={y} r={s * 0.85} fill={fill} />
	}
}
