import { expect, test, type Page } from '@playwright/test'
import { nodeScreenPosition, open, sketchArray, sketchGraph, sketchHeap, sketchList, sketchTree, withEditor } from './helpers'

const CELL = 48

/** Every shape on the page, as stored, in id order. */
const shapes = (page: Page) =>
	withEditor(page, (editor) => editor.getCurrentPageShapes().slice().sort((a, b) => (a.id < b.id ? -1 : 1)))
const types = async (page: Page) => (await shapes(page)).map((s) => s.type).sort()

/** No File System Access pickers: Save downloads, Open asks with a file input (Firefox, Safari). */
const withoutPickers = () => {
	delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
	delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
}

/**
 * Pickers that hand out files from `window.__files` by name: the next one picked is
 * `window.__nextName`; every call is logged in `window.__pickers`.
 */
const fakePickers = () => {
	const w = window as unknown as {
		__files: Record<string, string>
		__pickers: [string, string?][]
		__nextName: string
		showSaveFilePicker: unknown
		showOpenFilePicker: unknown
	}
	w.__files = {}
	w.__pickers = []
	const handle = (name: string) => ({
		name,
		getFile: async () => new File([w.__files[name] ?? ''], name),
		createWritable: async () => {
			let data = ''
			return {
				write: async (blob: Blob | string) => {
					data += typeof blob === 'string' ? blob : await blob.text()
				},
				close: async () => {
					w.__files[name] = data
				},
			}
		},
	})
	w.showSaveFilePicker = async (options: { suggestedName?: string }) => {
		w.__pickers.push(['save', options.suggestedName])
		return handle(w.__nextName)
	}
	w.showOpenFilePicker = async () => {
		w.__pickers.push(['open'])
		return [handle(w.__nextName)]
	}
}

const pick = (page: Page, name: string) => page.evaluate((name) => ((window as unknown as { __nextName: string }).__nextName = name), name)
const pickers = (page: Page) => page.evaluate(() => (window as unknown as { __pickers: [string, string?][] }).__pickers)
const files = (page: Page) => page.evaluate(() => (window as unknown as { __files: Record<string, string> }).__files)
/** The shape types saved in a board file. */
const typesIn = (json: string) =>
	(JSON.parse(json).records as { typeName: string; type?: string }[])
		.filter((r) => r.typeName === 'shape')
		.map((r) => r.type)
		.sort()

test('a board with every structure saved and opened in a fresh browser comes back as it was', async ({ page, browser }) => {
	await page.addInitScript(withoutPickers)
	await open(page)
	await sketchArray(page, [200, 120], 4)
	await page.keyboard.press('Shift+M')
	await page.mouse.move(600, 120)
	await page.mouse.down()
	await page.mouse.move(600 + CELL + 10, 120 + CELL + 10, { steps: 20 })
	await page.mouse.up()
	await sketchList(page, [200, 300], 3)
	await sketchTree(page, [1000, 120], 3, 1)
	await sketchHeap(page, [200, 480], 4)
	await page.keyboard.press('Shift+B')
	await page.mouse.move(700, 450)
	await page.mouse.down()
	await page.mouse.move(700, 450 + 3 * CELL + 10, { steps: 20 })
	await page.mouse.up()
	await sketchGraph(page, [950, 450], 4)
	await page.mouse.click(...(await nodeScreenPosition(page, 'v0')), { button: 'right' })
	await page.getByTestId('context-menu-sub.drawds-graph-views-button').click()
	await page.getByTestId('context-menu.graph-show-matrix').click()
	// Marks, a pointer and a style on the array.
	await withEditor(page, (editor) => {
		const array = editor.getCurrentPageShapes().find((s) => s.type === 'array')!
		editor.updateShape({
			id: array.id,
			type: 'array',
			props: { marks: { 0: 'red', 2: 'green' }, pointers: [{ id: 'p1', name: 'i', at: '1' }], color: 'blue' },
		} as never)
	})
	const before = await shapes(page)
	expect(before.map((s) => s.type).sort()).toEqual(['array', 'binary-tree', 'graph', 'graph-view', 'hash-table', 'heap', 'linked-list', 'matrix'])

	await page.getByTestId('main-menu.button').click()
	const downloading = page.waitForEvent('download')
	await page.getByTestId('main-menu.drawds.save-board').click()
	const download = await downloading
	expect(download.suggestedFilename()).toBe('board.tldr')
	const path = test.info().outputPath('board.tldr')
	await download.saveAs(path)
	await expect(page.getByText('Saved board.tldr', { exact: true })).toBeVisible()

	// A fresh profile: nothing in IndexedDB, so the board can only come from the file.
	const context = await browser.newContext(test.info().project.use)
	const fresh = await context.newPage()
	await fresh.addInitScript(withoutPickers)
	await open(fresh)
	expect(await shapes(fresh)).toEqual([])
	// From the menu (the shortcuts are tested below; a fresh page's canvas may not have focus yet).
	await fresh.getByTestId('main-menu.button').click()
	const choosing = fresh.waitForEvent('filechooser')
	await fresh.getByTestId('main-menu.drawds.open-board').click()
	await (await choosing).setFiles(path)
	await expect(fresh.getByText('Opened board.tldr', { exact: true })).toBeVisible()
	expect(await shapes(fresh)).toEqual(before)
	await expect(fresh).toHaveTitle('board · drawds')
	await context.close()
})

