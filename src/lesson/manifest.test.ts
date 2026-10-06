import { describe, expect, it } from 'vitest'
import { entryFolder, entryTitle, lessonManifest, stepShownAt, type LessonEntry } from './manifest'

const at = (h: number, m: number, s = 0) => new Date(2026, 9, 6, h, m, s).getTime()

const entry = (over: Partial<LessonEntry> = {}): LessonEntry => ({
	id: 'x',
	label: 'insert key',
	structure: 'binary-tree',
	startedAt: at(10, 42),
	closedAt: at(10, 43),
	outcome: 'done',
	shown: [
		[0, at(10, 42, 1)],
		[1, at(10, 42, 9)],
		[0, at(10, 42, 20)],
		[1, at(10, 42, 30)],
		[2, at(10, 42, 40)],
	],
	before: { id: 'shape:t', type: 'binary-tree' },
	followers: [],
	frames: [{ caption: '45 < 50: go left' }, { caption: '45 > 30: go right' }, { caption: '45 goes there' }],
	schema: {},
	...over,
})

describe('lesson manifest', () => {
	it('names folders by order, local time and operation', () => {
		expect(entryFolder(0, entry())).toBe('01-1042-insert-key')
		expect(entryFolder(11, entry({ label: 'Minimum spanning tree', startedAt: at(9, 5) }))).toBe('12-0905-minimum-spanning-tree')
	})

	it('titles an entry by its name and first caption', () => {
		expect(entryTitle(entry())).toBe('insert key: 45 < 50: go left')
		expect(entryTitle(entry({ frames: [{}] }))).toBe('insert key')
	})

	it('knows when each step was shown, every time (stepped back to, shown again)', () => {
		expect(stepShownAt(entry(), 0)).toEqual([new Date(at(10, 42, 1)).toISOString(), new Date(at(10, 42, 20)).toISOString()])
		expect(stepShownAt(entry({ shown: undefined }), 0)).toEqual([])
	})

	it('lists every operation and step with files, captions and times', () => {
		const images = [
			{ name: '01-a.png', header: 'Step 1 of 3', caption: '45 < 50: go left' },
			{ name: '02-b.png', header: 'Step 2 of 3', caption: '45 > 30: go right' },
			{ name: '03-c.png', header: 'Step 3 of 3', caption: '45 goes there' },
		]
		const manifest = lessonManifest([{ entry: entry(), folder: '01-1042-insert-key', images }], new Date(at(12, 0)))
		expect(manifest.operations[0]).toMatchObject({ folder: '01-1042-insert-key', title: 'insert key: 45 < 50: go left', outcome: 'done' })
		expect(manifest.operations[0].steps[2]).toEqual({
			file: '01-1042-insert-key/03-c.png',
			header: 'Step 3 of 3',
			caption: '45 goes there',
			shownAt: [new Date(at(10, 42, 40)).toISOString()],
		})
	})
})
