/** A shape record as saved (JSON). */
export interface ShapeRecord {
	id: string
	type: string
	parentId?: string
}

/** What the lesson log keeps of each operation played live (a board's document meta, `drawdsLesson`). */
export interface LessonEntry {
	id: string
	/** The operation's name (its undo label): `insert key`, `minimum spanning tree`... */
	label: string
	/** The structure's shape type: `binary-tree`, `graph`... */
	structure: string
	/** Epoch ms: opened, closed. */
	startedAt: number
	closedAt?: number
	outcome?: 'done' | 'cancelled'
	/** When each step came on screen: [step, epoch ms], in order (stepping back shows up as a smaller step). */
	shown?: [number, number][]
	/** The shape as it was when the operation opened, and the views that followed it (a graph's). */
	before: ShapeRecord
	followers: ShapeRecord[]
	/** The operation's steps (playback frames) and the update its result made. */
	frames: { caption?: string; [key: string]: unknown }[]
	final?: Record<string, unknown>
	/** Highlights the result adds (the new node, green). */
	finalFlash?: Record<string, string>
	/** The algorithm whose code a code box beside it showed, its lines lit. */
	code?: string
	/** The store schema the records were saved with, to migrate them when replayed by a newer drawds. */
	schema: unknown
}

/** `01-1042-insert-key`: numbered in order, the time it was played (local), the operation's name. */
export function entryFolder(index: number, entry: Pick<LessonEntry, 'label' | 'startedAt'>): string {
	const at = new Date(entry.startedAt)
	const time = `${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}`
	const slug = entry.label
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
	return `${String(index + 1).padStart(2, '0')}-${time}${slug ? `-${slug}` : ''}`
}

/** An entry's title for a list: its name, then what its first step says. */
export const entryTitle = (entry: Pick<LessonEntry, 'label' | 'frames'>) => {
	const first = entry.frames.find((f) => f.caption)?.caption
	return first ? `${entry.label}: ${first}` : entry.label
}

/** When step `step` came on screen (ISO times; more than one if it was stepped back to). */
export function stepShownAt(entry: Pick<LessonEntry, 'shown'>, step: number): string[] {
	return (entry.shown ?? []).filter(([s]) => s === step).map(([, at]) => new Date(at).toISOString())
}

export interface ExportedEntry {
	entry: LessonEntry
	folder: string
	images: { name: string; header: string; caption: string }[]
}

/**
 * The lesson as JSON beside the exported images, to line them up with a transcript of the session:
 * every operation in order with its times, and every step with its image, caption and when it was shown.
 */
export function lessonManifest(exported: readonly ExportedEntry[], exportedAt = new Date()) {
	return {
		exportedAt: exportedAt.toISOString(),
		operations: exported.map(({ entry, folder, images }) => ({
			folder,
			label: entry.label,
			title: entryTitle(entry),
			structure: entry.structure,
			startedAt: new Date(entry.startedAt).toISOString(),
			closedAt: entry.closedAt === undefined ? undefined : new Date(entry.closedAt).toISOString(),
			outcome: entry.outcome ?? 'open',
			steps: images.map((image, step) => ({ file: `${folder}/${image.name}`, header: image.header, caption: image.caption, shownAt: stepShownAt(entry, step) })),
		})),
	}
}
