import {
	MigrationFailureReason,
	parseTldrawJsonFile,
	react,
	serializeTldrawJsonBlob,
	uniqueId,
	type Editor,
	type TldrawFileParseError,
	type TLUiOverrideHelpers,
} from 'tldraw'
import { cancelPlayback } from '../nodelink/playback'
import { BOARD_EXTENSION, boardFileName, boardName } from './names'

/**
 * Boards as files: a teacher prepares them before class, hands them to students, moves them between
 * machines. Where the browser lets a page write files (Chrome, Edge), Save asks where once and then
 * writes back to that file; elsewhere it downloads a copy and Open asks for a file. Opening replaces
 * the board as one undo step, so the board you had is a Ctrl+Z away.
 */

type Toasts = Pick<TLUiOverrideHelpers, 'addToast'>

interface PickerOptions {
	id?: string
	suggestedName?: string
	types?: { description: string; accept: Record<string, string[]> }[]
}

/** The File System Access pickers (not in TypeScript's DOM types yet). */
interface PickerWindow extends Window {
	showSaveFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle>
	showOpenFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle[]>
}

const MIME_TYPE = 'application/vnd.tldraw+json'
const PICKER: PickerOptions = { id: 'drawds-board', types: [{ description: 'drawds board', accept: { [MIME_TYPE]: [BOARD_EXTENSION] } }] }

/**
 * Where each board saves to, by a key in the document's meta. The key goes with the board: undo
 * past an Open brings back the old board with its own key (or none), so Save never writes the old
 * board over the file just opened.
 */
const FILE_KEY = 'drawdsFile'
const handles = new WeakMap<Editor, Map<string, FileSystemFileHandle>>()

function handlesOf(editor: Editor) {
	let map = handles.get(editor)
	if (!map) handles.set(editor, (map = new Map()))
	return map
}

function savedTo(editor: Editor): FileSystemFileHandle | undefined {
	const key = editor.getDocumentSettings().meta[FILE_KEY]
	return typeof key === 'string' ? handlesOf(editor).get(key) : undefined
}

/** Name the board after its file and remember where it lives; not an undo step of its own. */
function nameBoard(editor: Editor, name: string, handle?: FileSystemFileHandle) {
	const { meta } = editor.getDocumentSettings()
	const key = handle && savedTo(editor) === handle ? (meta[FILE_KEY] as string) : uniqueId()
	if (handle) handlesOf(editor).set(key, handle)
	editor.run(() => editor.updateDocumentSettings({ name, meta: { ...meta, [FILE_KEY]: key } }), { history: 'ignore' })
}

function windowOf(editor: Editor): PickerWindow {
	return editor.getContainer().ownerDocument.defaultView ?? window
}

/** The user closed a picker: nothing to do, nothing to say. */
function isAbort(e: unknown) {
	return e instanceof DOMException && e.name === 'AbortError'
}

function download(win: Window, blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob)
	const a = win.document.createElement('a')
	a.href = url
	a.download = fileName
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Ask for a board file with a plain file input (browsers without the pickers). */
function chooseFile(win: Window): Promise<File | undefined> {
	return new Promise((resolve) => {
		const input = win.document.createElement('input')
		input.type = 'file'
		input.accept = `${BOARD_EXTENSION},${MIME_TYPE},application/json`
		input.style.display = 'none'
		const done = (file?: File) => {
			input.remove()
			resolve(file)
		}
		input.addEventListener('change', () => done(input.files?.[0]))
		input.addEventListener('cancel', () => done())
		win.document.body.appendChild(input)
		input.click()
	})
}

