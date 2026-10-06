import { useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonLabel,
	TldrawUiDialogBody,
	TldrawUiDialogCloseButton,
	TldrawUiDialogFooter,
	TldrawUiDialogHeader,
	TldrawUiDialogTitle,
	useEditor,
	useValue,
	type TLUiDialogProps,
} from 'tldraw'
import { CellShapeUtil } from '../cells/CellShapeUtil'
import { saveFiles, saveStepImages } from '../export/steps'
import { clearLesson, exportEntry, exportLesson, lessonOf, replayEntry } from './log'
import { entryTitle, lessonManifest, type LessonEntry } from './manifest'

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** How far it got: every step, or where it was cancelled. */
function progress(entry: LessonEntry) {
	const steps = entry.frames.length
	if (entry.outcome !== 'cancelled') return `${steps} step${steps === 1 ? '' : 's'}`
	const furthest = Math.max(0, ...(entry.shown ?? []).map(([step]) => step)) + 1
	return `${steps} steps, cancelled at step ${furthest}`
}

/**
 * The lesson log: every operation played on this board, with when, so a session taught live can be
 * gone over afterwards. Replay one (on the structure as it was then; the board comes back after),
 * save one's steps, or save them all, in order, with a lesson.json to line them up with a transcript.
 */
export function LessonDialog({ onClose }: TLUiDialogProps) {
	const editor = useEditor()
	const entries = useValue('lesson log', () => lessonOf(editor), [editor])
	const [busy, setBusy] = useState(false)
	const structure = (entry: LessonEntry) => {
		const util = editor.getShapeUtil(entry.structure as never)
		return (util instanceof CellShapeUtil && util.menuName?.(entry.before as never)) || entry.structure
	}
	const run = async (f: () => Promise<unknown>) => {
		setBusy(true)
		try {
			await f()
		} finally {
			setBusy(false)
		}
	}
	return (
		<>
			<TldrawUiDialogHeader>
				<TldrawUiDialogTitle>Lesson log</TldrawUiDialogTitle>
				<TldrawUiDialogCloseButton />
			</TldrawUiDialogHeader>
			<TldrawUiDialogBody style={{ maxWidth: 560, maxHeight: '55vh', overflowY: 'auto' }}>
				{entries.length === 0 ? (
					<p data-testid="lesson-empty" style={{ margin: 0 }}>
						Every operation you play is kept here, with the board, so after class you can replay it or save its steps for
						notes and slides.
					</p>
				) : (
					<ol data-testid="lesson-list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
						{entries.map((entry, i) => (
							<li key={entry.id} data-testid={`lesson-entry-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
								<span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>{time(entry.startedAt)}</span>
								<span style={{ flex: 1, minWidth: 0 }}>
									<span style={{ fontWeight: 600 }}>{structure(entry)}</span> · {entryTitle(entry)}
									<span style={{ opacity: 0.6 }}> ({progress(entry)})</span>
								</span>
								<TldrawUiButton
									type="normal"
									data-testid={`lesson-replay-${i}`}
									disabled={busy}
									onClick={() => {
										onClose()
										replayEntry(editor, entry.id)
									}}
								>
									<TldrawUiButtonLabel>Replay</TldrawUiButtonLabel>
								</TldrawUiButton>
								<TldrawUiButton
									type="normal"
									data-testid={`lesson-save-${i}`}
									disabled={busy}
									onClick={() => run(async () => saveStepImages(await exportEntry(editor, entry.id)))}
								>
									<TldrawUiButtonLabel>Save steps</TldrawUiButtonLabel>
								</TldrawUiButton>
							</li>
						))}
					</ol>
				)}
			</TldrawUiDialogBody>
			<TldrawUiDialogFooter className="tlui-dialog__footer__actions">
				<TldrawUiButton type="normal" data-testid="lesson-clear" disabled={busy || !entries.length} onClick={() => clearLesson(editor)}>
					<TldrawUiButtonLabel>Clear</TldrawUiButtonLabel>
				</TldrawUiButton>
				<TldrawUiButton
					type="primary"
					data-testid="lesson-save-all"
					disabled={busy || !entries.length}
					onClick={() =>
						run(async () => {
							const exported = await exportLesson(editor)
							const manifest = new Blob([JSON.stringify(lessonManifest(exported), null, 2)], { type: 'application/json' })
							await saveFiles([
								...exported.flatMap(({ folder, images }) => images.map((image) => ({ path: `${folder}/${image.name}`, blob: image.blob }))),
								{ path: 'lesson.json', blob: manifest },
							])
						})
					}
				>
					<TldrawUiButtonLabel>{busy ? 'Saving…' : 'Save all'}</TldrawUiButtonLabel>
				</TldrawUiButton>
			</TldrawUiDialogFooter>
		</>
	)
}
