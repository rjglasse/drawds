import { expect, test, type Page } from '@playwright/test'
import { arrayStep, CELL, open, rightClick, shapesOfType, sketchArray, transitionsDone } from './helpers'

const caption = (page: Page) => page.getByTestId('play-caption')
const arrays = async (page: Page) => (await shapesOfType<{ values: string[] }>(page, 'array')).map((s) => s.props.values.join(' '))

/** Two arrays, a's first cell at (200, 200), b's at (200, 360), given these values. */
async function twoArrays(page: Page, a: string[], b: string[]) {
	await sketchArray(page, [200, 200], a.length)
	await sketchArray(page, [200, 360], b.length)
	await page.evaluate(
		([a, b]) => {
			const editor = window.editor!
			const [x, y] = editor.getCurrentPageShapes().filter((s) => s.type === 'array')
			editor.updateShapes([
				{ id: x.id, type: 'array', props: { values: a } },
				{ id: y.id, type: 'array', props: { values: b } },
			] as never)
		},
		[a, b]
	)
}

async function openSteps(page: Page) {
	await rightClick(page, [200, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
}

/** The middle of the step pointer j, and of b's cell `j` (screen x). */
async function jOver(page: Page, j: number) {
	const label = await page.locator('[data-pointer="j"]').boundingBox()
	const cell = await page.evaluate((j) => {
		const editor = window.editor!
		const b = editor.getCurrentPageShapes().filter((s) => s.type === 'array')[1]
		const { box } = (editor.getShapeUtil(b) as unknown as { pointerAnchor(s: unknown, k: string): { box: { x: number; y: number; w: number } } }).pointerAnchor(b, String(j))
		const page = editor.getShapePageTransform(b).applyToPoint({ x: box.x + box.w / 2, y: box.y })
		return editor.pageToScreen(page).x
	}, j)
	return { pointer: label!.x + label!.width / 2, cell }
}

test.beforeEach(({ page }) => open(page))

test('two sorted arrays merged into a new one: i on a, j on b where it is, k on c; one undo takes c away', async ({ page }) => {
	await twoArrays(page, ['1', '4', '7'], ['2', '3', '9', '12'])
	await openSteps(page)
	await arrayStep(page, 'array-merge')
	await expect(caption(page)).toHaveText('c = a new array of n + m = 3 + 4 = 7 cells: merging copies every value into it')
	await expect(page.getByTestId('array-aux')).toContainText('c: a new array of 3 + 4 = 7')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toHaveText('b[0] = 2 < a[1] = 4: c[1] = b[0] = 2')
	await expect(page.getByTestId('play-counts')).toContainText('comparisons 2')
	// b's cell lit where b is, and j above its next cell.
	const b = (await shapesOfType(page, 'array'))[1].id
	await expect(page.locator(`[data-shape-id="${b}"] .drawds-flash`)).toHaveCount(1)
	await transitionsDone(page)
	const { pointer, cell } = await jOver(page, 1)
	expect(Math.abs(pointer - cell)).toBeLessThan(CELL / 2)
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
	await expect(caption(page)).toContainText('return c: 7 values copied into new space after 5 comparisons, a and b as they were')
	await expect(page.getByTestId('play-counts')).toContainText('copies 7')
	// The result: a new array where c's row was, a and b as they were.
	expect(await arrays(page)).toEqual(['1 4 7', '2 3 9 12', '1 2 3 4 7 9 12'])
	// Stepping back or replaying, the steps fill c's row again: the new array waits for the last step.
	const c = (await shapesOfType(page, 'array'))[2].id
	const drawnC = page.locator(`[data-shape-id="${c}"] svg`)
	await expect(drawnC).not.toHaveCount(0)
	await page.keyboard.press('ArrowLeft')
	await expect(drawnC).toHaveCount(0)
	await page.keyboard.press('ArrowRight')
	await expect(drawnC).not.toHaveCount(0)
	await page.getByTestId('play-toggle').click()
	await expect(drawnC).toHaveCount(0)
	await expect(drawnC).not.toHaveCount(0, { timeout: 20_000 })
	await expect(page.getByTestId('play-counter')).toHaveText('10/10')
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('play-bar')).toHaveCount(0)
	await expect(page.locator(`[data-shape-id="${b}"] .drawds-flash`)).toHaveCount(0)
	await page.keyboard.press('ControlOrMeta+z')
	expect(await arrays(page)).toEqual(['1 4 7', '2 3 9 12'])
})

test("only sorted arrays are offered: none while the other isn't sorted", async ({ page }) => {
	await twoArrays(page, ['1', '4', '7'], ['9', '3'])
	await openSteps(page)
	await page.getByTestId('context-menu-sub.drawds-array-steps-sorts-button').click()
	await expect(page.getByTestId('context-menu.array-merge')).toHaveCount(0)
	await page.keyboard.press('Escape')
	await page.evaluate(() => {
		const editor = window.editor!
		const b = editor.getCurrentPageShapes().filter((s) => s.type === 'array')[1]
		editor.updateShape({ id: b.id, type: 'array', props: { values: ['3', '9'] } } as never)
	})
	await openSteps(page)
	await page.getByTestId('context-menu-sub.drawds-array-steps-sorts-button').click()
	await expect(page.getByTestId('context-menu.array-merge')).toHaveText('Merge with the sorted array [3, 9]')
})
