import { useLayoutEffect, useRef } from 'react'
import type { Editor, TLThemeColors, VecLike } from 'tldraw'

/**
 * A small input for a key to apply to a structure (e.g. insert into a BST). Enter submits (with
 * Shift held, the operation's highlights are kept as marks); Esc or clicking away cancels.
 */
export function KeyPrompt({
	editor,
	at,
	label,
	colors,
	onSubmit,
	onCancel,
}: {
	editor: Editor
	/** Centre, in shape space. */
	at: VecLike
	label: string
	colors: TLThemeColors
	onSubmit(value: string, keep: boolean): void
	onCancel(): void
}) {
	const ref = useRef<HTMLInputElement>(null)
	useLayoutEffect(() => ref.current?.focus(), [])
	const zoom = editor.getZoomLevel()
	const [w, h] = [96 / zoom, 30 / zoom]
	return (
		<input
			ref={ref}
			data-testid="key-prompt"
			aria-label={label}
			placeholder={label}
			spellCheck={false}
			autoComplete="off"
			onPointerDown={(e) => editor.markEventAsHandled(e)}
			// Keys are handled in the capture phase and marked, so tldraw doesn't act on them (see CellInput).
			onKeyDownCapture={(e) => {
				editor.markEventAsHandled(e)
				if (e.key === 'Enter') {
					e.preventDefault()
					const value = e.currentTarget.value.trim()
					if (value) onSubmit(value, e.shiftKey)
					else onCancel()
				} else if (e.key === 'Escape') {
					e.preventDefault()
					onCancel()
				}
			}}
			onBlur={onCancel}
			style={{
				position: 'absolute',
				left: at.x - w / 2,
				top: at.y - h / 2,
				width: w,
				height: h,
				boxSizing: 'border-box',
				padding: `0 ${6 / zoom}px`,
				fontSize: 14 / zoom,
				border: `${1.5 / zoom}px solid ${colors.selectionStroke}`,
				borderRadius: 6 / zoom,
				background: colors.background,
				color: colors.text,
				outline: 'none',
				pointerEvents: 'all',
			}}
		/>
	)
}
