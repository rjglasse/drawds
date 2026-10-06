import { expect, test, type Page } from '@playwright/test'
import { insertKey, open, rightClick, sketchArray, sketchTree, withEditor } from './helpers'

const counter = (page: Page) => page.getByTestId('play-counter')
const caption = (page: Page) => page.getByTestId('play-caption')

const treeValues = (page: Page) =>
	withEditor(page, (e) => (e.getCurrentPageShapes().find((s) => s.type === 'binary-tree')!.props as { nodes: { value: string }[] }).nodes.map((n) => n.value))

const lesson = (page: Page) =>
	withEditor(page, (e) => ((e.getDocumentSettings().meta.drawdsLesson ?? []) as { label: string; structure: string; outcome?: string }[]).map((x) => [x.label, x.structure, x.outcome]))

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

/** A BST 50 / 30 70 / 20 40 60 80, selected. */
async function bst(page: Page) {
	await page.keyboard.press('Shift+T')
	await page.getByTestId('style.tree-kind.bst').click()
	await sketchTree(page, [500, 150], 3, 1)
	await withEditor(page, (e) => {
		const s = e.getOnlySelectedShape()!
		const n = (id: string, value: string, l: string | null, r: string | null) => ({ id, value, children: [l, r], dx: 0, dy: 0 })
		e.updateShape({
			id: s.id,
			type: s.type,
			props: { nodes: [n('n', '50', 'nL', 'nR'), n('nL', '30', 'nLL', 'nLR'), n('nR', '70', 'nRL', 'nRR'), n('nLL', '20', null, null), n('nLR', '40', null, null), n('nRL', '60', null, null), n('nRR', '80', null, null)] },
		} as never)
	})
}

/** Insert into the BST, step to the result, Done. */
async function insert(page: Page, key: string) {
	await withEditor(page, (e) => void e.select(e.getCurrentPageShapes().find((s) => s.type === 'binary-tree')!.id))
	await insertKey(page, key)
	await stepToEnd(page)
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
}

/** Three operations on two structures: insert 45 (done), a bubble sort cancelled at step 3, insert 10 (done). */
async function teach(page: Page) {
	await bst(page)
	await insert(page, '45')
	await sketchArray(page, [200, 500], 4)
	await rightClick(page, [200, 500])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await page.getByTestId('context-menu.array-bubble-sort').click()
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('Escape')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	await insert(page, '10')
}

async function openLog(page: Page) {
	await page.getByTestId('main-menu.button').click()
	await page.getByTestId('main-menu.drawds.lesson-log').click()
}

test.beforeEach(({ page }) => open(page))

test('every operation played is logged; one replays as it was, and the board comes back with nothing to undo', async ({ page }) => {
	await teach(page)
	expect(await lesson(page)).toEqual([
		['insert key', 'binary-tree', 'done'],
		['bubble sort', 'array', 'cancelled'],
		['insert key', 'binary-tree', 'done'],
	])
	await openLog(page)
	await expect(page.getByTestId('lesson-entry-1')).toContainText('cancelled at step 3')
	await page.getByTestId('lesson-replay-0').click()
	// The tree as it was then: neither 45 nor 10 in it yet.
	await expect(counter(page)).toHaveText('1/3')
	await expect(caption(page)).toHaveText('45 < 50: go left')
	expect(await treeValues(page)).toEqual(['50', '30', '70', '20', '40', '60', '80'])
	await stepToEnd(page)
	expect(await treeValues(page)).toContain('45')
	expect(await treeValues(page)).not.toContain('10')
	// Closing it puts the board back as it is; a replay is never an undo step, and isn't logged.
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	expect(await treeValues(page)).toEqual(['50', '30', '70', '20', '40', '60', '80', '45', '10'])
	expect(await lesson(page)).toHaveLength(3)
	await page.keyboard.press('ControlOrMeta+z')
	await expect.poll(() => treeValues(page)).toEqual(['50', '30', '70', '20', '40', '60', '80', '45'])
})

test('the whole lesson exports in order, every step with when it was shown, to line up with a transcript', async ({ page }) => {
	await teach(page)
	const { manifest, files } = (await page.evaluate(() => window.drawdsLesson!({ format: 'svg' }))) as {
		manifest: { operations: { folder: string; outcome: string; startedAt: string; steps: { file: string; caption: string; shownAt: string[] }[] }[] }
		files: { path: string }[]
	}
	const ops = manifest.operations
	expect(ops.map((op) => [op.folder.replace(/^(\d+)-\d{4}-/, '$1-'), op.outcome])).toEqual([
		['01-insert-key', 'done'],
		['02-bubble-sort', 'cancelled'],
		['03-insert-key', 'done'],
	])
	expect(ops[0].steps.map((s) => s.caption)).toEqual(['45 < 50: go left', '45 > 30: go right', '45 > 40, which has no right child: 45 goes there'])
	expect(Date.parse(ops[0].startedAt)).toBeLessThan(Date.parse(ops[2].startedAt))
	// Shown live: every step of the inserts; the cancelled sort only up to step 3.
	expect(ops[0].steps.every((s) => s.shownAt.length === 1)).toBe(true)
	expect(ops[1].steps.map((s) => s.shownAt.length > 0)).toEqual(ops[1].steps.map((_, i) => i < 3))
	expect(files.map((f) => f.path)).toEqual(ops.flatMap((op) => op.steps.map((s) => s.file)))
	// Exporting changed nothing on the board.
	expect(await treeValues(page)).toEqual(['50', '30', '70', '20', '40', '60', '80', '45', '10'])
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
})

test('the log is saved with the board: open it again and the lesson is there to replay', async ({ page }) => {
	await page.evaluate(() => {
		const w = window as unknown as { __file: string; showSaveFilePicker: unknown; showOpenFilePicker: unknown }
		const handle = {
			name: 'lesson.tldr',
			getFile: async () => new File([w.__file], 'lesson.tldr'),
			createWritable: async () => {
				let data = ''
				return { write: async (b: Blob) => void (data += await b.text()), close: async () => void (w.__file = data) }
			},
		}
		w.showSaveFilePicker = async () => handle
		w.showOpenFilePicker = async () => [handle]
	})
	await teach(page)
	await page.keyboard.press('ControlOrMeta+s')
	await expect.poll(() => page.evaluate(() => (window as unknown as { __file?: string }).__file?.length ?? 0)).toBeGreaterThan(0)
	// A different board in between: nothing on it, no lesson.
	await withEditor(page, (e) => {
		e.deleteShapes([...e.getCurrentPageShapeIds()])
		e.updateDocumentSettings({ meta: {} })
	})
	expect(await lesson(page)).toEqual([])
	await page.keyboard.press('ControlOrMeta+o')
	await expect.poll(() => lesson(page)).toHaveLength(3)
	await openLog(page)
	await page.getByTestId('lesson-replay-2').click()
	await expect(caption(page)).toHaveText('10 < 50: go left')
	expect(await treeValues(page)).toContain('45')
	expect(await treeValues(page)).not.toContain('10')
})
