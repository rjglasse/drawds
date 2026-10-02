import type { Editor, TLThemeColors, VecLike } from 'tldraw'

const ICONS = {
	remove: 'M2 2L8 8M8 2L2 8',
	insert: 'M5 1.5V8.5M1.5 5H8.5',
}

/**
 * A small round button on a structure, screen-sized whatever the zoom, centred on `at` (shape
 * space). `remove` is outlined (an x on a node's corner); `insert` is filled (a + on an edge). It's
 * HTML rather than a tldraw handle because handles can be dragged but not clicked.
 */
export function ControlButton({
	editor,
	kind,
	at,
	label,
	testId,
	colors,
	onPress,
}: {
	editor: Editor
	kind: keyof typeof ICONS
	at: VecLike
	label: string
	testId: string
	colors: TLThemeColors
	/** `keep` is true when Shift was held: keep the operation's highlights as marks. */
	onPress(keep: boolean): void
}) {
	const zoom = editor.getZoomLevel()
	const size = 18 / zoom
	const filled = kind === 'insert'
	return (
		<button
			type="button"
			className="drawds-control-button"
			aria-label={label}
			title={label}
			data-testid={testId}
			// Keep tldraw from treating the press as a canvas click (deselecting, or starting a drag).
			onPointerDown={(e) => editor.markEventAsHandled(e)}
			onPointerUp={(e) => editor.markEventAsHandled(e)}
			onClick={(e) => {
				e.stopPropagation()
				onPress(e.shiftKey)
			}}
			style={{
				position: 'absolute',
				left: at.x - size / 2,
				top: at.y - size / 2,
				width: size,
				height: size,
				padding: 0,
				borderRadius: '50%',
				border: `${1.5 / zoom}px solid ${colors.selectionStroke}`,
				background: filled ? colors.selectionStroke : colors.background,
				color: filled ? colors.background : colors.selectionStroke,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				pointerEvents: 'all',
				cursor: 'pointer',
			}}
		>
			<svg viewBox="0 0 10 10" width="55%" height="55%" aria-hidden="true">
				<path d={ICONS[kind]} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
			</svg>
		</button>
	)
}
