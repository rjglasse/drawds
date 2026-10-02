/** Whether `target` takes typing (keys there belong to it, not to our shortcuts). */
export function isTyping(target: EventTarget | null) {
	const el = target as HTMLElement | null
	return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/**
 * Keep the release of a key we handled from tldraw too: it acts on some keys as they come up
 * (Enter starts editing the selected shape), possibly after our handler has gone.
 */
export function swallowKeyUp(win: Window, key: string) {
	const onKeyUp = (e: KeyboardEvent) => {
		if (e.key !== key) return
		e.stopPropagation()
		win.removeEventListener('keyup', onKeyUp, true)
	}
	win.addEventListener('keyup', onKeyUp, true)
}