test('Save asks where once, then writes back to that file; Save as asks again', async ({ page }) => {
	await page.addInitScript(fakePickers)
	await open(page)
	await sketchArray(page, [300, 200], 3)
	await pick(page, 'arrays.tldr')
	await page.keyboard.press('ControlOrMeta+s')
	await expect(page.getByText('Saved arrays.tldr', { exact: true })).toBeVisible()
	expect(await pickers(page)).toEqual([['save', 'board.tldr']])
	expect(typesIn((await files(page))['arrays.tldr'])).toEqual(['array'])
	await expect(page).toHaveTitle('arrays · drawds')

	await sketchList(page, [300, 400], 2)
	await page.keyboard.press('ControlOrMeta+s')
	await expect.poll(async () => typesIn((await files(page))['arrays.tldr'])).toEqual(['array', 'linked-list'])
	expect(await pickers(page)).toHaveLength(1)

	await pick(page, 'copy.tldr')
	await page.keyboard.press('ControlOrMeta+Shift+s')
	await expect(page.getByText('Saved copy.tldr', { exact: true })).toBeVisible()
	expect(await pickers(page)).toEqual([
		['save', 'board.tldr'],
		['save', 'arrays.tldr'],
	])
	expect(typesIn((await files(page))['copy.tldr'])).toEqual(['array', 'linked-list'])
	await expect(page).toHaveTitle('copy · drawds')
})

test('opening a board is one undo step: undo brings back the board you had, still saving to its own file', async ({ page }) => {
	await page.addInitScript(fakePickers)
	await open(page)
	await sketchArray(page, [300, 200], 3)
	await pick(page, 'arrays.tldr')
	await page.keyboard.press('ControlOrMeta+s')
	await expect(page.getByText('Saved arrays.tldr', { exact: true })).toBeVisible()
	const arrays = (await files(page))['arrays.tldr']

	// Another board, saved to its own file.
	await withEditor(page, (editor) => void editor.deleteShapes([...editor.getCurrentPageShapeIds()]))
	await sketchTree(page, [600, 150], 2, 1)
	await pick(page, 'trees.tldr')
	await page.keyboard.press('ControlOrMeta+Shift+s')
	await expect(page.getByText('Saved trees.tldr', { exact: true })).toBeVisible()
	const tree = await shapes(page)

	await pick(page, 'arrays.tldr')
	await page.keyboard.press('ControlOrMeta+o')
	await expect(page.getByText('Opened arrays.tldr', { exact: true })).toBeVisible()
	await expect(page.getByText('The board you had is one undo away.', { exact: true })).toBeVisible()
	expect(await types(page)).toEqual(['array'])
	await expect(page).toHaveTitle('arrays · drawds')

	await page.getByRole('button', { name: 'Undo', exact: true }).click()
	expect(await shapes(page)).toEqual(tree)
	await expect(page).toHaveTitle('trees · drawds')
	// Save goes to the tree's file, never over the board just opened.
	await page.keyboard.press('ControlOrMeta+s')
	await expect.poll(() => pickers(page)).toHaveLength(3)
	expect((await pickers(page)).map(([kind]) => kind)).toEqual(['save', 'save', 'open'])
	expect(typesIn((await files(page))['trees.tldr'])).toEqual(['binary-tree'])
	expect((await files(page))['arrays.tldr']).toBe(arrays)

	await page.keyboard.press('ControlOrMeta+Shift+z')
	expect(await types(page)).toEqual(['array'])
})

