import { expect, test, type Page } from '@playwright/test'
import { menusClosed, open, sketchArray, sketchList, sketchTree, withEditor } from './helpers'

// Track with code, a board's setting (main menu): the code beside every structure, a new one getting
// its own as it is drawn, and the language the board's code is in. Kept in the board.

/** Each structure's transcript boxes (by its type), and their languages. */
const transcripts = (page: Page) =>
	withEditor(page, (editor) => {
		const shapes = editor.getCurrentPageShapes()
		return shapes
			.filter((s) => s.type === 'code' && (s.props as { transcript?: boolean }).transcript)
			.map((b) => {
				const { structureId, language } = b.props as { structureId: string; language: string }
				return `${shapes.find((s) => s.id === structureId)?.type ?? 'gone'}:${language}`
			})
			.sort()
	})

/** The lines of the code beside the board's only structure of this type. */
const linesBeside = (page: Page, type: string) =>
	page.evaluate((type) => {
		const editor = window.editor!
		const shapes = editor.getCurrentPageShapes()
		const structure = shapes.find((s) => s.type === type)!
		const box = shapes.find((s) => s.type === 'code' && (s.props as { structureId?: string }).structureId === structure.id)!
		return [...document.querySelectorAll(`[data-shape-id="${box.id}"] [data-code-line]`)].map((l) => l.textContent)
	}, type)

const withoutPickers = () => {
	delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
	delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
}

const mode = (page: Page) => withEditor(page, (editor) => editor.getDocumentSettings().meta.drawdsCode ?? null)

/**
 * Main menu > Track with code (a checkbox: the menu stays open, so close it with its button; Esc
 * would also clear the selection, an undo stop of tldraw's own).
 */
async function toggleTracking(page: Page) {
	await menusClosed(page)
	await page.getByTestId('main-menu.button').click()
	await page.getByRole('menuitemcheckbox', { name: 'Track with code' }).click()
	await page.getByTestId('main-menu.button').click()
	await menusClosed(page)
}

/** Main menu > Code language > `name`. */
async function codeIn(page: Page, name: string) {
	await menusClosed(page)
	await page.getByTestId('main-menu.button').click()
	await page.getByRole('menuitem', { name: 'Code language' }).click()
	await page.getByRole('menuitemcheckbox', { name, exact: true }).click()
	await page.getByTestId('main-menu.button').click()
	await menusClosed(page)
}

test.beforeEach(({ page }) => open(page))

test('on: the code beside every structure, and a new one gets its own in the undo step that drew it; off takes them away', async ({ page }) => {
	await sketchArray(page, [200, 150], 4)
	await sketchList(page, [200, 400], 3)
	expect(await transcripts(page)).toEqual([])
	await toggleTracking(page)
	expect(await mode(page)).toEqual({ on: true })
	await expect.poll(() => transcripts(page)).toEqual(['array:java', 'linked-list:java'])
	await page.keyboard.press('Escape')

	// Drawn while tracking: its code comes when the drag ends, beside where it ended.
	await sketchTree(page, [300, 600], 2, 1)
	await expect.poll(() => transcripts(page)).toEqual(['array:java', 'binary-tree:java', 'linked-list:java'])
	const [tree, box] = await withEditor(page, (editor) => {
		const shapes = editor.getCurrentPageShapes()
		const tree = shapes.find((s) => s.type === 'binary-tree')!
		const box = shapes.find((s) => (s.props as { structureId?: string }).structureId === tree.id)!
		const bounds = (id: typeof tree.id) => {
			const { minX, minY, maxX } = editor.getShapePageBounds(id)!
			return { minX, minY, maxX }
		}
		return [bounds(tree.id), bounds(box.id)]
	})
	expect(box.minX).toBeGreaterThan(tree.maxX)
	expect(box.minY).toBeCloseTo(tree.minY, 0)
	expect((await linesBeside(page, 'binary-tree'))[0]).toMatch(/^Tree c = new Tree\(/)

	// One undo takes the tree and its code; redo brings both back, and no second box.
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => transcripts(page)).toEqual(['array:java', 'linked-list:java'])
	expect(await withEditor(page, (editor) => editor.getCurrentPageShapes().some((s) => s.type === 'binary-tree'))).toBe(false)
	await page.keyboard.press('ControlOrMeta+Shift+z')
	await page.waitForTimeout(100)
	expect(await transcripts(page)).toEqual(['array:java', 'binary-tree:java', 'linked-list:java'])

	// Off: every structure's code goes (one undo step brings it back), and new structures come without.
	await toggleTracking(page)
	expect(await mode(page)).toEqual({ on: false })
	await expect.poll(() => transcripts(page)).toEqual([])
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => transcripts(page)).toHaveLength(3)
	// The setting is the board's, not an undo step.
	expect(await mode(page)).toEqual({ on: false })
	await sketchArray(page, [200, 820], 2)
	await page.waitForTimeout(100)
	expect(await transcripts(page)).toHaveLength(3)
})

