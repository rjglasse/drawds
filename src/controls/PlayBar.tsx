import type { ReactNode } from 'react'
import { getColorValue, useValue, type Editor, type TLThemeColors, type VecLike } from 'tldraw'
import {
	cancelPlayback,
	cycleSpeed,
	finishPlayback,
	isAutoplay,
	playbackSpeed,
	setAutoplay,
	stepBack,
	stepForward,
	togglePlayback,
	type PlaybackView,
} from '../nodelink/playback'

const ICONS = {
	back: 'M11 3L5 8L11 13Z M4 3V13',
	forward: 'M5 3L11 8L5 13Z M12 3V13',
	play: 'M5 3L13 8L5 13Z',
	pause: 'M5 3V13 M11 3V13',
	finish: 'M3 8.5L6.5 12L13 4.5',
	replay: 'M12.9 9.5A5 5 0 1 1 11.2 4.2 M11.6 1.6V4.6H8.6',
	cancel: 'M4 4L12 12M12 4L4 12',
	// Fast-forward: play by itself.
	autoplay: 'M2 4L7.5 8L2 12Z M8.5 4L14 8L8.5 12Z',
}

/**
 * Controls for an operation, under the structure from its left edge: step back, play / pause, step
 * forward, the step count, speed, the autoplay toggle and cancel come first, in fixed places, then
 * the running counts and the step's narration, the only part that grows. So nothing under the
 * pointer moves while it plays. Operations open paused on their first step (unless autoplay is
 * on). Once the result is in the bar stays: step back through it or replay it, then Done (Shift
 * keeps the highlights as marks). Keys do the same (see `playback.ts`).
 */
export function PlayBar({
	editor,
	view,
	at,
	colors,
}: {
	editor: Editor
	view: PlaybackView
	/** Top-left corner of the bar, in the viewport (it is drawn in front of the canvas). */
	at: VecLike
	colors: TLThemeColors
}) {
	const last = view.step >= view.steps - 1
	const replay = view.done && view.paused && last
	const autoplay = useValue('autoplay', isAutoplay, [])
	const speed = useValue('playback speed', playbackSpeed, [])
	const button = (
		testId: string,
		label: string,
		icon: keyof typeof ICONS,
		onPress: (shift: boolean) => void,
		{ disabled = false, pressed }: { disabled?: boolean; pressed?: boolean } = {}
	): ReactNode => (
		<button
			type="button"
			data-testid={testId}
			aria-label={label}
			aria-pressed={pressed}
			title={label}
			disabled={disabled}
			// Never take focus, so Space / Enter keep driving the operation rather than this button.
			onMouseDown={(e) => e.preventDefault()}
			onPointerDown={(e) => editor.markEventAsHandled(e)}
			onPointerUp={(e) => editor.markEventAsHandled(e)}
			onClick={(e) => {
				e.stopPropagation()
				onPress(e.shiftKey)
			}}
			style={{
				width: 26,
				height: 26,
				padding: 0,
				border: 'none',
				borderRadius: 6,
				background: pressed ? colors.selectionStroke : 'transparent',
				color: pressed ? colors.background : colors.text,
				opacity: disabled ? 0.3 : 1,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				cursor: disabled ? 'default' : 'pointer',
				flex: 'none',
			}}
		>
			<svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
				<path
					d={ICONS[icon]}
					fill={icon === 'back' || icon === 'forward' || icon === 'play' || icon === 'autoplay' ? 'currentColor' : 'none'}
					stroke="currentColor"
					strokeWidth={1.8}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</button>
	)
	return (
		<div
			data-testid="play-bar"
			className="drawds-play-bar"
			onPointerDown={(e) => editor.markEventAsHandled(e)}
			style={{
				position: 'absolute',
				left: at.x,
				top: at.y,
				display: 'flex',
				// Top-aligned: a caption that wraps grows the bar downwards, leaving the buttons put.
				alignItems: 'flex-start',
				padding: '3px 6px',
				borderRadius: 9,
				background: colors.background,
				border: `1.5px solid ${colors.selectionStroke}`,
				boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
				color: colors.text,
				fontFamily: 'system-ui, sans-serif',
				fontSize: 13,
				whiteSpace: 'nowrap',
				pointerEvents: 'all',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 26, flex: 'none' }}>
				{button('play-back', 'Step back (Left)', 'back', () => stepBack(editor), { disabled: view.step === 0 })}
				{replay
					? button('play-toggle', 'Replay (Space)', 'replay', () => togglePlayback(editor))
					: view.paused
						? button('play-toggle', 'Play (Space)', 'play', () => togglePlayback(editor))
						: button('play-toggle', 'Pause (Space)', 'pause', () => togglePlayback(editor))}
				{button(
					'play-forward',
					last && !view.done ? 'Show the result (Right)' : 'Step forward (Right)',
					'forward',
					(shift) => stepForward(editor, shift),
					{ disabled: last && view.done }
				)}
				{/* As wide as the last step's number, so the buttons after it never shift. */}
				<span
					data-testid="play-counter"
					style={{
						opacity: 0.55,
						fontVariantNumeric: 'tabular-nums',
						minWidth: `${String(view.steps).length * 2 + 1}ch`,
						textAlign: 'center',
						padding: '0 4px',
					}}
				>
					{view.step + 1}/{view.steps}
				</span>
				<button
					type="button"
					data-testid="play-speed"
					aria-label={`Speed ${speed}x (click for the next)`}
					title="Playing speed (click for the next)"
					onMouseDown={(e) => e.preventDefault()}
					onPointerDown={(e) => editor.markEventAsHandled(e)}
					onPointerUp={(e) => editor.markEventAsHandled(e)}
					onClick={(e) => {
						e.stopPropagation()
						cycleSpeed()
					}}
					style={{
						minWidth: 30,
						height: 26,
						padding: '0 4px',
						border: 'none',
						borderRadius: 6,
						background: 'transparent',
						color: colors.text,
						font: 'inherit',
						fontVariantNumeric: 'tabular-nums',
						cursor: 'pointer',
						flex: 'none',
					}}
				>
					{speed === 0.5 ? '½' : speed}×
				</button>
				{button('play-autoplay', 'Play operations as soon as they start', 'autoplay', () => setAutoplay(editor, !autoplay), {
					pressed: autoplay,
				})}
				{view.done
					? button('play-done', 'Done (Enter; Shift keeps the highlights as marks)', 'finish', (shift) =>
							finishPlayback(editor, shift)
						)
					: button('play-cancel', 'Cancel (Esc)', 'cancel', () => cancelPlayback(editor))}
				<span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: '3px 4px', background: colors.selectionStroke, opacity: 0.35 }} />
				{view.counts && Object.keys(view.counts).length > 0 && (
					<span
						data-testid="play-counts"
						style={{
							padding: '1px 7px',
							marginLeft: 4,
							borderRadius: 6,
							background: getColorValue(colors, 'grey', 'semi'),
							fontVariantNumeric: 'tabular-nums',
						}}
					>
						{Object.entries(view.counts)
							.map(([name, n]) => `${name} ${n}`)
							.join(' · ')}
					</span>
				)}
			</div>
			<span data-testid="play-caption" style={{ padding: '4px 8px 4px 6px', width: 'max-content', maxWidth: 400, whiteSpace: 'normal', lineHeight: 1.3 }}>
				{view.frame?.caption ?? ''}
			</span>
		</div>
	)
}