test('a board saved by an older drawds opens with its shapes migrated', async ({ page }) => {
	await page.addInitScript(fakePickers)
	await open(page)
	await sketchArray(page, [300, 200], 3)
	await pick(page, 'old.tldr')
	await page.keyboard.press('ControlOrMeta+s')
	await expect(page.getByText('Saved old.tldr', { exact: true })).toBeVisible()
	// Rewrite the file as the first release saved arrays: version 0, no fill or seed.
	const file = JSON.parse((await files(page))['old.tldr'])
	file.schema.sequences['com.tldraw.shape.array'] = 0
	for (const record of file.records) {
		if (record.typeName !== 'shape') continue
		delete record.props.fill
		delete record.props.seed
		record.props.values = ['3', '1', '4']
	}
	await page.evaluate((json) => ((window as unknown as { __files: Record<string, string> }).__files['old.tldr'] = json), JSON.stringify(file))
	await withEditor(page, (editor) => void editor.deleteShapes([...editor.getCurrentPageShapeIds()]))

	await page.keyboard.press('ControlOrMeta+o')
	await expect(page.getByText('Opened old.tldr', { exact: true })).toBeVisible()
	expect((await shapes(page)).map((s) => s.props)).toEqual([expect.objectContaining({ values: ['3', '1', '4'], fill: 'random', seed: 0 })])
})

test('a file that is not a board leaves the board alone and says why', async ({ page }) => {
	await page.addInitScript(fakePickers)
	await open(page)
	await sketchArray(page, [300, 200], 3)
	const before = await shapes(page)
	await page.evaluate(() => ((window as unknown as { __files: Record<string, string> }).__files['notes.tldr'] = 'just some notes'))
	await pick(page, 'notes.tldr')
	await page.keyboard.press('ControlOrMeta+o')
	await expect(page.getByText('Could not open notes.tldr', { exact: true })).toBeVisible()
	await expect(page.getByText('It isn’t a drawds board (.tldr).', { exact: true })).toBeVisible()
	expect(await shapes(page)).toEqual(before)
})

test('the keyboard shortcuts dialog lists the board files', async ({ page }) => {
	await open(page)
	await page.keyboard.press('ControlOrMeta+Alt+/')
	const dialog = page.getByRole('dialog')
	await expect(dialog.getByText('Open board…')).toBeVisible()
	await expect(dialog.getByText('Save board', { exact: true })).toBeVisible()
	await expect(dialog.getByText('Save board as…')).toBeVisible()
})

test('Ctrl+S while typing in a cell saves the board, value and all, and the typing goes on', async ({ page }) => {
	await page.addInitScript(fakePickers)
	await open(page)
	await sketchArray(page, [300, 200], 3)
	await page.mouse.dblclick(300, 200)
	await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Cell 0')
	await page.keyboard.type('42')
	await pick(page, 'typed.tldr')
	await page.keyboard.press('ControlOrMeta+s')
	await expect(page.getByText('Saved typed.tldr', { exact: true })).toBeVisible()
	const saved = JSON.parse((await files(page))['typed.tldr']).records.find((r: { type?: string }) => r.type === 'array')
	expect(saved.props.values[0]).toBe('42')
	// Still in the cell: Tab moves on to the next one.
	expect(await page.evaluate(() => window.editor!.getEditingShapeId())).not.toBeNull()
	await page.keyboard.press('Tab')
	await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Cell 1')
})

test('Ctrl+O while typing in a cell ends the edit and opens a board', async ({ page }) => {
	await page.addInitScript(fakePickers)
	await open(page)
	await sketchTree(page, [600, 150], 2, 1)
	await pick(page, 'trees.tldr')
	await page.keyboard.press('ControlOrMeta+s')
	await expect(page.getByText('Saved trees.tldr', { exact: true })).toBeVisible()
	await withEditor(page, (editor) => void editor.deleteShapes([...editor.getCurrentPageShapeIds()]))
	await sketchArray(page, [300, 200], 3)
	await page.mouse.dblclick(300, 200)
	await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Cell 0')
	await page.keyboard.press('ControlOrMeta+o')
	await expect(page.getByText('Opened trees.tldr', { exact: true })).toBeVisible()
	expect(await types(page)).toEqual(['binary-tree'])
	expect(await page.evaluate(() => window.editor!.getEditingShapeId())).toBeNull()
})
