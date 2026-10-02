import type { TLThemeColors, VecLike } from 'tldraw'

/** A '+' in a circle, drawn at screen size whatever the zoom. Canvas only; never exported. */
export function GrowGrip({ at, zoom, colors }: { at: VecLike; zoom: number; colors: TLThemeColors }) {
	const r = 9 / zoom
	const arm = 4.5 / zoom
	const width = 1.5 / zoom
	return (
		<g pointerEvents="none">
			<circle cx={at.x} cy={at.y} r={r} fill={colors.background} stroke={colors.selectionStroke} strokeWidth={width} />
			<path
				d={`M ${at.x - arm} ${at.y} h ${arm * 2} M ${at.x} ${at.y - arm} v ${arm * 2}`}
				stroke={colors.selectionStroke}
				strokeWidth={width}
				strokeLinecap="round"
			/>
		</g>
	)
}
