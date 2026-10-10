import type { Editor, JsonObject, SerializedSchema, TLRecord, TLShape, TLShapeId } from 'tldraw'
import type { Marks } from '../cells/marks'
import { followersOf } from '../cells/followers'
import { cancelPlayback, openOperation, playOperation, recordOperations, type Frame } from '../nodelink/playback'
import { exportSteps, type StepExportOptions, type StepImage } from '../export/steps'
import { entryFolder, type ExportedEntry, type LessonEntry } from './manifest'

// The lesson log: every operation played on a board, kept in the board (document meta) so it is
// saved with it, and outside the undo history, so undo never takes a record away. Any operation in
// it can be played again as it was, on the shape as it was then, and its steps exported: so a
// teacher can teach live and make the notes afterwards.

const LESSON_KEY = 'drawdsLesson'
/** While a recorded operation is replayed: the shapes as they are now, to put back (a reload in between too). */
const REPLAY_KEY = 'drawdsReplay'
/** Oldest records go beyond this many. */
const MAX_ENTRIES = 200

/** Plain JSON (no undefined, no functions), as document meta must be. */
const json = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const metaOf = (editor: Editor) => editor.getDocumentSettings().meta

function setMeta(editor: Editor, key: string, value: unknown) {
	editor.run(() => editor.updateDocumentSettings({ meta: { ...metaOf(editor), [key]: value as JsonObject } }), { history: 'ignore' })
}

/** The operations recorded on this board, oldest first. */
export function lessonOf(editor: Editor): LessonEntry[] {
	const entries = metaOf(editor)[LESSON_KEY]
	return Array.isArray(entries) ? (entries as unknown as LessonEntry[]) : []
}

function writeLesson(editor: Editor, entries: LessonEntry[]) {
	setMeta(editor, LESSON_KEY, entries.slice(-MAX_ENTRIES))
}

/** Forget every recorded operation (not an undo step: the log isn't part of the board's history). */
export function clearLesson(editor: Editor) {
	writeLesson(editor, [])
}

/**
 * Start recording every operation played (not replays). Also puts back the shapes a replay left
 * changed, if the page was reloaded in the middle of one. Returns the cleanup.
 */
export function startLessonLog(editor: Editor) {
	putBack(editor)
	return recordOperations(editor, ({ shapeId, label, frames, final, finalFlash, code }) => {
		const shape = editor.getShape(shapeId)
		if (!shape) return
		const entry: LessonEntry = json({
			id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
			label,
			structure: shape.type,
			startedAt: Date.now(),
			before: shape,
			followers: followersOf(editor, shapeId),
			frames: frames as LessonEntry['frames'],
			final: final as LessonEntry['final'],
			finalFlash,
			...(code ? { code } : {}),
			schema: editor.store.schema.serialize(),
		})
		writeLesson(editor, [...lessonOf(editor), entry])
		return ({ outcome, shown }) =>
			writeLesson(
				editor,
				lessonOf(editor).map((e) => (e.id === entry.id ? { ...e, outcome, shown, closedAt: Date.now() } : e))
			)
	})
}

/** The entry's records, migrated from the schema they were saved with to this drawds's. */
function recordsOf(editor: Editor, entry: LessonEntry): TLShape[] | undefined {
	const records: TLShape[] = []
	for (const record of [entry.before, ...entry.followers]) {
		const migrated = editor.store.schema.migratePersistedRecord(record as unknown as TLRecord, entry.schema as SerializedSchema, 'up')
		if (migrated.type !== 'success') return undefined
		records.push(migrated.value as TLShape)
	}
	return records
}

/** Put back the shapes a replay changed (as they are now on the board), once it closes. */
function putBack(editor: Editor) {
	const saved = metaOf(editor)[REPLAY_KEY] as unknown as { id: TLShapeId; now: TLShape | null }[] | null | undefined
	if (!Array.isArray(saved)) return
	editor.run(
		() => {
			for (const { id, now } of saved) {
				if (now) editor.store.put([now])
				else if (editor.getShape(id)) editor.store.remove([id])
			}
			setMeta(editor, REPLAY_KEY, null)
		},
		{ history: 'ignore' }
	)
}

/**
 * Play a recorded operation again, as it was: its shape (and the views that followed it) as they
 * were then, in place, with its bar. Nothing goes in the undo history, and when the bar closes the
 * board is as it was before. Returns false if it can't be played (not found, or from a newer drawds).
 */
export function replayEntry(editor: Editor, id: string): boolean {
	const entry = lessonOf(editor).find((e) => e.id === id)
	const records = entry && recordsOf(editor, entry)
	if (!entry || !records) return false
	cancelPlayback(editor)
	putBack(editor)
	setMeta(
		editor,
		REPLAY_KEY,
		json(records.map((r) => ({ id: r.id, now: editor.getShape(r.id) ?? null })))
	)
	editor.run(() => editor.store.put(records), { history: 'ignore' })
	const shape = records[0]
	if (editor.getCurrentPageId() !== shape.parentId && editor.getPage(shape.parentId as never)) editor.setCurrentPage(shape.parentId as never)
	editor.select(shape.id)
	playOperation(editor, {
		shapeId: shape.id,
		label: entry.label,
		frames: entry.frames as unknown as Frame[],
		final: entry.final as never,
		finalFlash: entry.finalFlash as Marks | undefined,
		code: entry.code,
		replay: true,
		onClose: () => putBack(editor),
	})
	return true
}

/** A recorded operation's steps as images, replayed in place and put back after. */
export async function exportEntry(editor: Editor, id: string, options?: StepExportOptions): Promise<StepImage[]> {
	if (!replayEntry(editor, id)) return []
	try {
		return await exportSteps(editor, options)
	} finally {
		if (openOperation(editor)) cancelPlayback(editor)
	}
}

/** A recorded operation's step images, and the folder they go in. */
export interface LessonImages extends ExportedEntry {
	images: StepImage[]
}

/** Every recorded operation's steps, in the order they were played, each in a folder of its own. */
export async function exportLesson(editor: Editor, options?: StepExportOptions): Promise<LessonImages[]> {
	const out: LessonImages[] = []
	for (const [i, entry] of lessonOf(editor).entries()) {
		const images = await exportEntry(editor, entry.id, options)
		if (images.length) out.push({ entry, folder: entryFolder(i, entry), images })
	}
	return out
}
