import { Box, type Editor, type TLShape } from 'tldraw'
import { CellShapeUtil } from '../cells/CellShapeUtil'
import { followersOf } from '../cells/followers'
import { completeOperation, currentPlayback, openOperation, showStep } from '../nodelink/playback'
import { stepFileName } from './caption'
import { whileExportingSteps } from './exporting'
import { stepExtent, stepHeader } from './StepExtrasSvg'

export interface StepImage {
	/** `01-caption-words.png`: numbered so they sort, named by what the step does. */
	name: string
	caption: string
	/** `Step 3 of 7 · comparisons 2`: the number and running counts drawn over the caption. */
	header: string
	blob: Blob
	width: number
	height: number
}

export interface StepExportOptions {
	format?: 'png' | 'svg'
	/** Pixels per canvas unit (PNG). */
	scale?: number
	background?: boolean
	/** Draw each step's caption under it (default); false leaves it to go on the slide as text. */
	captions?: boolean
	/** Width / height of every image (16 / 9 for slides): the area is widened or heightened, centred. */
	aspect?: number
}

/** `box` grown about its centre to width / height `aspect`. */
export function toAspect(box: Box, aspect: number): Box {
	const [w, h] = box.w / box.h < aspect ? [box.h * aspect, box.h] : [box.w, box.w / aspect]
	return new Box(box.midX - w / 2, box.midY - h / 2, w, h)
}

/**
 * Every step of the open operation as an image, for slides and notes: the structure (with the views
 * that follow it) as the canvas shows the step, plus the step's pointers, strips and caption. The
 * result goes in first (as stepping to the end does), so the last image shows it. Every image covers
 * the same area, the union over all steps, so slides line up. Comes back to the step it was on, paused.
 */
export async function exportSteps(
	editor: Editor,
	{ format = 'png', scale = 2, background = true, captions = true, aspect }: StepExportOptions = {}
): Promise<StepImage[]> {
	const back = openOperation(editor)?.at
	completeOperation(editor)
	const op = openOperation(editor)
	if (!op || !back) return []
	const shapeOf = () => editor.getShape(op.shapeId)
	const first = shapeOf()
	const util = first && editor.getShapeUtil(first)
	if (!first || !(util instanceof CellShapeUtil) || !util.playbackLayout) return []
	const cellUtil = util as CellShapeUtil<TLShape>
	const ids = [first.id, ...followersOf(editor, first.id).map((s) => s.id)]
	/** The page area step `k` takes: the shapes, and what the step adds beyond them. */
	const area = () => {
		const shape = shapeOf()!
		const view = currentPlayback(editor)!
		const transform = editor.getShapePageTransform(shape)
		const extent = stepExtent(cellUtil, shape, view)
		const corners = [extent.point, { x: extent.maxX, y: extent.maxY }].map((p) => transform.applyToPoint(p))
		return Box.Common([...ids.flatMap((id) => editor.getShapePageBounds(id) ?? []), Box.FromPoints(corners)])
	}
	try {
		return await whileExportingSteps(editor, { captions }, async () => {
			const areas: Box[] = []
			for (let k = 0; k < op.steps; k++) {
				showStep(editor, k)
				areas.push(area())
			}
			const all = Box.Common(areas)
			// The padding goes round the area: make the padded area the aspect.
			const bounds = aspect ? toAspect(all.clone().expandBy(24), aspect).expandBy(-24) : all
			const images: StepImage[] = []
			for (let k = 0; k < op.steps; k++) {
				showStep(editor, k)
				const view = currentPlayback(editor)
				const caption = view?.frame?.caption ?? ''
				const { blob, width, height } = await editor.toImage(ids, { format, bounds, background, padding: 24, scale })
				images.push({ name: stepFileName(k, op.steps, caption, format), caption, header: view ? stepHeader(view) : '', blob, width, height })
			}
			return images
		})
	} finally {
		showStep(editor, back)
	}
}

/**
 * Save files (paths may have folders: `01-1042-insert-key/01-....png`) into a folder the teacher
 * picks (Chrome's directory picker), else as downloads one after another (folders become a prefix).
 * Returns how many were saved (0: cancelled).
 */
export async function saveFiles(files: readonly { path: string; blob: Blob }[]): Promise<number> {
	const picker = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker
	if (picker) {
		let root: FileSystemDirectoryHandle
		try {
			root = await picker({ id: 'drawds-steps', mode: 'readwrite' })
		} catch {
			return 0
		}
		for (const { path, blob } of files) {
			const parts = path.split('/')
			let folder = root
			for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true })
			const file = await folder.getFileHandle(parts[parts.length - 1], { create: true })
			const writable = await file.createWritable()
			await writable.write(blob)
			await writable.close()
		}
		return files.length
	}
	for (const { path, blob } of files) {
		const url = URL.createObjectURL(blob)
		const a = Object.assign(document.createElement('a'), { href: url, download: path.replaceAll('/', '--') })
		a.click()
		URL.revokeObjectURL(url)
		// Browsers drop downloads started too close together.
		await new Promise((done) => setTimeout(done, 150))
	}
	return files.length
}

/** Save step images (numbered, named by their captions) into a folder, or as downloads. */
export const saveStepImages = (images: readonly StepImage[]) => saveFiles(images.map((i) => ({ path: i.name, blob: i.blob })))
