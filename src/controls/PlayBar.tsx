import type { ReactNode } from 'react'
import { useValue, type Editor, type TLThemeColors, type VecLike } from 'tldraw'
import {
	cancelPlayback,
	finishPlayback,
	isStepByStep,
	setStepByStep,
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
	// Stairs: one step at a time.
	steps: 'M2 13H6V9H10V5H14',
}

/**
 * Controls for an operation, under the structure: step back, play / pause, step forward, the
 * step's narration, the step count, the step-by-step toggle, and cancel. Once the result is in
 * the bar stays: step back through it or replay it, then Done (Shift keeps the highlights as
 * marks). Keys do the same (see `playback.ts`).
 */
export function PlayBar({
	editor,
	view,
	at,
	colors,
}: {
	editor: Editor
	view: PlaybackView
	/** Top centre of the bar, in the viewport (it is drawn in front of the canvas). */
	at: VecLike
	colors: TLThemeColors
}) {
	const last = view.step >= view.steps - 1
	const replay = view.done && view.paused && last
	const stepByStep = useValue('step by step', isStepByStep, [])
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
					fill={icon === 'back' || icon === 'forward' || icon === 'play' ? 'currentColor' : 'none'}
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
				transform: 'translateX(-50%)',
				display: 'flex',
				alignItems: 'center',
				gap: 2,
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
			<span data-testid="play-caption" style={{ padding: '0 8px', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis' }}>
				{view.frame?.caption ?? ''}
			</span>
			<span data-testid="play-counter" style={{ opacity: 0.55, fontVariantNumeric: 'tabular-nums', paddingRight: 4 }}>
				{view.step + 1}/{view.steps}
			</span>
			{button('play-step-mode', 'Pause at every step', 'steps', () => setStepByStep(editor, !stepByStep), {
				pressed: stepByStep,
			})}
			{view.done
				? button('play-done', 'Done (Enter; Shift keeps the highlights as marks)', 'finish', (shift) =>
						finishPlayback(editor, shift)
					)
				: button('play-cancel', 'Cancel (Esc)', 'cancel', () => cancelPlayback(editor))}
		</div>
	)
}
