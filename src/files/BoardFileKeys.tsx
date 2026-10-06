import { useEffect } from 'react'
import { useActions, useEditor } from 'tldraw'
import { isTyping } from '../controls/keys'

/**
 * Ctrl+S / Ctrl+O (Shift+Ctrl+S) while typing on the board: in a cell, a prompt, a text shape.
 * tldraw turns its shortcuts off there, so the browser would open its own "Save page" or "Open
 * file" dialog. Save the board instead (what was typed is in it already: cells save as you type),
 * or end the edit and open one. Rendered inside tldraw's UI, where the board actions are.
 */
export function BoardFileKeys() {
	const editor = useEditor()
	const actions = useActions()
	useEffect(() => {
		const win = editor.getContainer().ownerDocument.defaultView ?? window
		const onKeyDown = (e: KeyboardEvent) => {
			if (!(e.ctrlKey || e.metaKey) || e.altKey) return
			const key = e.key.toLowerCase()
			const id = key === 's' ? (e.shiftKey ? 'drawds.save-board-as' : 'drawds.save-board') : key === 'o' && !e.shiftKey ? 'drawds.open-board' : undefined
			if (!id || !isTyping(e.target) || !editor.getContainer().contains(e.target as Node)) return
			e.preventDefault()
			e.stopPropagation()
			if (id === 'drawds.open-board') editor.complete()
			actions[id]?.onSelect('kbd')
		}
		win.addEventListener('keydown', onKeyDown, true)
		return () => win.removeEventListener('keydown', onKeyDown, true)
	}, [editor, actions])
	return null
}