test('the board’s language: the code beside its structures switches, and it stays with the board', async ({ page, browser }) => {
	await sketchArray(page, [200, 150], 3)
	// A code box typed by the teacher is its own: it keeps its language.
	await withEditor(page, (editor) => void editor.createShape({ type: 'code', x: 200, y: 500, props: { code: 'x = 1', language: 'python' } } as never))
	await toggleTracking(page)
	await expect.poll(() => transcripts(page)).toEqual(['array:java'])
	await codeIn(page, 'Python')
	expect(await mode(page)).toEqual({ on: true, language: 'python' })
	await expect.poll(() => transcripts(page)).toEqual(['array:python'])
	expect((await linesBeside(page, 'array'))[0]).toMatch(/^a = \[\d+, \d+, \d+\]$/)
	// Bubble sort's code beside the array (as the play bar's </> shows it), and a copy typed into.
	await page.evaluate(async () => {
		const editor = window.editor!
		const { algorithmCode } = await import('/src/shapes/code/algorithms.ts' as string)
		const array = editor.getCurrentPageShapes().find((s) => s.type === 'array')!
		const code = algorithmCode('bubble-sort', 'python').text as string
		for (const [y, text] of [[300, code], [450, `${code}\n# mine`]] as const)
			editor.createShape({ type: 'code', x: 600, y, props: { structureId: array.id, algorithm: 'bubble-sort', code: text, language: 'python' } } as never)
	})
	await codeIn(page, 'C')
	await expect.poll(() => transcripts(page)).toEqual(['array:c'])
	const algorithms = await withEditor(page, (editor) =>
		editor
			.getCurrentPageShapes()
			.filter((s) => (s.props as { algorithm?: string }).algorithm)
			.map((s) => {
				const { language, code } = s.props as { language: string; code: string }
				return `${language}: ${code.split('\n')[0]}`
			})
	)
	expect(algorithms).toEqual(['c: void bubbleSort(int a[], int n) {', 'python: def bubble_sort(a):'])
	// The teacher's own box follows nothing: still Python.
	expect(await withEditor(page, (editor) => editor.getCurrentPageShapes().filter((s) => s.type === 'code' && !(s.props as { structureId?: string }).structureId).map((s) => (s.props as { language: string }).language))).toEqual(['python'])
	// Undo puts the boxes' language back; the board's stays.
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => transcripts(page)).toEqual(['array:python'])
	expect(await mode(page)).toEqual({ on: true, language: 'c' })
	await codeIn(page, 'Python')

	// A reload (once tldraw has written the board to IndexedDB: it waits a moment): still tracking, in
	// Python; a new structure gets its code in it.
	await page.waitForTimeout(1000)
	// Save downloads (no File System Access pickers), as e2e/board-files.e2e.ts does.
	await page.addInitScript(withoutPickers)
	await page.reload()
	await page.waitForFunction(() => !!window.editor)
	expect(await mode(page)).toEqual({ on: true, language: 'python' })
	await sketchList(page, [200, 650], 2)
	await expect.poll(() => transcripts(page)).toEqual(['array:python', 'linked-list:python'])
	await page.getByTestId('main-menu.button').click()
	await expect(page.getByRole('menuitemcheckbox', { name: 'Track with code' })).toHaveAttribute('aria-checked', 'true')
	await page.keyboard.press('Escape')

	// A board file: the setting goes with it to another browser.
	await menusClosed(page)
	await page.getByTestId('main-menu.button').click()
	const downloading = page.waitForEvent('download')
	await page.getByTestId('main-menu.drawds.save-board').click()
	const path = test.info().outputPath('board.tldr')
	await (await downloading).saveAs(path)
	const context = await browser.newContext(test.info().project.use)
	const fresh = await context.newPage()
	await fresh.addInitScript(withoutPickers)
	await open(fresh)
	expect(await mode(fresh)).toBeNull()
	await fresh.getByTestId('main-menu.button').click()
	const choosing = fresh.waitForEvent('filechooser')
	await fresh.getByTestId('main-menu.drawds.open-board').click()
	await (await choosing).setFiles(path)
	await expect(fresh.getByText('Opened board.tldr', { exact: true })).toBeVisible()
	expect(await mode(fresh)).toEqual({ on: true, language: 'python' })
	// Opening it put in no boxes of its own: just the ones it was saved with.
	expect(await transcripts(fresh)).toEqual(['array:python', 'linked-list:python'])
	await sketchTree(fresh, [800, 150], 2, 1)
	await expect.poll(() => transcripts(fresh)).toEqual(['array:python', 'binary-tree:python', 'linked-list:python'])
	await context.close()
})
