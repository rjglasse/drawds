import { getColorValue, type TLThemeColors } from 'tldraw'
import type { SceneMetrics } from '../nodelink/scene'

/**
 * A step's band: a bracket under (or beside) the cells a statement covers, labelled with it, such
 * as a loop invariant over the part done so far ("total = 4 + 6 + 5 = 15"). Drawn in front of the
 * canvas with the step's pointers, and into exported steps. Shape space.
 */
export interface Band {
	/** The cells it spans. */
	x: number
	y: number
	w: number
	h: number
	/** Under the cells (a row) or right of them (a column). */
	side: 'below' | 'right'
	label: string
}

/** How far a band reaches past its cells, its label included. */
export const bandReach = ({ fontSize }: SceneMetrics) => fontSize * 1.5

export function BandSvg({ band, metrics, colors, fontFamily }: { band: Band; metrics: SceneMetrics; colors: TLThemeColors; fontFamily: string }) {
	const { x, y, w, h, side, label } = band
	const tick = metrics.fontSize * 0.35
	const gap = metrics.fontSize * 0.25
	const size = metrics.fontSize * 0.65
	const color = getColorValue(colors, 'green', 'solid')
	const path =
		side === 'below'
			? `M ${x + gap} ${y + gap} V ${y + gap + tick} H ${x + w - gap} V ${y + gap}`
			: `M ${x + gap} ${y + gap} H ${x + gap + tick} V ${y + h - gap} H ${x + gap}`
	return (
		<g data-testid="step-band" pointerEvents="none">
			<path d={path} fill="none" stroke={color} strokeWidth={metrics.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
			<text
				x={side === 'below' ? x + w / 2 : x + gap * 2 + tick}
				y={side === 'below' ? y + gap + tick + size * 0.9 : y + h / 2}
				fontFamily={fontFamily}
				fontSize={size}
				fill={color}
				textAnchor={side === 'below' ? 'middle' : 'start'}
				dominantBaseline="central"
				style={{ whiteSpace: 'pre' }}
			>
				{label}
			</text>
		</g>
	)
}