/** Save the board to its file, or (`as`, or never saved) ask where first. */
export async function saveBoard(editor: Editor, { addToast }: Toasts, { as = false } = {}) {
	const win = windowOf(editor)
	try {
		let handle = as ? undefined : savedTo(editor)
		// Ask before anything else is awaited: the picker needs the key press or click that led here.
		if (!handle && win.showSaveFilePicker) {
			handle = await win.showSaveFilePicker({ ...PICKER, suggestedName: boardFileName(editor.getDocumentSettings().name) })
		}
		const fileName = handle ? handle.name : boardFileName(editor.getDocumentSettings().name)
		const blob = await serializeTldrawJsonBlob(editor)
		if (handle) {
			const writable = await handle.createWritable()
			await writable.write(blob)
			await writable.close()
		} else {
			download(win, blob, fileName)
		}
		nameBoard(editor, boardName(fileName), handle)
		addToast({ id: 'drawds-board-file', title: `Saved ${fileName}`, severity: 'success' })
	} catch (e) {
		if (isAbort(e)) return
		addToast({ id: 'drawds-board-file', title: 'Could not save the board', description: String((e as Error)?.message ?? e), severity: 'error' })
	}
}

/** Ask for a board file and open it in place of this board. */
export async function openBoard(editor: Editor, toasts: Toasts) {
	const win = windowOf(editor)
	try {
		let handle: FileSystemFileHandle | undefined
		let file: File | undefined
		if (win.showOpenFilePicker) {
			;[handle] = await win.showOpenFilePicker(PICKER)
			file = await handle.getFile()
		} else {
			file = await chooseFile(win)
		}
		if (file) openBoardFile(editor, toasts, await file.text(), file.name, handle)
	} catch (e) {
		if (isAbort(e)) return
		toasts.addToast({ id: 'drawds-board-file', title: 'Could not open the board', description: String((e as Error)?.message ?? e), severity: 'error' })
	}
}

/** Open a board file's contents, saying how it went. */
export function openBoardFile(editor: Editor, { addToast }: Toasts, json: string, fileName: string, handle?: FileSystemFileHandle) {
	const hadShapes = editor.store.allRecords().some((r) => r.typeName === 'shape')
	const error = loadBoard(editor, json, boardName(fileName), handle)
	if (error) {
		addToast({ id: 'drawds-board-file', title: `Could not open ${fileName}`, description: describeError(error), severity: 'error' })
		return
	}
	addToast({
		id: 'drawds-board-file',
		title: `Opened ${fileName}`,
		description: hadShapes ? 'The board you had is one undo away.' : undefined,
		severity: 'success',
		actions: hadShapes ? [{ type: 'normal', label: 'Undo', onClick: () => editor.undo() }] : undefined,
	})
}

/**
 * Replace the board with a file's (`json`), migrated to the shapes as they are now; one undo step.
 * Returns why it couldn't, leaving the board alone.
 */
export function loadBoard(editor: Editor, json: string, name: string, handle?: FileSystemFileHandle): TldrawFileParseError | undefined {
	const parsed = parseTldrawJsonFile({ json, schema: editor.store.schema })
	if (!parsed.ok) return parsed.error
	cancelPlayback(editor)
	editor.setCurrentTool('select')
	editor.selectNone()
	editor.markHistoryStoppingPoint('open board')
	editor.loadSnapshot(parsed.value.getStoreSnapshot())
	nameBoard(editor, name, handle)
	const bounds = editor.getCurrentPageBounds()
	if (bounds) editor.zoomToBounds(bounds, { targetZoom: 1, immediate: true })
}

function describeError(error: TldrawFileParseError): string {
	const newer = 'It was saved by a newer drawds: reload the page and try again.'
	const broken = 'The file is damaged.'
	switch (error.type) {
		case 'notATldrawFile':
			return 'It isn’t a drawds board (.tldr).'
		case 'fileFormatVersionTooNew':
			return newer
		case 'migrationFailed':
			// A shape type or version this drawds doesn't know comes from a newer one.
			return error.reason === MigrationFailureReason.TargetVersionTooNew ||
				error.reason === MigrationFailureReason.UnknownType ||
				error.reason === MigrationFailureReason.UnrecognizedSubtype
				? newer
				: broken
		case 'v1File':
			return 'It is a file from tldraw’s first version, which drawds can’t open.'
		case 'invalidRecords':
			return broken
	}
}

/** Keep the tab's title on the board's name, so the teacher sees which board is open. */
export function showBoardNameInTitle(editor: Editor) {
	const doc = editor.getContainer().ownerDocument
	return react('board name in the title', () => {
		const name = editor.getDocumentSettings().name
		doc.title = name ? `${name} · drawds` : 'drawds'
	})
}
