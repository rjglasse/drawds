import { useEffect } from 'react'
import { defaultHandleExternalFileContent, useEditor, useToasts, useTranslation } from 'tldraw'
import { openBoardFile } from './board'

/** A board file, by its name. */
export const isBoardFile = (file: File) => /\.tldr$/i.test(file.name)

/**
 * A .tldr file dropped on the canvas opens as the board, as Open board... does (one undo step, the
 * toast offering Undo); other files go to tldraw as they would anyway (images, videos). Rendered
 * inside tldraw's UI, where its toasts and messages are.
 */
export function BoardFileDrop() {
	const editor = useEditor()
	const toasts = useToasts()
	const msg = useTranslation()
	useEffect(() => {
		const tldraw = (info: { point?: { x: number; y: number }; files: File[] }) => defaultHandleExternalFileContent(editor, info, { toasts, msg })
		editor.registerExternalContentHandler('files', async (info) => {
			const board = info.files.find(isBoardFile)
			if (board) openBoardFile(editor, toasts, await board.text(), board.name)
			else await tldraw(info)
		})
		return () => void editor.registerExternalContentHandler('files', tldraw)
	}, [editor, toasts, msg])
	return null
}
