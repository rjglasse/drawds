import { expect, test, type Page } from '@playwright/test'
import { arrayStep, CELL, open, rightClick, sketchArray } from './helpers'

// Lecture 4: a sum's loop invariant as a band under the cells, the sorts' recursion trees with the
// values each level works on, binary search written recursively.

async function sketch(page: Page, values: string[]) {
	await sketchArray(page, [200, 200], values.length)
	await page.evaluate((values) => {
		const editor = window.editor!
		const shape = editor.getCurrentPageShapes().find((s) => s.type === 'array')!
		editor.updateShape({ id: shape.id, type: 'array', props: { values } } as never)
	}, values)
}

async function steps(page: Page, i: number, item: string) {
	await rightClick(page, [200 + i * CELL, 200])
	await page.getByTestId('context-menu-sub.drawds-array-steps-button').click()
	await arrayStep(page, item)
}

async function stepToEnd(page: Page) {
	while (!(await page.getByTestId('play-done').count())) await page.keyboard.press('ArrowRight')
}

const caption = (page: Page) => page.getByTestId('play-caption')
const band = (page: Page) => page.getByTestId('step-band')

test.beforeEach(({ page }) => open(page))

test("the sum's loop invariant: a band under the part summed, at the beginning, the middle and the end", async ({ page }) => {
	await sketch(page, ['4', '6', '5', '8'])
	await steps(page, 0, 'array-sum-invariant')
	await expect(caption(page)).toContainText('Beginning: total = nums[0] = 4, i = 1')
	await expect(band(page)).toHaveText('total = 4')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await expect(band(page)).toHaveText('total = 4 + 6 + 5 = 15')
	// Under the first three cells, past the indices.
	const box = (await band(page).locator('path').boundingBox())!
	expect(box.width).toBeGreaterThan(2.5 * CELL)
	expect(box.width).toBeLessThan(3 * CELL)
	expect(box.y).toBeGreaterThan(200 + CELL / 2)
	await stepToEnd(page)
	await expect(caption(page)).toContainText('End: i = 4 = nums.length, so the loop stops')
	await expect(band(page)).toHaveText('total = 4 + 6 + 5 + 8 = 23')
	await page.keyboard.press('Enter')
	await expect(band(page)).toHaveCount(0)
})

test('merge sort feeds the recursion tree: each call the values it gets, each level all five values', async ({ page }) => {
	await sketch(page, ['7', '4', '1', '5', '3'])
	await steps(page, 0, 'array-merge-sort')
	const tree = page.getByTestId('recursion-tree')
	await expect(tree).toHaveCount(1)
	await stepToEnd(page)
	await expect(tree.locator('[data-call="7 4 1 5 3"]')).toContainText('= 1 3 4 5 7')
	expect(await page.locator('[data-testid="recursion-levels"] [data-level]').allTextContents()).toEqual(['5', '5', '5', '2'])
	await expect(page.locator('[data-level-total]')).toHaveText('= 17')
})

test('binary search, recursive: a chain of calls, the answer returned up it', async ({ page }) => {
	await sketch(page, ['2', '5', '8', '12', '16', '23', '38', '56'])
	await steps(page, 6, 'array-binary-search-recursive')
	await stepToEnd(page)
	const tree = page.getByTestId('recursion-tree')
	for (const call of ['binarySearch(0, 7)', 'binarySearch(4, 7)', 'binarySearch(6, 7)']) await expect(tree.locator(`[data-call="${call}"]`)).toContainText('= 6')
	await expect(caption(page)).toContainText('Found 38 at index 6: 3 calls, one per halving')
})
