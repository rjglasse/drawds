import type { Editor, JsonObject } from 'tldraw'
import { CodeLanguageStyle } from '../shapes/code/code-shape-types'
import type { CodeLanguage } from '../shapes/code/highlight'

// Track with code (dds-2tt.5), a board's setting: whether every structure has the code beside it, and
// the language the board's code is written in. Kept in the board's document meta, so it goes with
// the board (a reload, a board file). Out of undo, as tldraw's own settings are (and as the lesson
// log is: an undo puts back the whole document record, which would take later records with it); the
// boxes it puts in, takes away or switches are an undo step of their own.

export const CODE_MODE_KEY = 'drawdsCode'

export interface CodeMode {
	/** Every structure has the code beside it; a new one gets its box when it is drawn. */
	on: boolean
	/** The board's language, once one is picked. */
	language?: CodeLanguage
}

export function codeMode(editor: Editor): CodeMode {
	const mode = editor.getDocumentSettings().meta[CODE_MODE_KEY] as Partial<CodeMode> | undefined
	return { on: mode?.on === true, ...(mode?.language ? { language: mode.language } : {}) }
}

/** The language new code on the board comes in: the board's, else the one last picked in the style panel. */
export const codeLanguage = (editor: Editor): CodeLanguage => codeMode(editor).language ?? editor.getStyleForNextShape(CodeLanguageStyle)

export function setCodeMode(editor: Editor, change: Partial<CodeMode>) {
	const { meta } = editor.getDocumentSettings()
	const mode = { ...codeMode(editor), ...change }
	editor.run(() => editor.updateDocumentSettings({ meta: { ...meta, [CODE_MODE_KEY]: mode as unknown as JsonObject } }), { history: 'ignore' })
}
